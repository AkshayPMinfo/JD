import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

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

// 1. Simplify Job Description API
app.post("/api/simplify-jd", async (req, res) => {
  try {
    const { jdText, jdImageBase64, jdImagesBase64 } = req.body;
    const hasImages = (jdImagesBase64 && jdImagesBase64.length > 0) || jdImageBase64;
    if (!jdText && !hasImages) {
      res.status(400).json({ error: "Either job description text or screenshot images are required" });
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
  ]
}
`
        }
      ];
    }

    const response = await ai.models.generateContent({
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
            }
          },
          required: ["jobTitle", "companyPitch", "requiredSkills", "keyResponsibilities", "candidateExpectations", "keywordsToTarget"]
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
    res.status(500).json({ error: error.message || "An error occurred while simplifying the JD" });
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
1. Examine each bullet point in Resume.workExperience. Rewrite them to emphasize accomplishments using the STAR method, injecting high-priority skills and keywords from the Job Description. Keep the exact same company name, job duration, title, etc. Do not invent new jobs.
2. Examine each project in Resume.projects (if any). Rewrite project descriptions/bullets to emphasize achievements and target keywords. Keep the exact same project name. Do not invent new projects.
3. Update the Professional Summary (Resume.summary) so it directly presents the candidate as a highly relevant fit for this specific job context.
4. Keep the education section factual but clarify or format it perfectly.
5. Keep the certifications section (if any) factual and intact. Do not remove or alter actual certifications.
6. Suggest adding missing candidate skills to Resume.skills that directly map to the JD's requirements, provided they make sense for a graduate.
7. Provide a list of "suggestions" with clear reasons why they were made and how they improve the resume.
8. IMPORTANT: You MUST process and include ALL work experiences, projects, education history, certifications, and skills from the original resume in the output tailoredResume. Do not truncate, omit, or ignore any jobs, projects, certifications, or education entries from any page. If there are 3 work experiences, you must return all 3. If there are projects, return them all. If certifications are present, return them all. If the original resume has no projects or certifications, return an empty array [] for these fields.

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

    const response = await ai.models.generateContent({
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
    res.status(500).json({ error: error.message || "An error occurred while tailoring the resume" });
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

    const response = await ai.models.generateContent({
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
    res.status(500).json({ error: error.message || "An error occurred while scanning the resume" });
  }
});

// 4. Analyze Uploaded Resume API (supports PDF direct ingestion and DOCX text extraction)
app.post("/api/analyze-uploaded-resume", async (req, res) => {
  try {
    const { fileName, fileType, base64Data } = req.body;
    if (!base64Data) {
      res.status(400).json({ error: "Base64 file data is required" });
      return;
    }

    const ai = getAI();
    let isPdf = false;
    if (fileType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith(".pdf"))) {
      isPdf = true;
    }

    let parsedResponseText = "";

    if (isPdf) {
      let pdfText = "";
      try {
        const buffer = Buffer.from(base64Data, "base64");
        const pdfData = await pdf(buffer);
        pdfText = pdfData.text || "";
      } catch (err: any) {
        console.error("PDF text extraction failed, falling back to multimodal upload:", err);
      }

      if (pdfText.trim().length > 0) {
        // High-speed text-based scanning path (takes less than 2 seconds)
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `You are an expert recruiter and applicant tracking system (ATS) scanner.
Analyze the following resume text extracted from a PDF document and deliver an evaluation strictly in JSON.
IMPORTANT: This is a multi-page resume document. You MUST process the entire text from all pages. Do not truncate, omit, or ignore any work experiences, projects, education entries, or skills from any page. If the resume has 2 pages, extract 2 pages of info. If it has 3 pages, extract 3 pages of info. Every single work experience and education history entry must be extracted and returned in the detectedProfile.

First, verify if this text is actually from a professional resume. (A cover letter, template with placeholder names, food recipe, empty text, or random non-resume text counts as isResume: false).
Identify if any critical standard resume sections or standard contact info are missing.
Extract key candidate profile information if available. Ensure detectedProfile includes all found experiences, skills, education, and languages.

Resume Text:
"""
${pdfText}
"""

Return a JSON payload with exactly this schema:
{
  "isResume": boolean,
  "confidenceScore": number, // 0 to 100 on how complete and professional the resume is
  "missingItems": string[], // e.g. ["Professional Summary", "LinkedIn profile link", "Dates for work experiences", "Education details"]
  "actionableImprovements": string[], // List of 3-5 specific bullet points for the candidate to improve their resume
  "detectedProfile": {
    "fullName": string,
    "email": string,
    "phone": string,
    "summary": string,
    "skills": string[],
    "languages": string[], // array of languages (e.g. ["English", "Hindi"])
    "workExperience": [
      {
        "role": string,
        "company": string,
        "duration": string,
        "description": string[] // list of bullet points
      }
    ],
    "education": [
      {
        "degree": string,
        "school": string,
        "duration": string,
        "gpa": string // e.g. "3.8/4.0" or "9.0 CGPA" or leave blank if not specified
      }
    ],
    "projects": [
      {
        "name": string,
        "description": string[] // list of project details or bullet points
      }
    ],
    "certifications": string[] // list of certification names
  },
  "explanation": string
}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isResume: { type: Type.BOOLEAN },
                confidenceScore: { type: Type.INTEGER },
                missingItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionableImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
                detectedProfile: {
                  type: Type.OBJECT,
                  properties: {
                    fullName: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                    workExperience: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          role: { type: Type.STRING },
                          company: { type: Type.STRING },
                          duration: { type: Type.STRING },
                          description: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["role", "company", "duration", "description"]
                      }
                    },
                    education: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          degree: { type: Type.STRING },
                          school: { type: Type.STRING },
                          duration: { type: Type.STRING },
                          gpa: { type: Type.STRING }
                        },
                        required: ["degree", "school", "duration"]
                      }
                    },
                    projects: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          description: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["name", "description"]
                      }
                    },
                    certifications: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["fullName", "email", "phone", "summary", "skills", "languages", "workExperience", "education", "projects", "certifications"]
                },
                explanation: { type: Type.STRING }
              },
              required: ["isResume", "confidenceScore", "missingItems", "actionableImprovements", "detectedProfile", "explanation"]
            }
          }
        });
        parsedResponseText = response.text || "";
      } else {
        // Fallback: Multimodal parsing path if PDF is image-only/scanned
        const pdfPart = {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Data
          }
        };
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            pdfPart,
            {
              text: `You are an expert recruiter and applicant tracking system (ATS) scanner.
Analyze the attached resume and deliver an evaluation strictly in JSON.
IMPORTANT: This is a multi-page resume document. You MUST process the entire document from all pages. Do not truncate, omit, or ignore any work experiences, projects, education entries, or skills from any page. If the resume has 2 pages, extract 2 pages of info. If it has 3 pages, extract 3 pages of info. Every single work experience and education history entry must be extracted and returned in the detectedProfile.

First, verify if this document is actually a professional resume. (A cover letter, template with placeholder names, food recipe, empty text, or random non-resume file counts as isResume: false).
Identify if any critical standard resume sections or standard contact info are missing.
Extract key candidate profile information if available. Ensure detectedProfile includes all found experiences, skills, education, and languages.

Return a JSON payload with exactly this schema:
{
  "isResume": boolean,
  "confidenceScore": number, // 0 to 100 on how complete and professional the resume is
  "missingItems": string[], // e.g. ["Professional Summary", "LinkedIn profile link", "Dates for work experiences", "Education details"]
  "actionableImprovements": string[], // List of 3-5 specific bullet points for the candidate to improve their resume
  "detectedProfile": {
    "fullName": string,
    "email": string,
    "phone": string,
    "summary": string,
    "skills": string[],
    "languages": string[], // array of languages (e.g. ["English", "Hindi"])
    "workExperience": [
      {
        "role": string,
        "company": string,
        "duration": string,
        "description": string[] // list of bullet points
      }
    ],
    "education": [
      {
        "degree": string,
        "school": string,
        "duration": string,
        "gpa": string // e.g. "3.8/4.0" or "9.0 CGPA" or leave blank if not specified
      }
    ],
    "projects": [
      {
        "name": string,
        "description": string[] // list of project details or bullet points
      }
    ],
    "certifications": string[] // list of certification names
  },
  "explanation": string
}`
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isResume: { type: Type.BOOLEAN },
                confidenceScore: { type: Type.INTEGER },
                missingItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionableImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
                detectedProfile: {
                  type: Type.OBJECT,
                  properties: {
                    fullName: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                    workExperience: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          role: { type: Type.STRING },
                          company: { type: Type.STRING },
                          duration: { type: Type.STRING },
                          description: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["role", "company", "duration", "description"]
                      }
                    },
                    education: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          degree: { type: Type.STRING },
                          school: { type: Type.STRING },
                          duration: { type: Type.STRING },
                          gpa: { type: Type.STRING }
                        },
                        required: ["degree", "school", "duration"]
                      }
                    },
                    projects: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          description: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["name", "description"]
                      }
                    },
                    certifications: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["fullName", "email", "phone", "summary", "skills", "languages", "workExperience", "education", "projects", "certifications"]
                },
                explanation: { type: Type.STRING }
              },
              required: ["isResume", "confidenceScore", "missingItems", "actionableImprovements", "detectedProfile", "explanation"]
            }
          }
        });
        parsedResponseText = response.text || "";
      }
    } else {
      // It's a DOCX/Word document or other file
      // Extract text using mammoth
      let docText = "";
      try {
        const buffer = Buffer.from(base64Data, "base64");
        const extractResult = await mammoth.extractRawText({ buffer });
        docText = extractResult.value || "";
      } catch (err: any) {
        console.error("Mammoth extraction error:", err);
        throw new Error("Failed to read text from Word document. Please ensure it is not password-protected.");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert recruiter and applicant tracking system (ATS) scanner.
Analyze the following resume text extracted from a Word document and deliver an evaluation strictly in JSON.
IMPORTANT: This is a multi-page resume document. You MUST process the entire text from all pages. Do not truncate, omit, or ignore any work experiences, projects, education entries, or skills from any page. If the resume has 2 pages, extract 2 pages of info. If it has 3 pages, extract 3 pages of info. Every single work experience and education history entry must be extracted and returned in the detectedProfile.

First, verify if this text is actually from a professional resume. (A cover letter, template with placeholder names, food recipe, empty text, or random non-resume text counts as isResume: false).
Identify if any critical standard resume sections or standard contact info are missing.
Extract key candidate profile information if available. Ensure detectedProfile includes all found experiences, skills, education, and languages.

Resume Text:
"""
${docText}
"""

Return a JSON payload with exactly this schema:
{
  "isResume": boolean,
  "confidenceScore": number, // 0 to 100 on how complete and professional the resume is
  "missingItems": string[], // e.g. ["Professional Summary", "LinkedIn profile link", "Dates for work experiences", "Education details"]
  "actionableImprovements": string[], // List of 3-5 specific bullet points for the candidate to improve their resume
  "detectedProfile": {
    "fullName": string,
    "email": string,
    "phone": string,
    "summary": string,
    "skills": string[],
    "languages": string[], // array of languages (e.g. ["English", "Hindi"])
    "workExperience": [
      {
        "role": string,
        "company": string,
        "duration": string,
        "description": string[] // list of bullet points
      }
    ],
    "education": [
      {
        "degree": string,
        "school": string,
        "duration": string,
        "gpa": string // e.g. "3.8/4.0" or "9.0 CGPA" or leave blank if not specified
      }
    ],
    "projects": [
      {
        "name": string,
        "description": string[] // list of project details or bullet points
      }
    ],
    "certifications": string[] // list of certification names
  },
  "explanation": string
}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isResume: { type: Type.BOOLEAN },
              confidenceScore: { type: Type.INTEGER },
              missingItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              actionableImprovements: { type: Type.ARRAY, items: { type: Type.STRING } },
              detectedProfile: {
                type: Type.OBJECT,
                properties: {
                  fullName: { type: Type.STRING },
                  email: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  languages: { type: Type.ARRAY, items: { type: Type.STRING } },
                  workExperience: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        role: { type: Type.STRING },
                        company: { type: Type.STRING },
                        duration: { type: Type.STRING },
                        description: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["role", "company", "duration", "description"]
                    }
                  },
                  education: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        degree: { type: Type.STRING },
                        school: { type: Type.STRING },
                        duration: { type: Type.STRING },
                        gpa: { type: Type.STRING }
                      },
                      required: ["degree", "school", "duration"]
                    }
                  },
                  projects: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["name", "description"]
                    }
                  },
                  certifications: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["fullName", "email", "phone", "summary", "skills", "languages", "workExperience", "education", "projects", "certifications"]
              },
              explanation: { type: Type.STRING }
            },
            required: ["isResume", "confidenceScore", "missingItems", "actionableImprovements", "detectedProfile", "explanation"]
          }
        }
      });
      parsedResponseText = response.text || "";
    }

    if (!parsedResponseText) {
      throw new Error("No response from AI analyzer.");
    }

    const result = JSON.parse(parsedResponseText.trim());
    if (result.isResume) {
      const dp = result.detectedProfile;
      if (!dp || !dp.fullName || ((!dp.workExperience || dp.workExperience.length === 0) && (!dp.education || dp.education.length === 0))) {
        res.status(422).json({ error: "The uploaded resume could not be fully processed. Please make sure it is not corrupted and contains extractable work experiences/education details." });
        return;
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error in analyze-uploaded-resume:", error);
    res.status(500).json({ error: error.message || "An error occurred while analyzing the resume file." });
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

startServer();
