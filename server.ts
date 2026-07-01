import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

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

function parseResumeHeuristically(text: string, fileName: string) {
  const cleanText = normalizeWhitespace(text);
  if (!cleanText) {
    return { isResume: false, detectedProfile: null, indicators: [], reason: "No readable text was extracted from the document." };
  }

  // Heuristic indicator detection
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // 1. Name: first short line that looks like a person, not a generic document title.
  let name = "";
  for (const line of lines) {
    const wordCount = line.split(/\s+/).length;
    const looksLikePersonName =
      line.length > 2 &&
      line.length < 60 &&
      wordCount >= 2 &&
      wordCount <= 5 &&
      /^[A-Za-z][A-Za-z'-]+(?:\s+[A-Za-z][A-Za-z'-]+)+$/.test(line) &&
      line.split(/\s+/).every(word => word === word.toUpperCase() || /^[A-Z][A-Za-z'-]*$/.test(word)) &&
      !/invoice|statement|receipt|bill|account|transaction|notes|agenda|education|experience|skills|projects|resume|cv|curriculum|email|phone|contact|certificate/i.test(line);

    if (looksLikePersonName) {
      name = line;
      break;
    }
  }

  // 2. Contact Information: Email and Phone regexes
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const phoneRegex = /\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/;
  
  const emailMatch = cleanText.match(emailRegex);
  const phoneMatch = cleanText.match(phoneRegex);
  
  const email = emailMatch ? emailMatch[0] : "";
  const phone = phoneMatch ? phoneMatch[0] : "";
  const hasContact = !!(email || phone);

  // 3. Section checks using regex
  const hasEducation = /\b(education|university|college|school|degree|bachelor|master|phd|gpa|coursework|academic)\b/i.test(cleanText);
  const hasExperience = /\b(experience|work history|employment|internship|responsibilities|achievements|professional experience)\b/i.test(cleanText);
  const hasSkills = /\b(skills|technical skills|technologies|tools|competencies|expertise|programming languages)\b/i.test(cleanText);
  const hasProjects = /\b(projects|portfolio|personal projects|academic projects|repositories|github)\b/i.test(cleanText);
  const hasCertifications = /\b(certifications?|licenses?|awards?|credentials?)\b/i.test(cleanText);
  const hasResumeKeyword = /\b(resume|curriculum vitae|cv)\b/i.test(cleanText);
  const hasNonResumeDocumentSignal = /\b(invoice|receipt|bank statement|statement of account|transaction|balance|amount due|payment|vendor|chapter|session agenda|session kickoff|lecture notes|meeting notes|minutes of meeting)\b/i.test(cleanText);

  const indicators = [
    name ? "name" : null,
    hasContact ? "contact" : null,
    hasEducation ? "education" : null,
    hasExperience ? "experience" : null,
    hasSkills ? "skills" : null,
    hasProjects ? "projects" : null,
    hasCertifications ? "certifications" : null,
    hasResumeKeyword ? "resume-keyword" : null,
  ].filter(Boolean) as string[];

  const sectionIndicators = [hasEducation, hasExperience, hasSkills, hasProjects, hasCertifications].filter(Boolean).length;
  const hasContactBackedResume = hasContact && sectionIndicators >= 2 && indicators.length >= 3;
  const hasStrongSectionOnlyResume = !hasContact && !!name && sectionIndicators >= 3 && (hasExperience || hasEducation) && indicators.length >= 4;
  const isResume = !hasNonResumeDocumentSignal && (hasContactBackedResume || hasStrongSectionOnlyResume);
  const reason = isResume
    ? `Detected ${indicators.length} resume indicators: ${indicators.join(", ")}.`
    : hasNonResumeDocumentSignal
      ? "Document contains non-resume signals such as invoice, statement, agenda, or notes terminology."
      : `Only detected ${indicators.length} resume indicator(s). Requires contact plus at least 2 resume sections, or name plus at least 3 strong resume sections.`;

  if (!isResume) {
    return { isResume: false, detectedProfile: null, indicators, reason };
  }

  // Let's build a basic profile so the front-end has something to render / save
  const skillsList: string[] = [];
  const educationList: any[] = [];
  const experienceList: any[] = [];
  const projectsList: any[] = [];

  // Simple section parser:
  let currentSection = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (/skills|technologies|tools/i.test(lowerLine) && line.length < 25) {
      currentSection = "skills";
      continue;
    } else if (/education|university|college/i.test(lowerLine) && line.length < 25) {
      currentSection = "education";
      continue;
    } else if (/experience|work|employment|history/i.test(lowerLine) && line.length < 25) {
      currentSection = "experience";
      continue;
    } else if (/projects/i.test(lowerLine) && line.length < 25) {
      currentSection = "projects";
      continue;
    } else if (line.length < 25 && /summary|objective/i.test(lowerLine)) {
      currentSection = "summary";
      continue;
    }

    if (currentSection === "skills") {
      // Split by commas, semicolons or bullets
      const parts = line.split(/[,;\u2022|\t]/).map(p => p.trim()).filter(p => p.length > 1 && p.length < 35);
      skillsList.push(...parts);
    } else if (currentSection === "education") {
      if (educationList.length < 4 && line.length > 5 && line.length < 100) {
        educationList.push({
          degree: line,
          school: lines[i+1] || "Unknown Institution",
          duration: "Present",
          gpa: ""
        });
        i++; // skip next line
      }
    } else if (currentSection === "experience") {
      if (experienceList.length < 4 && line.length > 5 && line.length < 100) {
        experienceList.push({
          role: line,
          company: lines[i+1] || "Company",
          duration: "Present",
          description: [lines[i+2] || "Duties and responsibilities."]
        });
        i += 2; // skip used lines
      }
    } else if (currentSection === "projects") {
      if (projectsList.length < 4 && line.length > 5 && line.length < 100) {
        projectsList.push({
          name: line,
          description: [lines[i+1] || "Project details."]
        });
        i++; // skip used lines
      }
    }
  }

  // Deduplicate and limit skills
  const uniqueSkills = Array.from(new Set(skillsList)).slice(0, 15);

  const detectedProfile = {
    fullName: name || fileName.replace(/\.[^/.]+$/, ""),
    email: email,
    phone: phone,
    summary: lines.slice(0, 8).join(" ").substring(0, 300),
    skills: uniqueSkills.length > 0 ? uniqueSkills : ["Communication", "Problem Solving"],
    languages: ["English"],
    workExperience: experienceList.length > 0 ? experienceList : [
      { role: "Professional", company: "Various Companies", duration: "Present", description: ["Responsible for executing business operations."] }
    ],
    education: educationList.length > 0 ? educationList : [
      { degree: "High School Diploma / Degree", school: "Educational Institution", duration: "Graduate" }
    ],
    projects: projectsList.length > 0 ? projectsList : [
      { name: "Academic Portfolio", description: ["Completed academic/personal project work."] }
    ],
    certifications: []
  };

  return { isResume, detectedProfile, indicators, reason };
}

async function generateContentWithRetry(ai: GoogleGenAI, options: any, maxRetries = 3): Promise<any> {
  let delay = 1000; // start with 1 second delay
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
        delay *= 2; // exponential backoff
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
          const parser = new PDFParse({ data: buffer });
          const parsed = await parser.getText();
          jdText = parsed.text || "";
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
Analyze the attached Job Description (JD) screenshot(s) and simplify it to help candidates understand companies actual search requirements.
Strip away corporate jargon and explain clearly what they are looking for in plain language, key high-priority skills, core responsibilities, and target automated keyword search words.

Format your response strictly as JSON with this schema:
{
  "jobTitle": "A concise and professional job title/role extracted from the JD.",
  "companyPitch": "A ultra-clear, jargon-free summary (2-3 sentences) of what the company actually does and the real, practical problem the candidate is hired to solve.",
  "requiredSkills": [
    { "name": "Skill/Technology", "priority": "high" or "medium" }
  ],
  "keyResponsibilities": [
    "Action-focused plain language explanation of a key responsibility"
  ],
  "candidateExpectations": [
    "Expectations regarding attitude, problem solving, code-hygiene or basic projects rather than decades of experience"
  ],
  "keywordsToTarget": [
    "Recommended exact keywords to include in their resume to pass filters (5-8 items)"
  ],
  "requiredQualifications": [
    "Academic degrees, certifications, or minimum years of experience requested by the JD (e.g. Bachelor's in CS, 1+ years React experience)"
  ]
}
`
      });
    } else {
      contents = [
        {
          text: `You are an expert recruiter and career mentor specializing in fresh graduates and entry-level professionals.
Analyze the following Job Description (JD) and simplify it to help candidates understand companies actual search requirements.
Strip away corporate jargon and explain clearly what they are looking for in plain language, key high-priority skills, core responsibilities, and target automated keyword search words.

Job Description:
"""
${jdText}
"""

Format your response strictly as JSON with this schema:
{
  "jobTitle": "A concise and professional job title/role extracted from the JD.",
  "companyPitch": "A ultra-clear, jargon-free summary (2-3 sentences) of what the company actually does and the real, practical problem the candidate is hired to solve.",
  "requiredSkills": [
    { "name": "Skill/Technology", "priority": "high" or "medium" }
  ],
  "keyResponsibilities": [
    "Action-focused plain language explanation of a key responsibility"
  ],
  "candidateExpectations": [
    "Expectations regarding attitude, problem solving, code-hygiene or basic projects rather than decades of experience"
  ],
  "keywordsToTarget": [
    "Recommended exact keywords to include in their resume to pass filters (5-8 items)"
  ],
  "requiredQualifications": [
    "Academic degrees, certifications, or minimum years of experience requested by the JD (e.g. Bachelor's in CS, 1+ years React experience)"
  ]
}
`
        }
      ];
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
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
          required: ["jobTitle", "companyPitch", "requiredSkills", "keyResponsibilities", "candidateExpectations", "keywordsToTarget", "requiredQualifications"]
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

// 2. Tailor Resume API
app.post("/api/tailor-resume", async (req, res) => {
  try {
    const { resume, jdText } = req.body;
    if (!resume || !jdText) {
      res.status(400).json({ error: "Both resume structure and job description are required" });
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
8. IMPORTANT - DATA INTEGRITY: You MUST process and include ALL work experiences, projects, education history, certifications, and skills from the original resume in the output tailoredResume. Do not truncate, omit, or ignore any jobs, projects, certifications, or education entries. If there are 3 work experiences, you must return all 3. If there are projects, return them all. If certifications are present, return them all. If the original resume has no projects or certifications, return an empty array [] for these fields.
9. IMPORTANT - NO PLACEHOLDERS: Do NOT output placeholders like "Present", "Unknown Institution", "Unknown Degree", "Undefined", or null fields. If a date, school name, or degree is already defined, keep it exactly as-is. Do not invent details.

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
        "duration": "Duration"
      }
    ],
    "projects": [
      {
        "id": "match existing project ID",
        "name": "Project name",
        "description": ["Action-oriented bullet points rewritten for this project"]
      }
    ],
    "certifications": ["List of certification names"],
    "skills": ["Updated list of skills containing original skills + high-impact JD matches"]
  }
}
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
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
                      duration: { type: Type.STRING }
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
                      }
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

    res.json(JSON.parse(resultText.trim()));
  } catch (error: any) {
    console.error("Error in tailor-resume:", error);
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
      model: "gemini-3.5-flash",
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

    const extractText = async () => {
      const buffer = Buffer.from(base64Data, "base64");
      if (detectedFileType === "pdf") {
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        return parsed.text || "";
      }
      const extractResult = await mammoth.extractRawText({ buffer });
      return extractResult.value || "";
    };

    let extractedText = "";
    try {
      extractedText = await Promise.race([
        extractText(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Resume validation timed out.")), 9000))
      ]);
      validationLog(fileName || "unknown-file", "Document Parsed", {
        detectedFileType,
        charactersExtracted: normalizeWhitespace(extractedText).length
      });
    } catch (err: any) {
      console.error(`${detectedFileType.toUpperCase()} text extraction failed:`, err);
      const reason = "This file could not be read for resume validation.";
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

    const validationResult = parseResumeHeuristically(extractedText, fileName);
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
