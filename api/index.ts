import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { getDocumentProxy, extractText } from "unpdf";
import {
  rulesBasedParseResume,
  rulesBasedSimplifyJd,
  rulesBasedTailorResume,
  rulesBasedAtsAudit,
  rulesBasedTailor
} from "./rulesEngine.js";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const USE_GEMINI = process.env.USE_GEMINI === "true";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initializer for Google GenAI SDK
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it in Settings > Secrets.");
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
    type TextItem = { x: number; y: number; str: string; hasEOL: boolean };
    const allItems: TextItem[] = items
      .map((item: any) => ({
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        str: (item.str || '').trim(),
        hasEOL: !!item.hasEOL
      }))
      .filter(item => item.str.length > 0);

    if (allItems.length === 0) continue;

    // ── Detect column boundary via X-coordinate gap analysis ─────────────────
    const xValues = [...new Set(allItems.map(it => Math.round(it.x)))].sort((a, b) => a - b);
    const pageWidth = xValues[xValues.length - 1] - xValues[0];
    const maxX = xValues[xValues.length - 1];

    let splitX: number | null = null;
    if (xValues.length >= 4 && pageWidth > 250 && maxX > 300) {
      // Find the largest gap between consecutive X clusters
      let maxGap = 0;
      let maxGapIdx = -1;
      for (let i = 1; i < xValues.length; i++) {
        const gap = xValues[i] - xValues[i - 1];
        if (gap > maxGap) { maxGap = gap; maxGapIdx = i; }
      }
      // Only treat as two-column if the gap is at least 15% of page width
      // AND the split point falls between 20% and 80% of the page (not near edges)
      if (maxGap > pageWidth * 0.15 && maxGapIdx > 0) {
        const candidateSplit = (xValues[maxGapIdx - 1] + xValues[maxGapIdx]) / 2;
        const relPos = (candidateSplit - xValues[0]) / pageWidth;
        if (relPos >= 0.2 && relPos <= 0.8) {
          // Also verify both sides have meaningful content (at least 5% of items each)
          const leftCount = allItems.filter(it => it.x <= candidateSplit).length;
          const rightCount = allItems.filter(it => it.x > candidateSplit).length;
          const minCount = allItems.length * 0.05;
          if (leftCount >= minCount && rightCount >= minCount) {
            splitX = candidateSplit;
          }
        }
      }
    }

    const renderColumn = (colItems: TextItem[]): string => {
      let text = '';
      let lastY: number | null = null;
      for (const item of colItems) {
        if (lastY !== null && Math.abs(item.y - lastY) > 5) {
          text += '\n';
        } else if (text.length > 0 && !text.endsWith(' ') && !text.endsWith('\n')) {
          text += ' ';
        }
        text += item.str;
        lastY = item.y;
      }
      return text.trim();
    };

    if (splitX !== null) {
      anyColumns = true;
      const leftItems  = allItems.filter(it => it.x <= splitX).sort((a, b) => b.y - a.y || a.x - b.x);
      const rightItems = allItems.filter(it => it.x >  splitX).sort((a, b) => b.y - a.y || a.x - b.x);

      leftPageTexts.push(renderColumn(leftItems));
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
    return leftText + (rightText ? '\n\n' + rightText : '');
  } else {
    return leftPageTexts.filter(t => t.length > 0).join('\n\n');
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
            .map((bullet: string) => bullet.replace(/\b(Experience Record|Candidate Profile|Timeline|Professional Skills)\b/gi, "").trim());
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
            .map((bullet: string) => bullet.replace(/\b(Experience Record|Candidate Profile|Timeline|Professional Skills)\b/gi, "").trim());
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

async function generateContentWithRetry(ai: GoogleGenAI, options: any, maxRetries = 2): Promise<any> {
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
      throw error;
    }
  }
}

// 1. Simplify Job Description API
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

    if (!USE_GEMINI) {
      if (!jdText) {
        res.status(400).json({ error: "Rules-based mode requires a text or document job description. Image upload requires enabling AI Mode." });
        return;
      }
      const result = rulesBasedSimplifyJd(jdText);
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

    res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in simplify-jd:", error);
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
    const { resume, jdText } = req.body;
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

    if (!USE_GEMINI) {
      const result = rulesBasedTailor(resume, jdText);
      console.log("[Rules Tailor: TailoredResume Output]", JSON.stringify(result, null, 2));
      res.json(result);
      return;
    }

    const ai = getAI();
    const prompt = `You are a veteran HR Consultant and senior Resume Writer. Your task is to review the Candidate's Resume and tailor it to better align with the requirements in the Job Description, preserving factual honesty but boosting keyword matching, professional tone, and clarity.

Candidate's Original Resume:
${JSON.stringify(resume, null, 2)}

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
      parsed.tailoredResume = mergeAndSanitizeTailoredResume(resume, parsed.tailoredResume);
      parsed.tailoredResume = sanitizeResumeTextFields(parsed.tailoredResume);
    }
    res.json(parsed);
  } catch (error: any) {
    console.error("[tailor-resume] ERROR:", {
      name: error?.name,
      message: error?.message?.slice(0, 500),
      status: error?.status || error?.statusCode,
      stack: error?.stack?.slice(0, 300)
    });
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
