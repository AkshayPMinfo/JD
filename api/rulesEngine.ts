// Predefined dictionary of popular technical, business, and soft skills
const SKILL_DICTIONARY = [
  // Programming Languages
  "javascript", "typescript", "python", "java", "c++", "c#", "ruby", "go", "rust", "php", "swift", "kotlin", "scala", "r", "sql", "html", "css", "sass", "shell", "bash", ".net",
  // Frontend
  "react", "next.js", "nextjs", "vue", "angular", "svelte", "nuxt", "gatsby", "tailwind", "bootstrap", "mui", "material-ui", "webpack", "vite", "redux", "recoil", "mobx",
  // Backend & Databases
  "node.js", "nodejs", "express", "nest.js", "nestjs", "django", "flask", "fastapi", "spring boot", "rails", "postgres", "postgresql", "mysql", "mongodb", "redis", "sqlite", "cassandra", "dynamodb", "prisma", "sequelize", "mongoose",
  // Cloud & DevOps
  "aws", "amazon web services", "gcp", "google cloud", "azure", "docker", "kubernetes", "ci/cd", "github actions", "jenkins", "terraform", "vercel", "netlify", "heroku", "nginx", "linux",
  // Product, Project & Design
  "product management", "project management", "agile", "scrum", "kanban", "jira", "confluence", "figma", "sketch", "adobe xd", "photoshop", "illustrator", "wireframing", "prototyping", "user research", "competitor analysis", "product roadmap", "backlog grooming", "prds", "user stories", "ab testing", "mixpanel", "amplitude", "google analytics",
  // General & Business
  "data analysis", "tableau", "power bi", "excel", "powerpoint", "strategic planning", "stakeholder management", "communication", "team leadership", "problem solving", "critical thinking", "customer support", "sales", "marketing", "seo", "growth hacking", "copywriting"
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseExperienceHeaderLine(line: string) {
  let duration = "";
  let role = "";
  let company = "";

  const dateRegex = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{4}|\d{4})\s*[-–—]\s*(?:present|current|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{4}|\d{4})\b/i;
  const match = line.match(dateRegex);
  if (match) {
    duration = match[0];
    line = line.replace(duration, "").trim();
  }

  const parts = line.split(/[,|\-\u2013\u2014|]/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 0) {
    const jobKeywords = /\b(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm)\b/i;
    const roleIndex = parts.findIndex(p => jobKeywords.test(p));
    if (roleIndex !== -1) {
      role = parts[roleIndex];
      company = parts.filter((_, idx) => idx !== roleIndex).join(", ");
    } else {
      role = parts[0];
      company = parts.slice(1).join(", ");
    }
  }

  return { role, company, duration };
}

/**
 * Deterministic Rules-Based Parser for Resumes
 */
export function rulesBasedParseResume(extractedText: string, fileName: string) {
  const cleanText = extractedText.replace(/\r/g, "\n");
  const rawLines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Filter out footer/header noise
  const lines = rawLines.filter(line => {
    const l = line.toLowerCase();
    if (/^present$/i.test(l)) return false;
    if (/^-- \d+ of \d+ --$/i.test(l)) return false;
    if (/^page \d+$/i.test(l)) return false;
    return true;
  });

  // Extract fullName from first few lines, fallback to filename
  let fullName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (/resume|cv|my_resume|draft/i.test(fullName)) {
    fullName = "";
  }
  for (const line of lines.slice(0, 8)) {
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && !/[0-9@:/]/.test(line) && line.length < 60) {
      fullName = line;
      break;
    }
  }
  if (!fullName) fullName = "Resume Candidate";

  // Extract email
  const emailMatch = cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Extract phone
  const phoneMatch = cleanText.match(/\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/) ||
                     cleanText.match(/\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  // Segment sections
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
    experience: /^(experience|work history|employment|career|professional experience|work record|work experience|experience record)$/i,
    education: /^(education|academic|university|college|school|academic profile|education background|academic record|education & credentials|education & certifications)$/i,
    projects: /^(projects|personal projects|academic projects|key projects|repositories|portfolio|selected projects)$/i,
    skills: /^(skills|technical skills|technologies|tools|competencies|expertise|core competencies|core skills|skills & expertise|core skills)$/i,
    certifications: /^(certifications?|licenses?|credentials?)$/i,
    languages: /^(languages)$/i,
    achievements: /^(achievements|awards|honors|extracurriculars|key achievements)$/i,
    summary: /^(summary|objective|profile|about me|professional summary|executive summary)$/i
  };

  const jobKeywords = /\b(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm)\b/i;
  const dateRegex = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{4}|\d{4})\s*[-–—]\s*(?:present|current|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{4}|\d{4})\b/i;

  for (const line of lines) {
    let headerMatched = false;
    const cleanLine = line.replace(/^[-*•o▪\d+\.]\s*/, '').trim();
    for (const [sec, regex] of Object.entries(sectionHeaders)) {
      if (cleanLine.length < 40 && regex.test(cleanLine) && !cleanLine.includes(':') && !cleanLine.includes('|')) {
        currentSection = sec;
        headerMatched = true;
        break;
      }
    }
    if (headerMatched) continue;

    if (currentSection === 'summary') {
      if (summary.length < 1000) {
        summary += (summary ? ' ' : '') + line;
      }
    } else if (currentSection === 'skills') {
      const parts = line.split(/[,•|·\t\-]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      for (const p of parts) {
        if (p && !skills.includes(p)) skills.push(p);
      }
    } else if (currentSection === 'certifications') {
      const parts = line.split(/[,•|·\t]/).map(s => s.trim()).filter(s => s.length > 1);
      for (const p of parts) {
        if (p && !certifications.includes(p)) certifications.push(p);
      }
    } else if (currentSection === 'languages') {
      const parts = line.split(/[,•|·\t]/).map(s => s.trim()).filter(s => s.length > 1);
      for (const p of parts) {
        if (p && !languages.includes(p)) languages.push(p);
      }
    } else if (currentSection === 'achievements') {
      achievements.push(line);
    } else if (currentSection === 'experience') {
      const isBullet = /^[-*•o▪\d+\.]/.test(line) || line.startsWith('-');
      const cleanBullet = line.replace(/^[-*•o▪\d+\.]\s*/, '').trim();

      const hasDate = dateRegex.test(line);
      const isHeader = hasDate || ((line.includes('|') || line.includes('-')) && jobKeywords.test(line));

      if (isBullet) {
        if (workExperience.length === 0) {
          workExperience.push({
            id: `exp-${Date.now()}-0`,
            role: 'Professional Experience',
            company: 'Company',
            duration: '',
            description: []
          });
        }
        workExperience[workExperience.length - 1].description.push(cleanBullet);
      } else if (isHeader) {
        const parsed = parseExperienceHeaderLine(line);
        const lastExp = workExperience[workExperience.length - 1];
        if (lastExp && lastExp.description.length === 0) {
          if (parsed.duration) lastExp.duration = parsed.duration;
          if (parsed.role) lastExp.role = parsed.role;
          if (parsed.company) {
            lastExp.company = (lastExp.company && lastExp.company !== 'Company' && lastExp.company !== 'Organization')
              ? lastExp.company + ', ' + parsed.company
              : parsed.company;
          }
        } else {
          workExperience.push({
            id: `exp-${Date.now()}-${workExperience.length}`,
            role: parsed.role || 'Experience Entry',
            company: parsed.company || 'Organization',
            duration: parsed.duration || 'Dates',
            description: []
          });
        }
      } else {
        // Line continuation
        if (workExperience.length > 0) {
          const lastExp = workExperience[workExperience.length - 1];
          if (lastExp.description.length > 0) {
            const idx = lastExp.description.length - 1;
            lastExp.description[idx] = lastExp.description[idx] + ' ' + line;
          } else {
            lastExp.company = lastExp.company + ' ' + line;
          }
        }
      }
    } else if (currentSection === 'projects') {
      const isBullet = /^[-*•o▪\d+\.]/.test(line) || line.startsWith('-');
      const cleanBullet = line.replace(/^[-*•o▪\d+\.]\s*/, '').trim();
      if (isBullet) {
        if (projects.length === 0) {
          projects.push({
            id: `proj-${Date.now()}-0`,
            name: 'Project Entry',
            description: [],
            duration: ''
          });
        }
        projects[projects.length - 1].description.push(cleanBullet);
      } else {
        const lastProj = projects[projects.length - 1];
        if (lastProj && lastProj.description.length === 0) {
          lastProj.name = lastProj.name + ' ' + line;
        } else {
          if (lastProj && lastProj.description.length > 0) {
            const idx = lastProj.description.length - 1;
            lastProj.description[idx] = lastProj.description[idx] + ' ' + line;
          } else {
            projects.push({
              id: `proj-${Date.now()}-${projects.length}`,
              name: line,
              description: [],
              duration: ''
            });
          }
        }
      }
    } else if (currentSection === 'education') {
      const schoolKeywords = /\b(college|university|school|institute|academy|inst\b|high school)\b/i;
      const degreeKeywords = /\b(bachelor|master|phd|b\.a\.|m\.a\.|b\.s\.|m\.s\.|btech|mtech|bca|mca|degree|diploma|10th|12th|hsc|ssc|metric|matriculation|intermediate)\b/i;

      const dateMatch = line.match(/\b(19|20)\d{2}\b/g);
      const gpaMatch = line.match(/gpa\s*:\s*\d+(\.\d+)?/i) || line.match(/\b\d\.\d{1,2}\b/);
      const duration = dateMatch ? dateMatch.join(' - ') : '';
      const gpa = gpaMatch ? gpaMatch[0] : '';

      let cleanRemainder = line;
      if (dateMatch) {
        for (const d of dateMatch) {
          cleanRemainder = cleanRemainder.replace(d, "");
        }
      }
      if (gpa) cleanRemainder = cleanRemainder.replace(gpa, "").trim();

      cleanRemainder = cleanRemainder.replace(/^[,\-\s]+|[,\-\s]+$/g, "").trim();

      const parts = cleanRemainder.split(/[,|\-\u2013\u2014]/).map(s => s.trim()).filter(Boolean);
      let school = '';
      let degree = '';
      if (parts.length > 0) {
        const schoolIdx = parts.findIndex(p => schoolKeywords.test(p));
        if (schoolIdx !== -1) {
          school = parts[schoolIdx];
          degree = parts.filter((_, idx) => idx !== schoolIdx).join(", ");
        } else {
          const degreeIdx = parts.findIndex(p => degreeKeywords.test(p));
          if (degreeIdx !== -1) {
            degree = parts[degreeIdx];
            school = parts.filter((_, idx) => idx !== degreeIdx).join(", ");
          } else {
            school = parts.join(", ");
          }
        }
      }

      const lastEdu = education[education.length - 1];
      const isPureDateOrGpa = (cleanRemainder.length === 0);
      const shouldStartNew = !lastEdu || (!isPureDateOrGpa && school && lastEdu.school && lastEdu.school !== 'Institution' && lastEdu.school.toLowerCase() !== school.toLowerCase());
      
      if (shouldStartNew) {
        education.push({
          id: `edu-${Date.now()}-${education.length}`,
          degree: degree || 'Degree',
          school: school || 'Institution',
          duration: duration || '',
          gpa: gpa || ''
        });
      } else {
        if (school) {
          lastEdu.school = (lastEdu.school && lastEdu.school !== 'Institution') ? lastEdu.school + ', ' + school : school;
        }
        if (degree) {
          lastEdu.degree = (lastEdu.degree && lastEdu.degree !== 'Degree') ? lastEdu.degree + ', ' + degree : degree;
        }
        if (duration) {
          lastEdu.duration = lastEdu.duration ? lastEdu.duration + ' ' + duration : duration;
        }
        if (gpa) {
          lastEdu.gpa = lastEdu.gpa ? lastEdu.gpa + ' ' + gpa : gpa;
        }
      }
    }
  }

  return {
    isResume: true,
    confidenceScore: 90,
    reason: "Parsed successfully using rules-based validation engine.",
    indicators: [] as string[],
    detectedProfile: {
      fullName,
      email,
      phone,
      linkedin: '',
      website: '',
      location: '',
      summary: summary || 'Professional summary not found.',
      workExperience,
      education,
      projects,
      skills,
      certifications,
      languages,
      achievements
    }
  };
}

/**
 * Deterministic Rules-Based Parser for Job Descriptions
 */
export function rulesBasedSimplifyJd(jdText: string) {
  const cleanText = jdText.toLowerCase();
  
  // Extract Job Title
  let jobTitle = "Tailored Position";
  const commonTitles = [
    "software engineer", "frontend developer", "backend developer", "fullstack developer",
    "web developer", "product manager", "project manager", "data scientist", "data analyst",
    "qa engineer", "system administrator", "devops engineer", "ui/ux designer",
    "associate product manager", "product owner", "business analyst", "software developer"
  ];
  for (const title of commonTitles) {
    if (cleanText.includes(title)) {
      jobTitle = title.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      break;
    }
  }

  // Match skills against dictionary
  const matchedSkills: string[] = [];
  for (const skill of SKILL_DICTIONARY) {
    const escaped = escapeRegExp(skill);
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9#+.-])${escaped}(?:$|[^a-zA-Z0-9#+.-])`, "i");
    if (regex.test(jdText)) {
      matchedSkills.push(skill);
    }
  }

  // Determine required (high priority) vs preferred (medium priority)
  const requiredSkills: { name: string; priority: "high" | "medium" }[] = [];
  const highPriorityKeywords = /\b(must|required|essential|minimum|need|expert|strong knowledge|experience with)\b/i;
  const sentences = jdText.split(/[.!?\n]/).map(s => s.trim()).filter(s => s.length > 0);

  for (const skill of matchedSkills) {
    let isHigh = false;
    for (const sent of sentences) {
      const escaped = escapeRegExp(skill);
      if (new RegExp(`(?:^|[^a-zA-Z0-9#+.-])${escaped}(?:$|[^a-zA-Z0-9#+.-])`, "i").test(sent) && highPriorityKeywords.test(sent)) {
        isHigh = true;
        break;
      }
    }
    const displayName = skill.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    requiredSkills.push({
      name: displayName,
      priority: isHigh ? "high" : "medium"
    });
  }

  if (requiredSkills.length === 0) {
    requiredSkills.push({ name: "Communication", priority: "high" });
    requiredSkills.push({ name: "Problem Solving", priority: "high" });
  }

  // Key responsibilities extraction
  const keyResponsibilities: string[] = [];
  const actionVerbs = /^(build|design|manage|coordinate|develop|maintain|lead|collaborate|support|implement|write|test|create|drive|oversee|ensure|work|partner)/i;
  for (const sent of sentences) {
    if (actionVerbs.test(sent) && sent.length > 20 && sent.length < 150) {
      keyResponsibilities.push(sent);
    }
  }
  if (keyResponsibilities.length === 0) {
    keyResponsibilities.push("Collaborate with cross-functional teams to deliver key product features.");
    keyResponsibilities.push("Assist in definition and scoping of product requirements.");
  }

  // Keywords to target
  const keywordsToTarget = requiredSkills.map(s => s.name).slice(0, 8);

  return {
    isValidJd: true,
    invalidReason: "",
    jobTitle,
    companyPitch: `Looking for a detail-oriented candidate to join as a ${jobTitle}.`,
    requiredSkills,
    keyResponsibilities: keyResponsibilities.slice(0, 5),
    candidateExpectations: [
      "Demonstrate problem-solving ability and strong technical understanding.",
      "Exhibit proactive collaboration with team members."
    ],
    keywordsToTarget,
    requiredQualifications: [
      "Bachelor's degree in a relevant field or equivalent experience."
    ]
  };
}

/**
 * Deterministic Rules-Based Tailoring
 */
export function rulesBasedTailorResume(resume: any, jdText: string) {
  const jdAnalysis = rulesBasedSimplifyJd(jdText);
  const jdSkills = jdAnalysis.requiredSkills.map(s => s.name);
  const jdSkillsLower = jdSkills.map(s => s.toLowerCase());

  // Deep copy original resume structure exactly
  const tailoredResume = JSON.parse(JSON.stringify(resume));

  // 1. Reorder existing skills based on JD relevance
  const existingSkills = resume.skills || [];
  const matchingSkills = existingSkills.filter((s: string) => jdSkillsLower.includes(s.toLowerCase()));
  const nonMatchingSkills = existingSkills.filter((s: string) => !jdSkillsLower.includes(s.toLowerCase()));
  tailoredResume.skills = [...matchingSkills, ...nonMatchingSkills];

  // 2. Improve the Professional Summary using predefined templates
  const title = jdAnalysis.jobTitle;
  const topSkills = jdSkills.slice(0, 3).join(", ");
  const enhancedSummary = `Detail-oriented professional with a strong foundation in ${topSkills}. Proven capability to collaborate across departments and drive project goals. Committed to applying analytical and collaborative skills to excel in the ${title} position.`;
  tailoredResume.summary = enhancedSummary;

  // 3. Generate suggestions (such as missing skills or recommended additions)
  const suggestions: any[] = [];
  let suggestionIndex = 1;

  // Suggesting missing skills
  const missingSkills = jdSkills.filter(s => !existingSkills.map((es: string) => es.toLowerCase()).includes(s.toLowerCase()));
  if (missingSkills.length > 0) {
    suggestions.push({
      id: `s-${suggestionIndex++}`,
      type: "missing",
      section: "skills",
      originalText: "",
      suggestedText: missingSkills.slice(0, 5).join(", "),
      reason: `Consider adding these high-priority keywords from the JD to your core skills section: ${missingSkills.slice(0, 5).join(", ")}.`,
      applied: false
    });
  }

  // Suggest summary change
  suggestions.push({
    id: `s-${suggestionIndex++}`,
    type: "rewrite",
    section: "summary",
    originalText: resume.summary || "",
    suggestedText: enhancedSummary,
    reason: `Updated the professional summary to align clearly with the ${title} job requirements and emphasize relevant competencies.`,
    applied: true
  });

  // Suggest general/ATS optimizations
  suggestions.push({
    id: `s-${suggestionIndex++}`,
    type: "ats",
    section: "general",
    originalText: "",
    suggestedText: "",
    reason: "Formatting check: Ensure margins are clean, contact info is up to date, and font family is consistent.",
    applied: false
  });

  return {
    suggestions,
    tailoredResume
  };
}

/**
 * Deterministic Rules-Based ATS Audit Scoring
 */
export function rulesBasedAtsAudit(resume: any, jdText: string) {
  const jdAnalysis = rulesBasedSimplifyJd(jdText);
  const jdSkills = jdAnalysis.requiredSkills.map(s => s.name);
  const jdSkillsLower = jdSkills.map(s => s.toLowerCase());

  const existingSkills = resume.skills || [];
  const existingSkillsLower = existingSkills.map((s: string) => s.toLowerCase());

  // 1. Keyword density check
  const matchedSkills = jdSkills.filter(s => existingSkillsLower.includes(s.toLowerCase()));
  const skillScore = jdSkills.length > 0 ? Math.round((matchedSkills.length / jdSkills.length) * 100) : 100;

  // 2. Formatting criteria
  const hasName = !!resume.fullName;
  const hasEmail = !!resume.email;
  const hasPhone = !!resume.phone;
  const hasExperience = Array.isArray(resume.workExperience) && resume.workExperience.length > 0;
  const hasEducation = Array.isArray(resume.education) && resume.education.length > 0;

  const formattingIssues: string[] = [];
  if (!hasEmail) formattingIssues.push("Email address is missing.");
  if (!hasPhone) formattingIssues.push("Phone number is missing.");
  if (!hasExperience) formattingIssues.push("Work experience section is missing.");
  if (!hasEducation) formattingIssues.push("Education section is missing.");

  const formattingScore = 100 - (formattingIssues.length * 15);

  // 3. Language/verb check (weak verb scan)
  const weakVerbs = /\b(worked on|helped|handled|made|responsible for|tasked with|assisted)\b/i;
  let weakVerbCount = 0;
  if (hasExperience) {
    for (const exp of resume.workExperience) {
      if (Array.isArray(exp.description)) {
        for (const bullet of exp.description) {
          if (weakVerbs.test(bullet)) weakVerbCount++;
        }
      }
    }
  }

  const languageScore = Math.max(40, 100 - (weakVerbCount * 10));

  // Compute final composite ATS score
  const finalScore = Math.round((skillScore * 0.5) + (formattingScore * 0.3) + (languageScore * 0.2));

  // Create audit criteria objects
  const criteria = [
    {
      name: "Technical Keyword Density",
      description: "Checks how many key technical skills from the job description are present in your resume.",
      passed: skillScore >= 60,
      feedback: skillScore >= 60 
        ? "Excellent keyword density! Your resume contains a significant number of keywords requested in the JD." 
        : `Your resume matches only ${matchedSkills.length} of ${jdSkills.length} key skills. Consider adding missing keywords: ${jdSkills.filter(s => !existingSkillsLower.includes(s.toLowerCase())).slice(0, 5).join(", ")}.`,
      category: "content" as const
    },
    {
      name: "Formatting & Layout Structure",
      description: "Ensures essential resume fields (Contact, Experience, Education) are present and readable.",
      passed: formattingIssues.length === 0,
      feedback: formattingIssues.length === 0
        ? "Standard headings, contact details, and essential resume structure are correctly present."
        : `Structure alert: ${formattingIssues.join(" ")}`,
      category: "formatting" as const
    },
    {
      name: "Action Verb Impact",
      description: "Scans for strong impact verbs (Initiated, Built, Spearheaded) instead of passive phrasing.",
      passed: languageScore >= 70,
      feedback: languageScore >= 70
        ? "Good use of action verbs in your experience bullet points."
        : "Found passive descriptors (e.g. 'responsible for', 'helped'). Replace with strong action verbs like Spearheaded, Orchestrated, or Implemented.",
      category: "language" as const
    }
  ];

  return {
    passed: finalScore >= 60,
    score: finalScore,
    criteria
  };
}
