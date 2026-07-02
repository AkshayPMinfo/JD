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

function cleanLigatures(text: string): string {
  return text
    .replace(/f\s+i/gi, "fi")
    .replace(/(\w+)\s+fi\s+(\w+)/gi, "$1fi$2")
    .replace(/(\w+)\s+fi/gi, "$1fi")
    .replace(/fi\s+(\w+)/gi, "fi$1")
    .replace(/(\w+)\s+@\s+(\w+)/g, "$1@$2")
    .replace(/@\s+(\w+)\s*\.\s*(c\s+om|com)/gi, "@$1.com")
    .replace(/\b(c\s+om)\b/gi, "com")
    .replace(/[ \t]+/g, " ");
}

/**
 * Deterministic Rules-Based Parser for Resumes
 */
export function rulesBasedParseResume(extractedText: string, fileName: string) {
  const cleanedText = cleanLigatures(extractedText);
  const rawLines = cleanedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Filter out footer/header noise
  const noiseRegex = /^(present|page \d+|-- \d+ of \d+ --)$/i;
  const lines: string[] = [];
  for (const line of rawLines) {
    if (!noiseRegex.test(line)) {
      lines.push(line);
    }
  }

  // Merge split bullets and preserve multi-line items
  const mergedLines: string[] = [];
  const bulletSymbolRegex = /^[-*•●▪o▪]$/;
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    if (bulletSymbolRegex.test(current) && i < lines.length - 1) {
      mergedLines.push(current + " " + lines[i + 1].trim());
      i++;
    } else {
      mergedLines.push(current);
    }
  }

  // Extract contact info
  let fullName = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (/resume|cv|my_resume|draft/i.test(fullName)) {
    fullName = "";
  }
  for (const line of mergedLines.slice(0, 8)) {
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && !/[0-9@:/]/.test(line) && line.length < 60) {
      const isHeaderSec = /^(experience|work history|employment|career|skills|languages|education|certifications|projects|summary)/i.test(line);
      if (!isHeaderSec) {
        fullName = line;
        break;
      }
    }
  }
  if (!fullName) fullName = "Resume Candidate";

  const emailMatch = cleanedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  const phoneMatch = cleanedText.match(/\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/) ||
                     cleanedText.match(/\b\d{3}[-.\s]??\d{3}[-.\s]??\d{4}\b/);
  const phone = phoneMatch ? phoneMatch[0] : '';

  const sectionHeaders = {
    experience: /^(experience|work history|employment|career|professional experience|work record|work experience|experience record)$/i,
    education: /^(education|academic|university|college|school|academic profile|education background|academic record|education & credentials|education & certifications)$/i,
    projects: /^(projects|personal projects|academic projects|key projects|repositories|portfolio|selected projects)$/i,
    skills: /^(skills|technical skills|technologies|tools|competencies|expertise|core competencies|core skills|skills & expertise)$/i,
    certifications: /^(certifications?|licenses?|credentials?)$/i,
    languages: /^(languages)$/i,
    achievements: /^(achievements|awards|honors|extracurriculars|key achievements)$/i,
    summary: /^(summary|objective|profile|about me|professional summary|executive summary)$/i
  };

  const singleDate = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*\.?[\s,]*\d{4}|\d{1,2}\/\d{4}|\b\d{4}\b)/i;
  const dateRegex = new RegExp(`(${singleDate.source})\\s*[-–—]\\s*(${singleDate.source}|present|current|active)`, 'i');
  const jobKeywords = /\b(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm)\b/i;
  const actionVerbs = /^(collaborated|conducted|managed|coordinated|developed|created|executed|leveraged|designed|analyzed|implemented|spearheaded|built|partnered|authored|facilitated|mapped|drafted|assisted|led|oversaw)/i;

  let currentSection = 'header';
  let lastRoutedSection = 'header';

  const workExperience: any[] = [];
  const education: any[] = [];
  const projects: any[] = [];
  const skills: string[] = [];
  const certifications: string[] = [];
  const languages: string[] = [];
  const achievements: string[] = [];
  let summary = '';

  for (let i = 0; i < mergedLines.length; i++) {
    let line = mergedLines[i].replace(/[\u2013\u2014\u2015]/g, "-").trim();
    
    // Split leaked column items
    const leakMatch = line.match(/(?:\.|\)|•|●)\s+([A-Z][a-zA-Z0-9\s,'’\.\-&]+(?:[-–—])\s*(?:[a-zA-Z\s]+)?(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm|consultant|director|writer|designer|assistant|strategist|partner|representative|executive|supervisor|officer|president)[a-z]*)$/i);
    if (leakMatch) {
      const leakedText = leakMatch[1].trim();
      line = line.replace(leakMatch[1], "").trim();
      mergedLines.splice(i + 1, 0, leakedText);
    }

    const cleanLine = line.replace(/^[-*•●▪o▪]\s*/, '').trim();

    // 1. Check for section header
    let headerMatched = false;
    for (const [sec, regex] of Object.entries(sectionHeaders)) {
      if (cleanLine.length < 40 && regex.test(cleanLine) && !cleanLine.includes(':') && !cleanLine.includes('|')) {
        currentSection = sec;
        lastRoutedSection = sec;
        headerMatched = true;
        break;
      }
    }
    if (headerMatched) continue;

    // 2. Determine line type
    const isBullet = /^[-*•●▪o▪]/.test(line) || line.startsWith('-');
    const hasDate = dateRegex.test(line);

    if (currentSection === 'experience' && !isBullet && !hasDate && i < mergedLines.length - 1 && dateRegex.test(mergedLines[i + 1])) {
      continue;
    }

    // Heuristic: experience bullet routed elsewhere
    const isExperienceBullet = isBullet && (
      cleanLine.length > 30 || actionVerbs.test(cleanLine)
    );

    if (isExperienceBullet) {
      if (workExperience.length > 0) {
        workExperience[workExperience.length - 1].description.push(cleanLine);
        currentSection = 'experience';
        lastRoutedSection = 'experience';
        continue;
      }
    }

    // 3. Handle specific sections
    if (hasDate) {
      if (currentSection === 'experience') {
        const dateMatch = line.match(dateRegex);
        const duration = dateMatch ? dateMatch[0] : "";
        let roleCompanyText = line.replace(duration, "").replace(/^[,\-\s]+|[,\-\s]+$/g, "").trim();

        if (!roleCompanyText && i > 0) {
          const prevLine = mergedLines[i - 1].replace(/[\u2013\u2014\u2015]/g, "-").trim();
          const isPrevBullet = /^[-*•●▪o▪]/.test(prevLine) || prevLine.startsWith('-');
          if (!isPrevBullet && !Object.values(sectionHeaders).some(rx => rx.test(prevLine))) {
            roleCompanyText = prevLine;
          }
        }

        const parts = roleCompanyText.split(/[-–—|,\t]/).map(s => s.trim()).filter(Boolean);
        let role = "Role";
        let company = "Company";

        if (parts.length > 0) {
          const roleIdx = parts.findIndex(p => jobKeywords.test(p));
          if (roleIdx !== -1) {
            role = parts[roleIdx];
            company = parts.filter((_, idx) => idx !== roleIdx).join(", ");
          } else {
            company = parts[0];
            role = parts.slice(1).join(", ") || "Role";
          }
        }

        workExperience.push({
          id: `exp-${Date.now()}-${workExperience.length}`,
          role,
          company,
          duration,
          description: []
        });
        lastRoutedSection = 'experience';
      }
      continue;
    }

    // 4. Handle continuation lines or text blocks
    if (currentSection === 'header' || currentSection === 'summary') {
      if (line.includes('@') || (phone && line.includes(phone)) || /github\.com|linkedin\.com/i.test(line)) {
        continue;
      }
      if (fullName && line.toLowerCase().includes(fullName.toLowerCase())) {
        continue;
      }
      if (summary.length < 2000) {
        summary += (summary ? '\n' : '') + line;
      }
    } else if (currentSection === 'education') {
      const schoolKeywords = /\b(college|university|school|institute|academy|inst\b|high school)\b/i;
      const degreeKeywords = /\b(bachelor|master|phd|b\.a\.|m\.a\.|b\.s\.|m\.s\.|btech|mtech|bca|mca|degree|diploma|10th|12th|hsc|ssc|metric|matriculation|intermediate)\b/i;

      let duration = '';
      if (i < mergedLines.length - 1) {
        const nextLine = mergedLines[i + 1];
        const nextDateMatch = nextLine.match(/\b(19|20)\d{2}\b/g) || nextLine.match(/\b(19|20)\d{2}\s*[-–—]\s*(?:(19|20)\d{2}|present)\b/i);
        if (nextDateMatch && !schoolKeywords.test(nextLine) && !degreeKeywords.test(nextLine)) {
          duration = nextLine;
          i++; // skip next line containing the date
        }
      }

      const gpaMatch = line.match(/gpa\s*:\s*\d+(\.\d+)?/i) || line.match(/\b\d\.\d{1,2}\b/);
      const gpa = gpaMatch ? gpaMatch[0] : '';

      let cleanRemainder = line;
      if (gpa) cleanRemainder = cleanRemainder.replace(gpa, "").trim();
      cleanRemainder = cleanRemainder.replace(/^[,\-\s]+|[,\-\s]+$/g, "").trim();

      const parts = cleanRemainder.split(/[-|,\t]/).map(s => s.trim()).filter(Boolean);
      let school = 'School/Institution';
      let degree = 'Degree';

      if (parts.length > 0) {
        const schoolIdx = parts.findIndex(p => schoolKeywords.test(p));
        const degreeIdx = parts.findIndex(p => degreeKeywords.test(p));

        if (schoolIdx !== -1 && degreeIdx !== -1) {
          school = parts[schoolIdx];
          degree = parts[degreeIdx];
        } else if (schoolIdx !== -1) {
          school = parts[schoolIdx];
          degree = parts.filter((_, idx) => idx !== schoolIdx).join(", ");
        } else if (degreeIdx !== -1) {
          degree = parts[degreeIdx];
          school = parts.filter((_, idx) => idx !== degreeIdx).join(", ");
        } else {
          school = parts[0];
          degree = parts.slice(1).join(", ") || "Degree";
        }
      }

      education.push({
        id: `edu-${Date.now()}-${education.length}`,
        school,
        degree,
        duration,
        gpa
      });
      lastRoutedSection = 'education';
    } else if (currentSection === 'skills') {
      const parts = line.split(/[,•|·\t\-]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      for (const p of parts) {
        const cleanSkill = p.replace(/^[-*•●▪o▪]\s*/, '').trim();
        if (cleanSkill && !skills.includes(cleanSkill)) skills.push(cleanSkill);
      }
    } else if (currentSection === 'languages') {
      const parts = line.split(/[,•|·\t]/).map(s => s.trim()).filter(s => s.length > 1);
      for (const p of parts) {
        const cleanLang = p.replace(/^[-*•●▪o▪]\s*/, '').trim();
        if (cleanLang && !languages.includes(cleanLang)) languages.push(cleanLang);
      }
    } else if (currentSection === 'certifications') {
      const parts = line.split(/[,•|·\t]/).map(s => s.trim()).filter(s => s.length > 1);
      for (const p of parts) {
        const cleanCert = p.replace(/^[-*•●▪o▪]\s*/, '').trim();
        if (cleanCert && !certifications.includes(cleanCert)) certifications.push(cleanCert);
      }
    } else if (currentSection === 'achievements') {
      achievements.push(cleanLine);
    } else if (currentSection === 'projects') {
      const isProjBullet = isBullet && (cleanLine.length > 25 || actionVerbs.test(cleanLine));
      if (isProjBullet) {
        if (projects.length === 0) {
          projects.push({
            id: `proj-${Date.now()}-0`,
            name: 'Project Entry',
            description: [],
            duration: ''
          });
        }
        projects[projects.length - 1].description.push(cleanLine);
        lastRoutedSection = 'projects';
      } else {
        projects.push({
          id: `proj-${Date.now()}-${projects.length}`,
          name: cleanLine,
          description: [],
          duration: ''
        });
        lastRoutedSection = 'projects';
      }
    } else {
      // Continuation of previous line depending on lastRoutedSection
      if (lastRoutedSection === 'experience' && workExperience.length > 0) {
        const lastExp = workExperience[workExperience.length - 1];
        if (lastExp.description.length > 0) {
          lastExp.description[lastExp.description.length - 1] += " " + line;
        } else {
          lastExp.description.push(line);
        }
      } else if (lastRoutedSection === 'projects' && projects.length > 0) {
        const lastProj = projects[projects.length - 1];
        if (lastProj.description.length > 0) {
          lastProj.description[lastProj.description.length - 1] += " " + line;
        } else {
          lastProj.description.push(line);
        }
      }
    }
  }

  return {
    isResume: true,
    confidenceScore: 95,
    reason: "Parsed successfully using rules-based validation engine.",
    indicators: [] as string[],
    detectedProfile: {
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

  // 2. Improve the Professional Summary using predefined templates that preserve candidate profile
  const title = jdAnalysis.jobTitle;
  const topSkills = jdSkills.slice(0, 3).join(", ");
  
  let enhancedSummary = "";
  if (resume.summary && resume.summary.trim().length > 10) {
    enhancedSummary = `${resume.summary.trim()} Seeking to leverage this background in a ${title} capacity, applying specialized competencies in ${topSkills} to drive key initiatives.`;
  } else {
    enhancedSummary = `Results-driven professional targeting the ${title} role, leveraging expertise in ${topSkills} to drive success and collaborate across cross-functional teams.`;
  }
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
  
  // Calculate keyword density score using actual keyword matching in the resume
  const resumeText = JSON.stringify(resume).toLowerCase();
  let matchedSkillsCount = 0;
  for (const skill of jdSkills) {
    if (resumeText.includes(skill.toLowerCase())) {
      matchedSkillsCount++;
    }
  }
  
  const skillScore = jdSkills.length > 0 ? Math.round((matchedSkillsCount / jdSkills.length) * 100) : 100;

  // Formatting criteria
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

  // Language/verb check (weak verb scan)
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

  const criteria = [
    {
      name: "Technical Keyword Density",
      description: "Checks how many key technical skills from the job description are present in your resume.",
      passed: skillScore >= 60,
      feedback: skillScore >= 60 
        ? "Excellent keyword density! Your resume contains a significant number of keywords requested in the JD." 
        : `Your resume matches only ${matchedSkillsCount} of ${jdSkills.length} key skills. Consider adding missing keywords: ${jdSkills.filter(s => !resumeText.includes(s.toLowerCase())).slice(0, 5).join(", ")}.`,
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
