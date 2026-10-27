import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { getAiCredits, useAiCredit, aiAllowed, bearerToken } from "./aiLimit.js";
import { plainResumeWording } from "./plainWording.js";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { getDocumentProxy, extractText } from "unpdf";
import {
  rulesBasedParseResume,
  rulesBasedSimplifyJd,
  rulesBasedTailorResume,
  rulesBasedAtsAudit,
  rulesBasedTailor,
  fixSplitLigatures
} from "./rulesEngine.js";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const USE_GEMINI = process.env.USE_GEMINI === "true";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initializer for Google GenAI SDK.
// Returns null when only Groq is configured, so calls go straight to the Groq fallback.
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      if (process.env.GROQ_API_KEY) return null;
      throw new Error("No AI key is set. Add GEMINI_API_KEY (and optionally GROQ_API_KEY) to your environment.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

function cleanErrorMessage(error: any): string {
  const errMsg = error.message || "";
  
  // Try to parse if it is a JSON string containing an error payload
  try {
    if (errMsg.trim().startsWith("{")) {
      const parsed = JSON.parse(errMsg.trim());
      if (parsed.error && parsed.error.message) {
        return parsed.error.message;
      }
      if (parsed.message) {
        return parsed.message;
      }
    }
  } catch (e) {
    // Ignore JSON parsing error
  }

  // Check common error keywords/status codes
  const errStr = String(error.stack || error.message || error);
  if (
    errStr.includes("experiencing high demand") || 
    errStr.includes("UNAVAILABLE") || 
    errStr.includes("503") ||
    errStr.includes("Resource has been exhausted") ||
    errStr.includes("429")
  ) {
    return "The AI model is currently experiencing high demand. Please try again in a few moments.";
  }
  
  if (errStr.includes("API key not valid") || errStr.includes("API_KEY_INVALID") || errStr.includes("403")) {
    return "The AI API key configuration is invalid. Please contact support or check settings.";
  }
  
  if (errStr.includes("safety") || errStr.includes("blocked by safety")) {
    return "The request was flagged by the AI safety filters. Please review the content.";
  }
  
  return error.message || "An unexpected error occurred.";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractTextFromPdfProxy(pdfData: any): Promise<string> {
  const numPages = pdfData.numPages;
  const leftPageTexts: string[] = [];
  const rightPageTexts: string[] = [];
  let anyColumns = false;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfData.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    if (items.length === 0) continue;

    // ── Collect (x, y, str) for every non-empty item ────────────────────────
    // width/size let us tell a real word gap from glyphs that just sit next to each other (e.g. "fi" ligatures)
    type TextItem = { x: number; y: number; str: string; hasEOL: boolean; width: number; size: number; leadSpace: boolean; trailSpace: boolean };
    const allItems: TextItem[] = items
      .map((item: any) => {
        const raw: string = item.str || '';
        return {
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          str: raw.trim(),
          hasEOL: !!item.hasEOL,
          width: typeof item.width === 'number' ? item.width : 0,
          size: Math.abs(item.transform?.[0] ?? 0) || Math.abs(item.transform?.[3] ?? 0) || 10,
          leadSpace: /^\s/.test(raw),
          trailSpace: /\s$/.test(raw)
        };
      })
      .filter(item => item.str.length > 0);

    if (allItems.length === 0) continue;

    // ── Detect a two-column layout (e.g. a sidebar with contact and skills) ──
    // Look for the widest gap between where lines start. It's a real column split only if:
    //  - it sits in the middle part of the page (20%-80% of the width),
    //  - almost no text runs across it (a full-width name or heading may),
    //  - the right side has enough lines AND they start at the same x (a column's left edge).
    //    Right-aligned dates on a normal resume start at different x's, so they don't count.
    const pageW: number = (() => { try { return page.getViewport({ scale: 1 }).width || 612; } catch { return 612; } })();
    const xValues = [...new Set(allItems.map(it => Math.round(it.x)))].sort((a, b) => a - b);
    let splitX: number | null = null;
    let spanning: TextItem[] = [];
    if (xValues.length >= 2) {
      let maxGap = 0, maxGapIdx = -1;
      for (let i = 1; i < xValues.length; i++) {
        const gap = xValues[i] - xValues[i - 1];
        if (gap > maxGap) { maxGap = gap; maxGapIdx = i; }
      }
      const candidate = maxGapIdx > 0 ? xValues[maxGapIdx] - 2 : null;
      if (candidate !== null && maxGap > pageW * 0.12) {
        const relPos = candidate / pageW;
        const crosses = (it: TextItem) => it.x < candidate && it.x + it.width > candidate + 2;
        const across = allItems.filter(crosses);
        const left = allItems.filter(it => it.x < candidate && !crosses(it));
        const right = allItems.filter(it => it.x >= candidate);
        const lines = (list: TextItem[]) => new Set(list.map(it => Math.round(it.y / 3))).size;
        const xCount = new Map<number, number>();
        right.forEach(it => xCount.set(Math.round(it.x), (xCount.get(Math.round(it.x)) || 0) + 1));
        const sharedEdge = right.length ? Math.max(...xCount.values()) / right.length : 0;
        if (relPos >= 0.2 && relPos <= 0.8 && across.length <= allItems.length * 0.15
          && lines(left) >= 3 && lines(right) >= 5 && sharedEdge >= 0.6) {
          splitX = candidate;
          spanning = across;
        }
      }
    }

    const renderColumn = (colItems: TextItem[]): string => {
      let text = '';
      let last: TextItem | null = null;
      for (const item of colItems) {
        if (last && Math.abs(item.y - last.y) > 5) {
          text += '\n';
        } else if (last && text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
          // Same line: add a space only if the PDF had one or there's a visible gap.
          // Chunks that touch (e.g. "de" + "fi" + "ne") are parts of one word.
          const gap = last.width > 0 ? item.x - (last.x + last.width) : Infinity;
          const touching = gap < Math.max(last.size, item.size) * 0.12;
          if (last.trailSpace || item.leadSpace || !touching) text += ' ';
        }
        text += item.str;
        last = item;
      }
      return text.trim();
    };

    if (splitX !== null) {
      anyColumns = true;
      const split = splitX;
      // Full-width lines (usually the name at the top) come first, then each column top to bottom
      const spanSet = new Set(spanning);
      const top = spanning.sort((a, b) => b.y - a.y || a.x - b.x);
      const leftItems  = allItems.filter(it => !spanSet.has(it) && it.x < split).sort((a, b) => b.y - a.y || a.x - b.x);
      const rightItems = allItems.filter(it => !spanSet.has(it) && it.x >= split).sort((a, b) => b.y - a.y || a.x - b.x);

      leftPageTexts.push([renderColumn(top), renderColumn(leftItems)].filter(Boolean).join("\n"));
      rightPageTexts.push(renderColumn(rightItems));
    } else {
      // Single-column page: treat as left-column text for grouping
      const sorted = allItems.sort((a, b) => b.y - a.y || a.x - b.x);
      leftPageTexts.push(renderColumn(sorted));
    }
  }

  if (anyColumns) {
    // Join all left-column blocks first, then all right-column blocks
    const leftText = leftPageTexts.filter(t => t.length > 0).join('\n\n');
    const rightText = rightPageTexts.filter(t => t.length > 0).join('\n\n');
    return fixSplitLigatures(leftText + (rightText ? '\n\n' + rightText : ''));
  } else {
    return fixSplitLigatures(leftPageTexts.filter(t => t.length > 0).join('\n\n'));
  }
}


function detectUploadedResumeType(fileName = "", fileType = ""): "pdf" | "docx" | null {
  const lowerName = fileName.toLowerCase();
  if (fileType === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return "docx";
  }
  return null;
}

function validationLog(fileName: string, message: string, details: Record<string, unknown> = {}) {
  console.log(`[Resume Validation] ${message}`, { fileName, ...details });
}

async function parseResumeWithGemini(extractedText: string, fileName: string) {
  const cleanText = normalizeWhitespace(extractedText);
  if (!cleanText) {
    return { isResume: false, detectedProfile: null, indicators: [], reason: "No readable text was extracted from the document." };
  }

  try {
    const ai = getAI();
    const prompt = `You are an expert applicant tracking system (ATS) scanner and resume parser.
Analyze the following raw text extracted from a resume document and parse it into a structured JSON object representing the candidate's profile.

Rules:
1. Extract the candidate's information as accurately as possible from the text.
2. DO NOT invent details, and DO NOT use default placeholder values (e.g. "Professional @ Various Companies", "Academic Portfolio", "High School Diploma / Degree"). If a section (like workExperience, education, projects, certifications, website, linkedin, location, languages, achievements) is not found or has no content in the text, return an empty array [] or empty string "" respectively.
3. Preserve all company names, job titles, roles, durations, and description bullet points exactly as they are described in the resume. Do not change their phrasing during parsing.
4. Preserve all projects, education details (degree, school, duration, gpa), and certifications exactly as described.
5. In workExperience, education, and projects, generate a unique string "id" for each entry (e.g., "exp-1", "exp-2", "edu-1", "proj-1").
6. STRICTLY verify if this document is actually a professional resume or curriculum vitae (CV).
   - A valid resume MUST clearly be a candidate's professional profile used for job applications, containing structured sections like Experience, Education, and Skills.
   - REJECT (isResume: false) documents that are: reports, brochures, articles, presentations, meeting notes, invoices, recipes, cover letters, random text, or general biographies.
   - If the document is NOT a resume (isResume: false), explain why in the "reason" field and return empty/null for detectedProfile.
7. ABSOLUTE FIDELITY: You must extract EVERY section, EVERY work experience, EVERY project, EVERY educational degree, EVERY certification, EVERY language, and EVERY single bullet point or description line. Do NOT summarize, truncate, shorten, rewrite, or simplify any descriptions. Keep all sentences, bullets, dates, names, achievements, and technical details EXACTLY as they are written in the original raw text. The parsed profile must be a 100% complete factual mirror of the candidate's uploaded resume.
8. NO PARSER OR DEBUG HEADINGS: Do NOT extract or include page numbers, parser-generated headers, internal labels, metadata, or document headings (e.g., "Experience Record", "Candidate Profile", "Timeline", "Professional Skills", "Page 1 of 2", "Header", "Footer") as content inside any field (such as job roles, company names, summary, bullet points, skills, or achievements). Filter these out completely.

Raw Resume Text:
"""
${cleanText}
"""

Format your response strictly as JSON matching this schema:
{
  "isResume": boolean,
  "confidenceScore": number, // 0 to 100 on how complete and professional the resume is
  "reason": "Brief explanation of the validation or indicator flags detected",
  "detectedProfile": {
    "fullName": "Candidate full name",
    "email": "Email Address",
    "phone": "Phone Number",
    "linkedin": "LinkedIn profile link or empty string if not found",
    "website": "Personal website or portfolio link or empty string if not found",
    "location": "Location (city, state, country) or empty string if not found",
    "summary": "The extracted summary text or empty string if not found",
    "workExperience": [
      {
        "id": "exp-1",
        "role": "The job title",
        "company": "The employer company",
        "duration": "Employment duration",
        "description": ["Action-oriented bullet points extracted exactly as they appear"]
      }
    ],
    "education": [
      {
        "id": "edu-1",
        "degree": "The academic degree",
        "school": "The educational institution",
        "duration": "Study duration",
        "gpa": "GPA if mentioned, or empty string"
      }
    ],
    "projects": [
      {
        "id": "proj-1",
        "name": "The project name",
        "description": ["Action-oriented bullet points extracted exactly as they appear"],
        "duration": "Project duration if mentioned, or empty string"
      }
    ],
    "certifications": ["List of certification/license names, or empty array if none"],
    "skills": ["List of technical/soft skills mentioned in the resume"],
    "languages": ["List of languages mentioned in the resume, or empty array if none"],
    "achievements": ["List of key achievements, honors, or awards mentioned in the resume, or empty array if none"]
  }
}
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isResume: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.INTEGER },
            reason: { type: Type.STRING },
            detectedProfile: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                website: { type: Type.STRING },
                location: { type: Type.STRING },
                summary: { type: Type.STRING },
                workExperience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      role: { type: Type.STRING },
                      company: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      description: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["id", "role", "company", "duration", "description"]
                  }
                },
                education: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      degree: { type: Type.STRING },
                      school: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      gpa: { type: Type.STRING }
                    },
                    required: ["id", "degree", "school", "duration"]
                  }
                },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      description: { type: Type.ARRAY, items: { type: Type.STRING } },
                      duration: { type: Type.STRING }
                    },
                    required: ["id", "name", "description"]
                  }
                },
                certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
                skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                achievements: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["fullName", "email", "phone", "summary", "workExperience", "education", "skills", "projects", "certifications", "languages", "achievements"]
            }
          },
          required: ["isResume", "confidenceScore", "reason", "detectedProfile"]
        }
      }
    });

    const resultText = response.text;
    if (resultText) {
      const parsed = JSON.parse(resultText.trim());
      const dp = parsed.detectedProfile || {};
      const indicators: string[] = [];
      if (dp.fullName) indicators.push("name");
      if (dp.email || dp.phone) indicators.push("contact");
      if (dp.education?.length) indicators.push("education");
      if (dp.workExperience?.length) indicators.push("experience");
      if (dp.skills?.length) indicators.push("skills");
      if (dp.projects?.length) indicators.push("projects");
      if (dp.certifications?.length) indicators.push("certifications");
      
      return {
        isResume: parsed.isResume,
        confidenceScore: parsed.confidenceScore,
        reason: parsed.reason,
        detectedProfile: dp,
        indicators
      };
    }
  } catch (error: any) {
    // Gemini API failed (timeout, overload, 503, etc.).
    // Fall back to heuristic validation so a genuine resume is not rejected
    // just because the AI service was temporarily unavailable.
    console.error("Gemini resume parsing failed, attempting heuristic fallback:", error);
    return heuristicResumeValidation(cleanText, fileName, error);
  }

  // Should not reach here, but guard against empty response
  return heuristicResumeValidation(cleanText, fileName, new Error("Empty response from Gemini"));
}

/**
 * Strict rules-based check to determine if a document is actually a resume.
 * Ensures a document is a resume, has contact details, has standard sections,
 * and is not an invoice, recipe, paper, cover letter, or presentation.
 */
function checkTextAgainstStrictResumeCriteria(text: string): { isResume: boolean; reason: string } {
  const cleanText = text.toLowerCase();
  
  // 1. Minimum and Maximum word count check.
  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length < 50) {
    return { isResume: false, reason: "The document is too short to be a valid resume." };
  }
  if (words.length > 3000) {
    return { isResume: false, reason: "The document is too long to be a valid resume (typically resumes are under 3,000 words)." };
  }

  // 2. Strong non-resume markers.
  // Financial/Invoices/Receipts
  if (/\b(invoice|receipt|bank statement|transaction history|amount due|payment due|billing statement|balance sheet|payment receipt)\b/i.test(cleanText)) {
    return { isResume: false, reason: "This document appears to be a financial record or invoice, not a resume." };
  }
  
  // Academic research papers / Reports / Books
  if (/\b(abstract|references|bibliography|literature review|concluding remarks|fig\.\s*\d+|table\s*\d+|table of contents|chapter \d+|index|glossary|appendix)\b/i.test(cleanText) && /\b(introduction|methodology|discussion|results)\b/i.test(cleanText)) {
    return { isResume: false, reason: "This document appears to be an academic paper, book, or report, not a resume." };
  }

  // Presentations / Slides / Meeting notes
  if (/\b(agenda|meeting minutes|slide \d+|presentation agenda|kickoff agenda|notes from meeting)\b/i.test(cleanText)) {
    return { isResume: false, reason: "This document appears to be a presentation deck, agenda, or meeting notes, not a resume." };
  }

  // Marketing/Brochures/Articles/Recipes
  if (/\b(ingredients|instructions|recipe|servings|prep time|cook time|tablespoon|teaspoon|published on|read time|subscribe|author:|written by|leave a comment|share this)\b/i.test(cleanText)) {
    return { isResume: false, reason: "This document appears to be an article, recipe, or brochure, not a resume." };
  }

  // Cover Letters (specifically standalone letters without resume sections)
  const isCoverLetterHeader = /\b(dear hiring manager|to whom it may concern|dear recruiter|dear mr\.|dear ms\.)\b/i.test(cleanText);
  const hasSignOff = /\b(sincerely|best regards|respectfully yours|warm regards)\b/i.test(cleanText);
  
  // 3. Contact Info Presence.
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cleanText);
  const hasPhone = /\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/.test(cleanText) || /\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/.test(cleanText);
  
  if (!hasEmail && !hasPhone) {
    return { isResume: false, reason: "Resumes must contain contact information (email address or phone number)." };
  }

  // 4. Typical Section Keywords.
  const hasExperience = /\b(experience|employment|work history|career)\b/i.test(cleanText);
  const hasEducation = /\b(education|university|college|degree|bachelor|master|phd|b\.s\.|b\.a\.)\b/i.test(cleanText);
  const hasSkills = /\b(skills|technologies|programming|expertise|competencies|tools)\b/i.test(cleanText);
  
  // Resumes almost always contain multiple years/dates for employment and education
  const dateMatches = cleanText.match(/\b(19\d{2}|20\d{2})\b/g);
  const hasDates = dateMatches && dateMatches.length >= 2;

  // A valid resume must match at least 3 of these critical indicators (Exp, Edu, Skills, Dates).
  const sectionScore = [hasExperience, hasEducation, hasSkills, hasDates].filter(Boolean).length;
  if (sectionScore < 3) {
    return { isResume: false, reason: "This document does not contain enough typical resume indicators (such as structured Experience, Education, Skills, and Dates)." };
  }

  // If it has cover letter markers but NO experience section, it's just a cover letter.
  if (isCoverLetterHeader && hasSignOff && !hasExperience) {
    return { isResume: false, reason: "This document appears to be a Cover Letter, not a resume." };
  }

  return { isResume: true, reason: "" };
}

/**
 * Heuristic fallback for when Gemini is unavailable.
 * Uses strict rules-based validation to accept or reject the resume.
 */
function heuristicResumeValidation(cleanText: string, fileName: string, originalError: any) {
  const strictValidation = checkTextAgainstStrictResumeCriteria(cleanText);
  if (!strictValidation.isResume) {
    return {
      isResume: false,
      confidenceScore: 0,
      reason: `Gemini API unavailable (${originalError?.message || 'unknown error'}) and document validation failed: ${strictValidation.reason}`,
      detectedProfile: null,
      indicators: []
    };
  }

  // AI is unavailable (rate limit, outage): use the same rules parser as rules mode, which reads
  // jobs, education and skills far better than the old line-by-line guesswork below.
  const rulesResult = rulesBasedParseResume(cleanText, fileName);
  if (rulesResult?.detectedProfile) {
    return {
      ...rulesResult,
      isResume: true,
      confidenceScore: Math.min(rulesResult.confidenceScore ?? 80, 80),
      reason: "Parsed with the built-in parser because the AI service was unavailable."
    };
  }

  // Extract what we can heuristically using a robust rules-based parser
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Best-effort name extraction: first non-empty line that looks like a name (2-4 words, no digits, not a URL)
  let fullName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  for (const line of lines.slice(0, 5)) {
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && !/[0-9@:/]/.test(line) && line.length < 60) {
      fullName = line;
      break;
    }
  }

  // Best-effort email extraction
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Best-effort phone extraction
  const phoneMatch = cleanText.match(/\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // Classify sections and parse lines rules-based
  let currentSection = 'summary';
  const workExperience: any[] = [];
  const education: any[] = [];
  const projects: any[] = [];
  const skills: string[] = [];
  const certifications: string[] = [];
  const languages: string[] = [];
  const achievements: string[] = [];
  let summary = '';

  const sectionHeaders = {
    experience: /\b(experience|work history|employment|career|professional experience)\b/i,
    education: /\b(education|academic|university|college|school)\b/i,
    projects: /\b(projects|personal projects|academic projects|key projects)\b/i,
    skills: /\b(skills|technical skills|technologies|tools|competencies|expertise)\b/i,
    certifications: /\b(certifications?|licenses?|credentials?)\b/i,
    languages: /\b(languages)\b/i,
    achievements: /\b(achievements|awards|honors)\b/i,
    summary: /\b(summary|objective|profile|about me)\b/i
  };

  for (const line of lines) {
    let headerMatched = false;
    for (const [sec, regex] of Object.entries(sectionHeaders)) {
      if (line.length < 40 && regex.test(line) && !line.includes(':')) {
        currentSection = sec;
        headerMatched = true;
        break;
      }
    }
    if (headerMatched) continue;

    // Process section line
    if (currentSection === 'summary') {
      if (summary.length < 500) {
        summary += (summary ? ' ' : '') + line;
      }
    } else if (currentSection === 'skills') {
      const parts = line.split(/[,•|·\t]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      skills.push(...parts);
    } else if (currentSection === 'certifications') {
      certifications.push(line);
    } else if (currentSection === 'languages') {
      languages.push(line);
    } else if (currentSection === 'achievements') {
      achievements.push(line);
    } else if (currentSection === 'experience') {
      const hasDate = /\b(19|20)\d{2}\b/i.test(line) || /\b(present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line.toLowerCase());
      const isBullet = /^[-*•o▪\d+\.]/.test(line);
      
      if (hasDate && !isBullet && workExperience.length < 6) {
        let role = line;
        let company = '';
        let duration = '';
        const dateMatch = line.match(/\b(19|20)\d{2}\s*-\s*(present|\b(19|20)\d{2})\b/i) || line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(19|20)\d{2}/i);
        if (dateMatch) {
          duration = dateMatch[0];
          role = line.replace(duration, '').trim();
        }
        workExperience.push({
          id: `exp-${Date.now()}-${workExperience.length}`,
          role: role.slice(0, 50),
          company: company,
          duration: duration || '',
          description: []
        });
      } else if (workExperience.length > 0) {
        const cleanBullet = line.replace(/^[-*•o▪\d+\.]\s*/, '').trim();
        workExperience[workExperience.length - 1].description.push(cleanBullet);
      } else {
        workExperience.push({
          id: `exp-${Date.now()}-0`,
          role: '',
          company: '',
          duration: '',
          description: [line.replace(/^[-*•o▪\d+\.]\s*/, '').trim()]
        });
      }
    } else if (currentSection === 'projects') {
      const isBullet = /^[-*•o▪\d+\.]/.test(line);
      if (!isBullet && projects.length < 6) {
        projects.push({
          id: `proj-${Date.now()}-${projects.length}`,
          name: line.slice(0, 50),
          description: [],
          duration: ''
        });
      } else if (projects.length > 0) {
        projects[projects.length - 1].description.push(line.replace(/^[-*•o▪\d+\.]\s*/, '').trim());
      } else {
        projects.push({
          id: `proj-${Date.now()}-0`,
          name: '',
          description: [line.replace(/^[-*•o▪\d+\.]\s*/, '').trim()],
          duration: ''
        });
      }
    } else if (currentSection === 'education') {
      const hasDate = /\b(19|20)\d{2}\b/i.test(line);
      if (education.length < 4) {
        let degree = line;
        let school = '';
        let duration = '';
        let gpa = '';
        const gpaMatch = line.match(/gpa\s*:\s*\d+(\.\d+)?/i) || line.match(/\b\d\.\d{1,2}\b/);
        if (gpaMatch) {
          gpa = gpaMatch[0];
          degree = degree.replace(gpaMatch[0], '').trim();
        }
        education.push({
          id: `edu-${Date.now()}-${education.length}`,
          degree: degree.slice(0, 60),
          school: school,
          duration: hasDate ? line.match(/\b(19|20)\d{2}\b/g)?.join(' - ') || '' : '',
          gpa: gpa
        });
      }
    }
  }

  if (workExperience.length === 0) {
    // DO NOT invent a fake "Experience Record" section per user requirements.
    // If we couldn't heuristically find work experience, it remains empty.
  }

  const indicators: string[] = [];
  if (fullName) indicators.push('name');
  if (email || phone) indicators.push('contact');
  if (workExperience.length > 0) indicators.push('experience');
  if (education.length > 0) indicators.push('education');
  if (skills.length > 0) indicators.push('skills');

  console.log(`[Heuristic Resume Validation] Accepted "${fileName}" with sections: ${indicators.join(', ')}. Gemini error: ${originalError?.message}`);

  return {
    isResume: true,
    confidenceScore: 40,
    reason: `Parsed heuristically (Gemini temporarily unavailable: ${originalError?.message || 'unknown'}). Resume sections detected: ${indicators.join(', ')}.`,
    detectedProfile: sanitizeResumeTextFields({
      fullName,
      email,
      phone,
      linkedin: '',
      website: '',
      location: '',
      summary: summary || '',
      workExperience,
      education,
      projects,
      certifications,
      skills: skills.length > 0 ? [...new Set(skills)] : [],
      languages,
      achievements
    }),
    indicators
  };
}

function sanitizeResumeTextFields(resume: any): any {
  if (!resume) return resume;

  const debugTerms = [
    /^\s*experience\s+record\s*$/i,
    /^\s*candidate\s+profile\s*$/i,
    /^\s*timeline\s*$/i,
    /^\s*professional\s+skills\s*$/i,
    /^\s*parser-generated\s*$/i,
    /^\s*internal\s+label\s*$/i,
    /^\s*page\s+\d+\s*(of\s*\d+)?\s*$/i
  ];

  const shouldStrip = (val: string) => {
    if (typeof val !== "string") return false;
    const clean = val.trim();
    if (!clean) return true;
    return debugTerms.some(regex => regex.test(clean));
  };

  // Sanitize name, email, phone
  if (typeof resume.fullName === "string" && shouldStrip(resume.fullName)) resume.fullName = "";
  if (typeof resume.email === "string" && shouldStrip(resume.email)) resume.email = "";
  if (typeof resume.phone === "string" && shouldStrip(resume.phone)) resume.phone = "";
  if (typeof resume.summary === "string") {
    if (shouldStrip(resume.summary)) {
      resume.summary = "";
    } else {
      resume.summary = resume.summary
        .replace(/\b(Experience Record|Candidate Profile|Timeline|Professional Skills)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // Sanitize work experience
  if (Array.isArray(resume.workExperience)) {
    resume.workExperience = resume.workExperience
      .map((exp: any) => {
        if (!exp) return null;
        const role = shouldStrip(exp.role) ? "" : exp.role;
        const company = shouldStrip(exp.company) ? "" : exp.company;
        const duration = shouldStrip(exp.duration) ? "" : exp.duration;
        let description = exp.description;
        if (Array.isArray(description)) {
          description = description
            .filter((bullet: any) => typeof bullet === "string" && !shouldStrip(bullet))
            .map((bullet: string) => bullet
              .replace(/\b(Experience Record|Candidate Profile|Timeline|Professional Skills)\b/gi, "")
              .replace(/^\s*[•●▪◦‣∙·\-–—*]+\s*/, "") // bullet symbols copied from the file belong to the layout, not the text
              .trim())
            .filter((bullet: string) => bullet.length > 0);
        }
        return { ...exp, role, company, duration, description };
      })
      .filter((exp: any) => exp && (exp.role || exp.company || (exp.description && exp.description.length > 0)));
  }

  // Sanitize projects
  if (Array.isArray(resume.projects)) {
    resume.projects = resume.projects
      .map((proj: any) => {
        if (!proj) return null;
        const name = shouldStrip(proj.name) ? "" : proj.name;
        const duration = shouldStrip(proj.duration) ? "" : proj.duration;
        let description = proj.description;
        if (Array.isArray(description)) {
          description = description
            .filter((bullet: any) => typeof bullet === "string" && !shouldStrip(bullet))
            .map((bullet: string) => bullet
              .replace(/\b(Experience Record|Candidate Profile|Timeline|Professional Skills)\b/gi, "")
              .replace(/^\s*[•●▪◦‣∙·\-–—*]+\s*/, "") // bullet symbols copied from the file belong to the layout, not the text
              .trim())
            .filter((bullet: string) => bullet.length > 0);
        }
        return { ...proj, name, duration, description };
      })
      .filter((proj: any) => proj && (proj.name || (proj.description && proj.description.length > 0)));
  }

  // Sanitize skills
  if (Array.isArray(resume.skills)) {
    resume.skills = resume.skills
      .filter((skill: any) => typeof skill === "string" && !shouldStrip(skill))
      .map((skill: string) => skill.trim());
  }

  // Sanitize certifications
  if (Array.isArray(resume.certifications)) {
    resume.certifications = resume.certifications
      .filter((cert: any) => typeof cert === "string" && !shouldStrip(cert))
      .map((cert: string) => cert.trim());
  }

  // Sanitize languages
  if (Array.isArray(resume.languages)) {
    resume.languages = resume.languages
      .filter((lang: any) => typeof lang === "string" && !shouldStrip(lang))
      .map((lang: string) => lang.trim());
  }

  // Sanitize achievements
  if (Array.isArray(resume.achievements)) {
    resume.achievements = resume.achievements
      .filter((ach: any) => typeof ach === "string" && !shouldStrip(ach))
      .map((ach: string) => ach.trim());
  }

  return resume;
}

// ── AI providers: Gemini first, Groq as automatic fallback ─────────────────
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_TIMEOUT_MS = 25000; // stay well inside Vercel's 60s function budget
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");

// Gemini's responseSchema uses Type enums ("OBJECT", "STRING", ...). Convert to plain JSON Schema
// so we can show Groq exactly which JSON shape to return.
function geminiSchemaToJsonSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(geminiSchemaToJsonSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && typeof v === "string") out.type = v.toLowerCase();
    else out[k] = geminiSchemaToJsonSchema(v);
  }
  return out;
}

// Groq's text model can't read images, so only text-only requests can fall back.
function extractPromptText(contents: any): string | null {
  if (typeof contents === "string") return contents;
  const parts: any[] = Array.isArray(contents) ? contents : [contents];
  const texts: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string") { texts.push(part); continue; }
    if (part.inlineData) return null;
    if (typeof part.text === "string") { texts.push(part.text); continue; }
    if (Array.isArray(part.parts)) {
      const inner = extractPromptText(part.parts);
      if (inner === null) return null;
      texts.push(inner);
    }
  }
  return texts.join("\n\n");
}

async function generateWithGroq(options: any): Promise<{ text: string; provider: "groq" }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const prompt = extractPromptText(options.contents);
  if (prompt === null) throw new Error("This request includes images, which the Groq fallback can't read.");

  const schema = options.config?.responseSchema ? geminiSchemaToJsonSchema(options.config.responseSchema) : null;
  const system = [
    "You are a careful assistant that replies with a single valid JSON object and nothing else.",
    schema ? `The JSON must match this JSON Schema exactly (same keys, types and required fields):\n${JSON.stringify(schema)}` : ""
  ].filter(Boolean).join("\n\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const r = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`Groq request failed (${r.status}): ${body.slice(0, 200)}`);
    }
    const data: any = await r.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") throw new Error("Groq returned an empty response");
    JSON.parse(text); // make sure callers get parseable JSON, or fail here and report it
    return { text, provider: "groq" };
  } finally {
    clearTimeout(timer);
  }
}

async function generateContentWithRetry(ai: GoogleGenAI | null, options: any, maxRetries = 2): Promise<any> {
  let geminiError: any = null;

  if (ai) {
    let delay = 500; // start with 500ms to stay within Vercel 60s budget
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await ai.models.generateContent(options);
      } catch (error: any) {
        const errStr = String(error.stack || error.message || error);
        const isRetryable =
          errStr.includes("experiencing high demand") ||
          errStr.includes("UNAVAILABLE") ||
          errStr.includes("503") ||
          errStr.includes("Resource has been exhausted") ||
          errStr.includes("429");

        if (isRetryable && attempt < maxRetries) {
          console.warn(`Gemini API busy (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff: 500ms -> 1000ms
          continue;
        }
        geminiError = error;
        break;
      }
    }
  }

  // Gemini failed (rate limit, outage, bad key) or isn't configured: try Groq.
  if (process.env.GROQ_API_KEY) {
    const reason = geminiError ? String(geminiError.message || geminiError).slice(0, 120) : "no Gemini key";
    console.warn(`[AI] Falling back to Groq (${GROQ_MODEL}): ${reason}`);
    try {
      return await generateWithGroq(options);
    } catch (groqError: any) {
      console.error("[AI] Groq fallback failed:", String(groqError?.message || groqError).slice(0, 300));
      throw geminiError || groqError;
    }
  }

  throw geminiError || new Error("No AI provider is configured.");
}

// 1. Simplify Job Description API
/**
 * The AI sometimes returns a JD analysis with no title or skills, or wrongly calls a real JD invalid.
 * Fill those gaps from the rules reader so tailoring never runs with an empty job description.
 */
function withRulesSafetyNet(ai: any, jdText?: string) {
  const result = { ...(ai || {}) };
  const skillCount = Array.isArray(result.requiredSkills) ? result.requiredSkills.length : 0;
  console.log("[simplify-jd] AI result:", { isValidJd: result.isValidJd, jobTitle: result.jobTitle, skills: skillCount });
  if (!jdText) return result; // screenshots: nothing for the rules reader to read
  const rules: any = rulesBasedSimplifyJd(jdText);
  if (result.isValidJd === false && rules.isValidJd) {
    console.log("[simplify-jd] AI called it invalid, rules reader says it is a JD; using rules result. AI reason:", result.invalidReason);
    return { ...rules, aiInvalidReason: result.invalidReason };
  }
  if (result.isValidJd === false) return result;
  // AI said "valid" but found nothing, and the rules reader doesn't see a JD either: treat as invalid
  if (skillCount === 0 && !String(result.jobTitle || "").trim() && !rules.isValidJd) return rules;
  if (!String(result.jobTitle || "").trim()) result.jobTitle = rules.jobTitle;
  if (skillCount < 3) {
    const have = new Set((result.requiredSkills || []).map((x: any) => String(x?.name || "").toLowerCase()));
    result.requiredSkills = [...(result.requiredSkills || []), ...(rules.requiredSkills || []).filter((x: any) => !have.has(String(x.name).toLowerCase()))];
    console.log("[simplify-jd] AI found too few skills; added rules skills:", result.requiredSkills.length);
  }
  if (!Array.isArray(result.keywordsToTarget) || result.keywordsToTarget.length === 0) result.keywordsToTarget = rules.keywordsToTarget;
  if (!Array.isArray(result.keyResponsibilities) || result.keyResponsibilities.length === 0) result.keyResponsibilities = rules.keyResponsibilities;
  return result;
}

// How many AI tailorings the signed-in person has left today (for the app to show)
app.get("/api/ai-credits", async (req, res) => {
  if (!USE_GEMINI) { res.json({ aiEnabled: false }); return; }
  const credits = await getAiCredits(bearerToken(req));
  res.json({ aiEnabled: true, ...credits });
});

app.post("/api/simplify-jd", async (req, res) => {
  try {
    let { jdText, jdImageBase64, jdImagesBase64, fileBase64, fileName, fileType } = req.body;

    if (fileBase64) {
      let isPdf = false;
      let isDocx = false;
      if (fileType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith(".pdf"))) {
        isPdf = true;
      } else if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || (fileName && fileName.toLowerCase().endsWith(".docx"))) {
        isDocx = true;
      }

      if (isPdf) {
        try {
          const buffer = Buffer.from(fileBase64, "base64");
          const pdfData = await getDocumentProxy(new Uint8Array(buffer));
          jdText = await extractTextFromPdfProxy(pdfData);
        } catch (err: any) {
          console.error("PDF text extraction failed for JD:", err);
          res.status(500).json({ error: "Failed to extract text from PDF job description." });
          return;
        }
      } else if (isDocx) {
        try {
          const buffer = Buffer.from(fileBase64, "base64");
          const extractResult = await mammoth.extractRawText({ buffer });
          jdText = extractResult.value || "";
        } catch (err: any) {
          console.error("Mammoth extraction failed for JD:", err);
          res.status(500).json({ error: "Failed to extract text from DOCX job description." });
          return;
        }
      }
    }

    const hasImages = (jdImagesBase64 && jdImagesBase64.length > 0) || jdImageBase64;
    if (!jdText && !hasImages) {
      res.status(400).json({ error: "Either job description text, document, or screenshot images are required" });
      return;
    }

    // Reading the job post doesn't use up a credit, but once today's AI tailorings are gone it uses the rules reader too
    const credits = USE_GEMINI ? await getAiCredits(bearerToken(req)) : null;
    const useRules = !USE_GEMINI || (credits && !aiAllowed(credits));
    if (useRules) {
      if (!jdText) {
        res.status(400).json({ error: credits
          ? "Screenshots need AI, and today's AI limit is used up. Paste the job description as text instead."
          : "Rules-based mode requires a text or document job description. Image upload requires enabling AI Mode." });
        return;
      }
      const result: any = rulesBasedSimplifyJd(jdText);
      if (credits) result.aiUsage = { ...credits, mode: "rules" };
      res.json(result);
      return;
    }

    const ai = getAI();
    let contents: any[] = [];

    if (hasImages) {
      const imagesList = jdImagesBase64 && Array.isArray(jdImagesBase64) 
        ? jdImagesBase64 
        : [jdImageBase64];

      for (const imgBase64 of imagesList) {
        if (!imgBase64) continue;
        const mimeType = imgBase64.match(/data:(.*?);base64/)?.[1] || "image/png";
        const base64Data = imgBase64.replace(/^data:.*?;base64,/, "");
        contents.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }

      contents.push({
        text: `You are an expert recruiter and career mentor specializing in fresh graduates and entry-level professionals.
Analyze the attached Job Description (JD) screenshot(s) and determine whether it represents a valid Job Description (JD).
A text is NOT a valid Job Description if it is:
- A personal resume or CV.
- A cover letter or introduction letter.
- A random set of words/sentences or lorem ipsum placeholder text.
- Meaningless/non-job related text (e.g. food recipe, tutorial, blog post).

Rules:
1. If the screenshot(s) do NOT represent a valid Job Description, set "isValidJd" to false, explain why in "invalidReason", and return empty values for other fields.
2. If the screenshot(s) represent a valid Job Description, set "isValidJd" to true, "invalidReason" to "", and proceed to simplify and parse the JD.
3. Strip away corporate jargon and explain clearly what they are looking for in plain language, key high-priority skills, core responsibilities, and target automated keyword search words.
4. Skill and keyword names must be short, standard names of 1-3 words, exactly as a recruiter would search for them (e.g. "Tableau", "A/B Testing", "Stakeholder Management"). No parentheses, no "or similar", no "familiarity with", no "experience in". If the JD offers alternatives ("Mixpanel or Amplitude"), list each one as its own skill. Never list the job title as a skill. Never list the hiring company's own product or feature names (e.g. "Razorpay Checkout", "Swiggy Instamart") as skills; list the general skill instead (e.g. "Payments", "Checkout").

Format your response strictly as JSON with this schema:
{
  "isValidJd": boolean,
  "invalidReason": "Reason if invalid, otherwise empty string",
  "jobTitle": "A concise and professional job title/role extracted from the JD.",
  "companyPitch": "A ultra-clear, jargon-free summary (2-3 sentences) of what the company actually does.",
  "requiredSkills": [
    { "name": "Skill/Technology", "priority": "high" or "medium" }
  ],
  "keyResponsibilities": [
    "Action-focused plain language explanation of a key responsibility"
  ],
  "candidateExpectations": [
    "Expectations regarding attitude, problem solving, or basic projects"
  ],
  "keywordsToTarget": [
    "Recommended exact keywords to include in their resume to pass filters (5-8 items)"
  ],
  "requiredQualifications": [
    "Academic degrees or minimum qualifications requested"
  ]
}
`
      });
    } else {
      contents = [
        {
          text: `You are an expert recruiter and career mentor specializing in fresh graduates and entry-level professionals.
Analyze the following text and determine whether it represents a valid Job Description (JD).
A text is NOT a valid Job Description if it is:
- A personal resume or CV.
- A cover letter or introduction letter.
- A random set of words/sentences or lorem ipsum placeholder text.
- Meaningless/non-job related text (e.g. food recipe, tutorial, blog post).

Rules:
1. If the text is NOT a valid Job Description, set "isValidJd" to false, explain why in "invalidReason", and return empty/blank values for other fields.
2. If the text is a valid Job Description, set "isValidJd" to true, "invalidReason" to "", and proceed to simplify and parse the JD.
3. Strip away corporate jargon and explain clearly what they are looking for in plain language, key high-priority skills, core responsibilities, and target automated keyword search words.
4. Skill and keyword names must be short, standard names of 1-3 words, exactly as a recruiter would search for them (e.g. "Tableau", "A/B Testing", "Stakeholder Management"). No parentheses, no "or similar", no "familiarity with", no "experience in". If the JD offers alternatives ("Mixpanel or Amplitude"), list each one as its own skill. Never list the job title as a skill. Never list the hiring company's own product or feature names (e.g. "Razorpay Checkout", "Swiggy Instamart") as skills; list the general skill instead (e.g. "Payments", "Checkout").

Job Description:
"""
${jdText}
"""

Format your response strictly as JSON with this schema:
{
  "isValidJd": boolean,
  "invalidReason": "Reason if invalid, otherwise empty string",
  "jobTitle": "A concise and professional job title/role extracted from the JD.",
  "companyPitch": "A ultra-clear, jargon-free summary (2-3 sentences) of what the company actually does.",
  "requiredSkills": [
    { "name": "Skill/Technology", "priority": "high" or "medium" }
  ],
  "keyResponsibilities": [
    "Action-focused plain language explanation of a key responsibility"
  ],
  "candidateExpectations": [
    "Expectations regarding attitude, problem solving, or basic projects"
  ],
  "keywordsToTarget": [
    "Recommended exact keywords to include in their resume to pass filters (5-8 items)"
  ],
  "requiredQualifications": [
    "Academic degrees or minimum qualifications requested"
  ]
}
`
        }
      ];
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValidJd: { type: Type.BOOLEAN },
            invalidReason: { type: Type.STRING },
            jobTitle: { type: Type.STRING },
            companyPitch: { type: Type.STRING },
            requiredSkills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ["high", "medium"] }
                },
                required: ["name", "priority"]
              }
            },
            keyResponsibilities: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            candidateExpectations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            keywordsToTarget: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            requiredQualifications: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["isValidJd", "invalidReason", "jobTitle", "companyPitch", "requiredSkills", "keyResponsibilities", "candidateExpectations", "keywordsToTarget", "requiredQualifications"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Failed to receive output text from Gemini API");
    }

    res.json({ ...withRulesSafetyNet(JSON.parse(resultText.trim()), jdText), ...(credits ? { aiUsage: { ...credits, mode: "ai" } } : {}) });
  } catch (error: any) {
    console.error("Error in simplify-jd:", error);
    // AI unavailable: read the job post without AI instead
    const jdText = req.body?.jdText;
    if (jdText) {
      const result: any = rulesBasedSimplifyJd(jdText);
      result.aiUsage = { status: "ai-unavailable", mode: "rules", used: 0, limit: 0, remaining: 0, resetsAt: null };
      res.json(result);
      return;
    }
    res.status(500).json({ error: cleanErrorMessage(error) });
  }
});

/**
 * Helper to programmatically merge tailored fields back into the original resume.
 * Guarantees that only the professional summary, skills, and experience/project descriptions
 * are modified, leaving all education, contact details, layout, order, and styling identical.
 */
function mergeAndSanitizeTailoredResume(original: any, tailored: any): any {
  if (!original) return tailored || {};
  if (!tailored) return original;

  // Deep copy of original resume as base.
  const result = JSON.parse(JSON.stringify(original));

  // 1. Overwrite Summary.
  if (typeof tailored.summary === "string") {
    result.summary = tailored.summary;
  }

  // 2. Overwrite Skills (keep original skills and append any newly added skills, filter out duplicates).
  if (Array.isArray(tailored.skills)) {
    const originalSkillsLower = (original.skills || []).map((s: string) => s.toLowerCase());
    const addedSkills = tailored.skills.filter((s: string) => s && !originalSkillsLower.includes(s.toLowerCase()));
    result.skills = [...(original.skills || []), ...addedSkills];
  }

  // 3. Merge Work Experience (strictly copy only the description bullet points, keeping remaining original bullets if tailored has fewer).
  if (Array.isArray(original.workExperience)) {
    result.workExperience = original.workExperience.map((origExp: any, index: number) => {
      const tailExp = (tailored.workExperience || []).find((e: any) => e && e.id === origExp.id) || tailored.workExperience?.[index];
      if (tailExp && Array.isArray(tailExp.description)) {
        const mergedDescription = [...tailExp.description];
        if (mergedDescription.length < origExp.description.length) {
          const extraBullets = origExp.description.slice(mergedDescription.length);
          mergedDescription.push(...extraBullets);
        }
        return {
          ...origExp,
          description: mergedDescription
        };
      }
      return origExp;
    });
  }

  // 4. Merge Projects (strictly copy only the description bullet points, keeping remaining original bullets if tailored has fewer).
  if (Array.isArray(original.projects)) {
    result.projects = original.projects.map((origProj: any, index: number) => {
      const tailProj = (tailored.projects || []).find((p: any) => p && p.id === origProj.id) || tailored.projects?.[index];
      if (tailProj && Array.isArray(tailProj.description)) {
        const mergedDescription = [...tailProj.description];
        if (mergedDescription.length < origProj.description.length) {
          const extraBullets = origProj.description.slice(mergedDescription.length);
          mergedDescription.push(...extraBullets);
        }
        return {
          ...origProj,
          description: mergedDescription
        };
      }
      return origProj;
    });
  }

  return result;
}

// 2. Tailor Resume API
app.post("/api/tailor-resume", async (req, res) => {
  try {
    const { resume, jdText, selectedSkills: rawSelected, resumeStructure, careerSwitch: rawSwitch } = req.body;
    // Set when the candidate confirmed they're moving into a different field
    const clean = (v: unknown) => String(v ?? "").replace(/[\r\n`]/g, " ").trim().slice(0, 80);
    const careerSwitch = rawSwitch && typeof rawSwitch === "object"
      ? { fromRole: clean(rawSwitch.fromRole), fromField: clean(rawSwitch.fromField), toRole: clean(rawSwitch.toRole), toField: clean(rawSwitch.toField) }
      : null;
    // Skills the candidate confirmed in the checkbox step. Only these may be added.
    const selectedSkills: string[] | undefined = Array.isArray(rawSelected)
      ? rawSelected.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 50)
      : undefined;
    console.log("[tailor-resume] Request received:", {
      hasResume: !!resume,
      resumeName: resume?.fullName || "N/A",
      resumeKeys: resume ? Object.keys(resume) : [],
      jdTextLength: jdText?.length || 0,
      jdTextPreview: jdText?.slice(0, 100) || "N/A"
    });
    if (!resume || !jdText) {
      console.error("[tailor-resume] Missing required fields:", { hasResume: !!resume, hasJdText: !!jdText });
      res.status(400).json({ error: "Both resume structure and job description are required" });
      return;
    }

    // Daily AI limit: past it, this tailoring uses the no-AI (rules) mode
    const token = bearerToken(req);
    const credits = USE_GEMINI ? await getAiCredits(token) : null;
    if (!USE_GEMINI || (credits && !aiAllowed(credits))) {
      const result: any = rulesBasedTailor(resume, jdText, selectedSkills);
      if (credits) {
        result.aiUsage = { ...credits, mode: "rules" };
        console.log("[ai-limit] Tailoring without AI:", credits.status, `${credits.used}/${credits.limit}`);
      }
      console.log("[Rules Tailor: TailoredResume Output]", JSON.stringify(result, null, 2));
      res.json(result);
      return;
    }

    const ai = getAI();
    // Gemini works on the structured resume (fullName, workExperience, ...). The UI sends it as
    // resumeStructure; older callers sent it as resume.
    const sourceResume = resumeStructure || resume;
    const confirmedSkillsNote = selectedSkills
      ? `\n\nCONFIRMED SKILLS: The candidate confirmed they have these skills from the job description: ${selectedSkills.length ? selectedSkills.join(", ") : "(none)"}.
- Add to Resume.skills ONLY skills from this confirmed list (plus the original skills). Do not add any other skill.
- You may mention a confirmed skill in a bullet point only where the original bullet already describes related work. Never invent projects, employers, numbers or results.`
      : "";
    const careerSwitchNote = careerSwitch
      ? `\n\nCAREER CHANGE: The candidate is moving from ${careerSwitch.fromField} (most recent role: ${careerSwitch.fromRole}) into ${careerSwitch.toField} (target role: ${careerSwitch.toRole}).
- Do NOT present them as already having worked as a ${careerSwitch.toRole} or in ${careerSwitch.toField}. Keep every job title exactly as written.
- Rewrite the summary to state the move honestly, e.g. "${careerSwitch.fromRole} moving into ${careerSwitch.toField}, bringing ...", and lead with transferable strengths relevant to the target role.
- In bullet points, bring forward the parts of their real work that matter for the target role (for example working with engineers, technical requirements, data, automation, stakeholders), without inventing tools, projects, employers, numbers or results.`
      : "";
    // Always on: the candidate reviews every edit, but the model shouldn't invent claims in the first place
    const honestyRules = `\n\nHONESTY RULES (strict, these override everything below):
- Never add a number, percentage, metric, uptime, team size, user count, revenue figure or years of experience that is not already written somewhere in the original resume.
- Never add a tool, method or skill (for example "A/B testing", "Docker", "design systems") to a bullet unless that bullet's original text already describes it, or it is one of the CONFIRMED SKILLS and fits that bullet.
- Never add or raise seniority: do not add words like "Senior", "Lead", "Principal", "Expert" or "Head of" unless the original job title already contains them, and never describe the candidate using the target job's title.
- Only state years of experience if the original summary already states them, and use exactly that figure.
- Rewrite each bullet to say the same thing more clearly and with the job description's wording. Keep every original number exactly as written.
- Never add a result or impact the original line doesn't state (for example "increased engagement", "boosted revenue", "drove growth").

PLAIN WORDING (strict):
- Write like a clear, modest human, not a sales pitch. Use plain verbs: led, built, managed, ran, wrote, designed, worked with, improved.
- Do not use these words unless the original resume already uses them: significantly, substantially, dramatically, demonstrably, meticulously, seamlessly, strategically, successfully, effectively, consistently, proactively, highly, comprehensive, innovative, robust, dynamic, impactful, results-driven, cutting-edge, orchestrated, spearheaded, leveraged, utilized, championed, crafted.
- Keep each bullet about the same length as the original (at most a few words longer). Do not add trailing clauses like "ensuring ...", "contributing to ...", "driving ..." that say nothing new.
- If a bullet is already clear and matches the job, return it unchanged.
- Never mention the job, role or job description inside a bullet, and never end a bullet with "demonstrating ...", "showcasing ...", "highlighting ...", "aligning with ..." or "reflecting ...". A bullet describes what the candidate did, nothing else.
- The summary must never name the hiring company, and must not use phrases like "eager to", "looking to leverage", "passionate about" or "a leading platform like". Describe the candidate, not the employer.`;
    const prompt = `You are a veteran HR Consultant and senior Resume Writer. Your task is to review the Candidate's Resume and tailor it to better align with the requirements in the Job Description, preserving factual honesty but boosting keyword matching, professional tone, and clarity.${honestyRules}${confirmedSkillsNote}${careerSwitchNote}

Candidate's Original Resume:
${JSON.stringify(sourceResume, null, 2)}

Job Description:
"""
${jdText}
"""

Instructions:
1. Examine each bullet point in Resume.workExperience. Rewrite them to emphasize accomplishments using the STAR method, injecting high-priority skills and keywords from the Job Description. Keep the exact same company name, job duration, title, etc. Do not invent new jobs or fake experiences.
2. Examine each project in Resume.projects (if any). Rewrite project descriptions/bullets to emphasize achievements and target keywords. Keep the exact same project name. Do not invent new projects.
3. Update the Professional Summary (Resume.summary) so it directly presents the candidate as a highly relevant fit for this specific job context.
4. Keep the education section factual but clarify or format it perfectly. Do not alter dates or school names.
5. Keep the certifications section (if any) factual and intact. Do not remove or alter actual certifications.
6. Suggest adding missing candidate skills to Resume.skills that directly map to the JD's requirements, provided they make sense for a graduate. Do NOT simply stuff all JD keywords into the Skills section. Add keywords naturally where relevant across Professional Summary, Experience bullet points, and Projects descriptions.
7. Provide a list of "suggestions" with clear reasons why they were made and how they improve the resume.
8. IMPORTANT - DATA INTEGRITY: You MUST process and include ALL work experiences, projects, education history, certifications, languages, achievements, and skills from the original resume in the output tailoredResume. Do not truncate, omit, or ignore any jobs, projects, certifications, languages, achievements, or education entries. If there are 3 work experiences, you must return all 3. If there are projects, return them all. If certifications are present, return them all. If the original resume has no projects or certifications, return an empty array [] for these fields.
9. IMPORTANT - NO PLACEHOLDERS: Do NOT output placeholders like "Present", "Unknown Institution", "Unknown Degree", "Undefined", or null fields. If a date, school name, or degree is already defined, keep it exactly as-is. Do not invent details.
10. STRICT DATA PRESERVATION: You MUST preserve the candidate's original factual details exactly (including names, locations, contact info, companies, job titles, dates, schools, degrees, GPAs, project names, certification names, languages, achievements, and layout/ordering). Do NOT replace them with generic or placeholder content (e.g. "Professional @ Various Companies", "Academic Portfolio", "High School Diploma / Degree"). You may ONLY customize/improve the experience/project description bullet points, rewrite the professional summary narrative, and append relevant matching skills to the skills array. All other fields must remain identical.
11. NO PARSER OR DEBUG HEADINGS: Do NOT introduce or preserve parser-generated headers, internal labels, metadata, or debug headings (such as "Experience Record", "Candidate Profile", "Timeline", "Professional Skills", "Page 1", "Header", "Footer") in any field of the tailored resume. All sections must remain structured according to the schema.
12. PRESERVE ORIGINAL SECTION STRUCTURE: Do NOT invent new section names or replace existing ones with generic labels. The section headings in the output must only be the valid schema fields (workExperience, education, projects, skills, certifications, achievements, languages, summary).

Format your response strictly as JSON matching this schema:
{
  "suggestions": [
    {
      "id": "A unique slug or ID (e.g., s-1, s-2)",
      "type": "rewrite" | "missing" | "ats" | "general",
      "section": "summary" | "experience" | "skills" | "education" | "projects" | "general",
      "targetId": "Identify target id if it's experience or project (e.g. the exact experience ID or project ID)",
      "originalText": "The original bullet point or line being replaced",
      "suggestedText": "The replacement bullet point, rewritten section, or skills suggestions",
      "reason": "Recruiter-minded justification explaining why this change gets results",
      "applied": false
    }
  ],
  "tailoredResume": {
    "fullName": "Name from original resume",
    "email": "Email from original",
    "phone": "Phone from original",
    "linkedin": "Linkedin from original",
    "website": "Website from original",
    "location": "Location from original",
    "summary": "The customized narrative summary",
    "workExperience": [
      {
        "id": "match existing experience ID",
        "role": "Role from original",
        "company": "Company from original",
        "duration": "Duration from original",
        "description": ["Action-oriented, keyword-optimized bullet points rewritten for this experience"]
      }
    ],
    "education": [
      {
        "id": "match existing education ID",
        "degree": "Degree",
        "school": "School",
        "duration": "Duration",
        "gpa": "GPA from original if any, otherwise empty string"
      }
    ],
    "projects": [
      {
        "id": "match existing project ID",
        "name": "Project name",
        "description": ["Action-oriented bullet points rewritten for this project"],
        "duration": "Project duration from original if any, otherwise empty string"
      }
    ],
    "certifications": ["List of certification names"],
    "skills": ["Updated list of skills containing original skills + high-impact JD matches"],
    "languages": ["List of languages from original"],
    "achievements": ["List of achievements from original"]
  }
}
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["rewrite", "missing", "ats", "general"] },
                  section: { type: Type.STRING, enum: ["summary", "experience", "skills", "education", "projects", "general"] },
                  targetId: { type: Type.STRING },
                  originalText: { type: Type.STRING },
                  suggestedText: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  applied: { type: Type.BOOLEAN }
                },
                required: ["id", "type", "section", "suggestedText", "reason", "applied"]
              }
            },
            tailoredResume: {
              type: Type.OBJECT,
              properties: {
                fullName: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                website: { type: Type.STRING },
                location: { type: Type.STRING },
                summary: { type: Type.STRING },
                workExperience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      role: { type: Type.STRING },
                      company: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      description: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      }
                    },
                    required: ["id", "role", "company", "duration", "description"]
                  }
                },
                education: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      degree: { type: Type.STRING },
                      school: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      gpa: { type: Type.STRING }
                    },
                    required: ["id", "degree", "school", "duration"]
                  }
                },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      name: { type: Type.STRING },
                      description: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },
                      duration: { type: Type.STRING }
                    },
                    required: ["id", "name", "description"]
                  }
                },
                certifications: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                languages: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                achievements: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["fullName", "email", "phone", "summary", "workExperience", "education", "skills", "projects", "certifications"]
            }
          },
          required: ["suggestions", "tailoredResume"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Failed to receive output text from Gemini API");
    }

    const parsed = JSON.parse(resultText.trim());
    if (parsed && parsed.tailoredResume) {
      parsed.tailoredResume = mergeAndSanitizeTailoredResume(sourceResume, parsed.tailoredResume);
      parsed.tailoredResume = sanitizeResumeTextFields(parsed.tailoredResume);
      // Strip puffy words the AI added ("significantly", "orchestrated") unless the candidate used them
      parsed.tailoredResume = plainResumeWording(parsed.tailoredResume, sourceResume);
      // Enforce the checkbox choice: original skills + confirmed skills only, whatever the model returned.
      if (selectedSkills) {
        const original: string[] = Array.isArray(sourceResume?.skills) ? sourceResume.skills : [];
        const seen = new Set(original.map((s: string) => s.toLowerCase()));
        const added = selectedSkills.filter(s => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
        parsed.tailoredResume.skills = [...original, ...added];
        parsed.newSkills = added;
      }
    }
    // Count this AI tailoring only once it has worked
    const usage = await useAiCredit(token);
    parsed.aiUsage = { ...usage, mode: "ai" };
    console.log("[ai-limit] AI tailoring used:", usage.status, `${usage.used}/${usage.limit}`);
    res.json(parsed);
  } catch (error: any) {
    console.error("[tailor-resume] ERROR:", {
      name: error?.name,
      message: error?.message?.slice(0, 500),
      status: error?.status || error?.statusCode,
      stack: error?.stack?.slice(0, 300)
    });
    // Both AIs failed (quota, outage): still give the person a resume, made without AI
    const { resume, jdText, selectedSkills } = req.body || {};
    if (resume && jdText) {
      try {
        const skills = Array.isArray(selectedSkills) ? selectedSkills.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 50) : undefined;
        const result: any = rulesBasedTailor(resume, jdText, skills);
        result.aiUsage = { status: "ai-unavailable", mode: "rules", used: 0, limit: 0, remaining: 0, resetsAt: null };
        console.warn("[tailor-resume] AI unavailable; sent the no-AI version instead.");
        res.json(result);
        return;
      } catch (fallbackError) {
        console.error("[tailor-resume] No-AI fallback also failed:", fallbackError);
      }
    }
    res.status(500).json({ error: cleanErrorMessage(error) });
  }
});

// 3. ATS Audit API
app.post("/api/ats-audit", async (req, res) => {
  try {
    const { resume, jdText } = req.body;
    if (!resume || !jdText) {
      res.status(400).json({ error: "Both resume structure and job description are required" });
      return;
    }

    if (!USE_GEMINI) {
      const result = rulesBasedAtsAudit(resume, jdText);
      res.json(result);
      return;
    }

    const ai = getAI();
    const prompt = `You are an veteran ATS (Applicant Tracking System) scanner simulation. Score the Candidate's Resume against the specified Job Description (JD) and suggest actionable optimizations.

Candidate's Resume:
${JSON.stringify(resume, null, 2)}

Job Description:
"""
${jdText}
"""

Instructions:
Analyze three distinct performance classes of the resume:
1. Formatting & Layout: Check for standard elements (has emails, phone, well-identified headings, action bullets, simple structured sections).
2. Language: Evaluate usage of strong action verbs (initiated, developed, spearheaded) over weak status phrases (responsible for, tasked with). Check for jargon clarity.
3. Content & Keyword Match: Score density mismatch on mandatory technical or soft skills outlined in the JD.

Provide an overall ATS alignment score (0 to 100) and actionable line-item feedback.

Format your response strictly as JSON matching this schema:
{
  "passed": true (or false, if score is below 60),
  "score": 85 (integer from 0 to 100 indicating relative strength),
  "criteria": [
    {
      "name": "E.g. Technical Keyword Density",
      "description": "Short explanation of this assessment standard",
      "passed": true,
      "feedback": "Actionable feedback detailing what to do (e.g., 'Add React and Redux as they are high-priority keywords missing from current sections.')",
      "category": "content" or "formatting" or "language"
    }
  ]
}
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            passed: { type: Type.BOOLEAN },
            score: { type: Type.INTEGER },
            criteria: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  passed: { type: Type.BOOLEAN },
                  feedback: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ["formatting", "language", "content"] }
                },
                required: ["name", "description", "passed", "feedback", "category"]
              }
            }
          },
          required: ["passed", "score", "criteria"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Failed to receive output text from Gemini API");
    }

    res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in ats-audit:", error);
    res.status(500).json({ error: cleanErrorMessage(error) });
  }
});

app.post("/api/analyze-uploaded-resume", async (req, res) => {
  try {
    const { fileName, fileType, base64Data } = req.body;
    validationLog(fileName || "unknown-file", "Validation Started", { fileType });
    if (!base64Data) {
      validationLog(fileName || "unknown-file", "Validation Failed", { reason: "Base64 file data is required." });
      res.status(400).json({ error: "Base64 file data is required" });
      return;
    }

    const detectedFileType = detectUploadedResumeType(fileName, fileType);

    if (!detectedFileType) {
      const reason = "Unsupported file type. Only PDF and DOCX files can be validated.";
      validationLog(fileName || "unknown-file", "Validation Failed", { reason });
      res.json({ isResume: false, fileType: "unsupported", extractedText: "", indicators: [], reason });
      return;
    }

    const performTextExtraction = async () => {
      const buffer = Buffer.from(base64Data, "base64");
      if (detectedFileType === "pdf") {
        const pdfData = await getDocumentProxy(new Uint8Array(buffer));
        return await extractTextFromPdfProxy(pdfData);
      }
      const extractResult = await mammoth.extractRawText({ buffer });
      return extractResult.value || "";
    };

    let extractedText = "";
    try {
      // No hard timeout on extraction — large PDFs can take a few seconds and we have 60s total budget
      extractedText = await performTextExtraction();
      validationLog(fileName || "unknown-file", "Document Parsed", {
        detectedFileType,
        charactersExtracted: normalizeWhitespace(extractedText).length
      });
    } catch (err: any) {
      console.error(`${detectedFileType.toUpperCase()} text extraction failed:`, err);
      const reason = "This file could not be read. It may be password-protected, corrupted, or an unsupported PDF variant.";
      validationLog(fileName || "unknown-file", "Validation Failed", { reason });
      res.json({
        isResume: false,
        fileType: detectedFileType,
        extractedText: "",
        indicators: [],
        reason,
        error: reason
      });
      return;
    }

    // Scanned resumes (a photo or image saved as PDF) have almost no text to read
    if (normalizeWhitespace(extractedText).length < 80) {
      const reason = detectedFileType === "pdf"
        ? "This PDF looks like a scanned image, so there's no text we (or hiring systems) can read. Please upload the original Word file, or export a PDF from Word or Google Docs."
        : "This file has almost no text in it. Please upload your full resume.";
      validationLog(fileName || "unknown-file", "Validation Failed", { reason });
      res.json({ isResume: false, fileType: detectedFileType, extractedText, indicators: [], reason, scanned: detectedFileType === "pdf" });
      return;
    }

    if (!USE_GEMINI) {
      const validationResult = rulesBasedParseResume(extractedText, fileName);
      console.log("[Rules Parser: ResumeStructure Parsed]", JSON.stringify(validationResult.detectedProfile, null, 2));
      if (validationResult && validationResult.detectedProfile) {
        validationResult.detectedProfile = sanitizeResumeTextFields(validationResult.detectedProfile);
      }
      
      const strictValidation = checkTextAgainstStrictResumeCriteria(extractedText);
      if (validationResult.isResume && !strictValidation.isResume) {
        validationResult.isResume = false;
        validationResult.reason = strictValidation.reason;
        validationResult.confidenceScore = 0;
        validationResult.detectedProfile = null;
        validationResult.indicators = [];
      }

      const indicators: string[] = [];
      if (validationResult.detectedProfile) {
        const dp = validationResult.detectedProfile;
        if (dp.fullName) indicators.push("name");
        if (dp.email || dp.phone) indicators.push("contact");
        if (dp.education?.length) indicators.push("education");
        if (dp.workExperience?.length) indicators.push("experience");
        if (dp.skills?.length) indicators.push("skills");
        if (dp.projects?.length) indicators.push("projects");
        if (dp.certifications?.length) indicators.push("certifications");
      }
      validationResult.indicators = indicators;

      validationLog(fileName || "unknown-file", "Rules Parser: Sections Found", {
        indicators: validationResult.indicators,
        reason: validationResult.reason
      });

      res.json({
        ...validationResult,
        fileType: detectedFileType,
        extractedText: normalizeWhitespace(extractedText)
      });
      return;
    }

    const validationResult = await parseResumeWithGemini(extractedText, fileName);
    if (validationResult && validationResult.detectedProfile) {
      validationResult.detectedProfile = sanitizeResumeTextFields(validationResult.detectedProfile);
    }
    
    // Double-guard: enforce strict rules-based validation on the extracted text.
    const strictValidation = checkTextAgainstStrictResumeCriteria(extractedText);
    if (validationResult.isResume && !strictValidation.isResume) {
      validationResult.isResume = false;
      validationResult.reason = strictValidation.reason;
      validationResult.confidenceScore = 0;
      validationResult.detectedProfile = null;
      validationResult.indicators = [];
    }

    validationLog(fileName || "unknown-file", "Sections Found", {
      indicators: validationResult.indicators,
      reason: validationResult.reason
    });
    validationLog(fileName || "unknown-file", validationResult.isResume ? "Validation Passed" : "Validation Failed", {
      reason: validationResult.reason
    });
    res.json({
      ...validationResult,
      fileType: detectedFileType,
      extractedText: normalizeWhitespace(extractedText)
    });
  } catch (error: any) {
    console.error("Error in analyze-uploaded-resume:", error);
    res.status(500).json({ error: error.message || "Failed to process the uploaded resume." });
  }
});


// Setup Vite Dev server or static files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite HMR middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode with static static routing...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server integrated and listening on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
