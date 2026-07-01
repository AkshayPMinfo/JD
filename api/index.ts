import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { getDocumentProxy, extractText } from "unpdf";

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
2. DO NOT invent details, and DO NOT use default placeholder values (e.g. "Professional @ Various Companies", "Academic Portfolio", "High School Diploma / Degree"). If a section (like workExperience, education, projects, certifications, website, linkedin, location, languages) is not found or has no content in the text, return an empty array [] or empty string "" respectively.
3. Preserve all company names, job titles, roles, durations, and description bullet points exactly as they are described in the resume. Do not change their phrasing during parsing.
4. Preserve all projects, education details (degree, school, duration, gpa), and certifications exactly as described.
5. In workExperience, education, and projects, generate a unique string "id" for each entry (e.g., "exp-1", "exp-2", "edu-1", "proj-1").
6. Verify if this document is actually a professional resume. (A cover letter, template with placeholder names, food recipe, empty text, or random non-resume file counts as isResume: false).
   - A document is a resume (isResume: true) if it has a person's name and at least some sections like experience, education, or skills.
   - If the document is not a resume (isResume: false), explain why in the "reason" field.

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
    "fullName": "Full Name",
    "email": "Email Address",
    "phone": "Phone Number",
    "linkedin": "LinkedIn profile link or empty string if not found",
    "website": "Personal website or portfolio link or empty string if not found",
    "location": "Location (city, state, country) or empty string if not found",
    "summary": "Professional Summary or Profile section or empty string if not found",
    "workExperience": [
      {
        "id": "exp-1",
        "role": "Job Title / Role",
        "company": "Company Name",
        "duration": "Duration (e.g., June 2021 - Present)",
        "description": ["Action-oriented bullet points from the resume describing the work"]
      }
    ],
    "education": [
      {
        "id": "edu-1",
        "degree": "Degree / Major",
        "school": "School / University Name",
        "duration": "Duration (e.g., 2017 - 2021)",
        "gpa": "GPA if mentioned, or empty string"
      }
    ],
    "projects": [
      {
        "id": "proj-1",
        "name": "Project Name",
        "description": ["Action-oriented bullet points describing the project work and technologies used"],
        "duration": "Project duration if mentioned, or empty string"
      }
    ],
    "certifications": ["List of certification/license/award names, or empty array if none"],
    "skills": ["List of technical/soft skills mentioned in the resume"],
    "languages": ["List of languages mentioned in the resume, or empty array if none"]
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
                languages: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["fullName", "email", "phone", "summary", "workExperience", "education", "skills", "projects", "certifications"]
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
  } catch (error) {
    console.error("Gemini resume parsing failed:", error);
  }

  // Fallback to minimal profile if Gemini parsing fails entirely
  return {
    isResume: true,
    confidenceScore: 50,
    reason: "Heuristics fallback due to parse exception.",
    indicators: ["name"],
    detectedProfile: {
      fullName: fileName.replace(/\.[^/.]+$/, ""),
      email: "",
      phone: "",
      summary: "",
      skills: [],
      languages: [],
      workExperience: [],
      education: [],
      projects: [],
      certifications: []
    }
  };
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
          const pdfData = await getDocumentProxy(new Uint8Array(buffer));
          const parsed = await extractText(pdfData, { mergePages: true });
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
      model: "gemini-3.5-flash",
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
10. DATA PRESERVATION: Do NOT replace the user's actual resume content, companies, titles, degree names, or schools with generic placeholder names (e.g. "Professional @ Various Companies", "Academic Portfolio", "High School Diploma / Degree"). You must preserve the candidate's original factual details exactly, and only rewrite description bullet points and professional summaries to customize and improve them.

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
    "languages": ["List of languages from original"]
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

    const performTextExtraction = async () => {
      const buffer = Buffer.from(base64Data, "base64");
      if (detectedFileType === "pdf") {
        const pdfData = await getDocumentProxy(new Uint8Array(buffer));
        const parsed = await extractText(pdfData, { mergePages: true });
        return parsed.text || "";
      }
      const extractResult = await mammoth.extractRawText({ buffer });
      return extractResult.value || "";
    };

    let extractedText = "";
    try {
      extractedText = await Promise.race([
        performTextExtraction(),
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

    const validationResult = await parseResumeWithGemini(extractedText, fileName);
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
