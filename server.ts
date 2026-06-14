import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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
    const { jdText } = req.body;
    if (!jdText || typeof jdText !== 'string' || jdText.trim().length === 0) {
      res.status(400).json({ error: "Job description text is required" });
      return;
    }

    const ai = getAI();
    const prompt = `You are an expert recruiter and career mentor specializing in fresh graduates and entry-level professionals.
Analyze the following Job Description (JD) and simplify it to help candidates understand companies actual search requirements.
Strip away corporate jargon and explain clearly what they are looking for in plain language, key high-priority skills, core responsibilities, and target automated keyword search words.

Job Description:
"""
${jdText}
"""

Format your response strictly as JSON with this schema:
{
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
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
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
          required: ["companyPitch", "requiredSkills", "keyResponsibilities", "candidateExpectations", "keywordsToTarget"]
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
2. Update the Professional Summary (Resume.summary) so it directly presents the candidate as a highly relevant fit for this specific job context.
3. Keep the education section factual but clarify or format it perfectly.
4. Suggest adding missing candidate skills to Resume.skills that directly map to the JD's requirements, provided they make sense for a graduate.
5. Provide a list of "suggestions" with clear reasons why they were made and how they improve the resume.

Format your response strictly as JSON matching this schema:
{
  "suggestions": [
    {
      "id": "A unique slug or ID (e.g., s-1, s-2)",
      "type": "rewrite" or "missing" or "ats" or "general",
      "section": "summary" or "experience" or "skills" or "education",
      "targetId": "Identify target id if it's experience, e.g., the exact experience ID",
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
                  section: { type: Type.STRING, enum: ["summary", "experience", "skills", "education", "general"] },
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
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["fullName", "email", "phone", "summary", "workExperience", "education", "skills"]
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
