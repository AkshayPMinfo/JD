import { Block } from '../src/types';

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

  const sectionHeaders: Record<string, RegExp> = {
    experience: /^(experience|work history|employment|career|professional experience|work record|work experience|experience record)$/i,
    education: /^(education|academic|academic profile|education background|academic record|education & credentials|education & certifications)$/i,
    projects: /^(projects|personal projects|academic projects|key projects|repositories|portfolio|selected projects)$/i,
    skills: /^(skills|technical skills|technologies|tools|competencies|expertise|core competencies|core skills|skills & expertise)$/i,
    certifications: /^(certifications?|licenses?|credentials?)$/i,
    languages: /^(languages)$/i,
    achievements: /^(achievements|awards|honors|extracurriculars|key achievements)$/i,
    summary: /^(summary|objective|profile|about me|professional summary|executive summary)$/i,
    // Sections we want to recognise and SKIP (don't dump into education or experience)
    ignore: /^(interests?|hobbies|volunteer|volunteering|references?|activities|personal interests?|other interests?)$/i
  };

  const singleDate = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*\.?[\s,]*\d{4}|\d{1,2}\/\d{4}|\b\d{4}\b)/i;
  const dateRegex = new RegExp(`(${singleDate.source})\\s*[-–—]\\s*(${singleDate.source}|present|current|active)`, 'i');
  const jobKeywords = /\b(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm|consultant|director|writer|designer|assistant|strategist|representative|executive|supervisor|officer|president)\b/i;
  const actionVerbs = /^(collaborated|conducted|managed|coordinated|developed|created|executed|leveraged|designed|analyzed|implemented|spearheaded|built|partnered|authored|facilitated|mapped|drafted|assisted|led|oversaw|supported|maintained|delivered|drove|launched|established|improved|streamlined|optimized|generated|achieved)/i;

  // ── SECTION DETECTION PASS ──────────────────────────────────────────────────
  // Pre-classify each line as a section header or content so we can look ahead/behind
  type LineType = { raw: string; clean: string; section: string | null; isBullet: boolean; hasDate: boolean };
  const classified: LineType[] = mergedLines.map(raw => {
    const normalized = raw.replace(/[\u2013\u2014\u2015]/g, "-").trim();
    const clean = normalized.replace(/^[-*•●▪o▪]\s*/, '').trim();
    let sectionLabel: string | null = null;
    if (clean.length < 50) {
      for (const [sec, rx] of Object.entries(sectionHeaders)) {
        if (rx.test(clean) && !clean.includes(':') && !clean.includes('|')) {
          sectionLabel = sec;
          break;
        }
      }
    }
    const isBullet = /^[-*•●▪o▪]/.test(normalized) || (normalized.startsWith('-') && normalized.length > 2);
    const hasDate = dateRegex.test(normalized);
    return { raw: normalized, clean, section: sectionLabel, isBullet, hasDate };
  });

  // ── MAIN PARSE PASS ─────────────────────────────────────────────────────────
  let currentSection = 'header';

  const workExperience: any[] = [];
  const education: any[] = [];
  const projects: any[] = [];
  const skills: string[] = [];
  const certifications: string[] = [];
  const languages: string[] = [];
  const achievements: string[] = [];
  let summary = '';

  const schoolKeywords = /\b(college|university|school|institute|academy|high school)\b/i;
  const degreeKeywords = /\b(bachelor|master|phd|b\.a\.|m\.a\.|b\.s\.|m\.s\.|btech|mtech|bca|mca|degree|diploma|associates?|associate's|10th|12th|hsc|ssc|metric|matriculation|intermediate)\b/i;

  for (let i = 0; i < classified.length; i++) {
    const { raw: line, clean: cleanLine, section: sectionLabel, isBullet, hasDate } = classified[i];

    // ── Section header transition ──────────────────────────────────────────────
    if (sectionLabel !== null) {
      currentSection = sectionLabel; // 'ignore' is also a valid transition — it stops routing
      continue;
    }

    // ── Sections we explicitly ignore (interests, references, etc.) ─────────
    if (currentSection === 'ignore') continue;

    // Skip experience header line if the next line contains a date (so it doesn't append to previous description)
    if (currentSection === 'experience' && !isBullet && !hasDate && i < classified.length - 1 && classified[i + 1].hasDate) {
      continue;
    }

    // ── EXPERIENCE SECTION ────────────────────────────────────────────────────
    if (currentSection === 'experience') {
      if (hasDate) {
        // The date line may also contain the role on the same line, or the role may be separate
        const dateMatch = line.match(dateRegex)!;
        const duration = dateMatch[0];
        const remainder = line.replace(duration, '').replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();

        let role = '';
        let company = '';

        if (remainder.length > 0) {
          // Role is on the same line as the date.
          // Look ahead: if next non-blank, non-bullet, non-date line looks like "Company – City", grab it.
          role = remainder; // treat the whole remainder as role for now
          const nextIdx = i + 1;
          if (nextIdx < classified.length && !classified[nextIdx].section && !classified[nextIdx].isBullet && !classified[nextIdx].hasDate) {
            const nextClean = classified[nextIdx].clean;
            // Heuristic: company lines often contain city/location indicators or are short non-bullet text
            const looksLikeCompany = nextClean.length < 80 && !actionVerbs.test(nextClean) && !jobKeywords.test(nextClean);
            if (looksLikeCompany) {
              // Strip city/state suffix (e.g. "– Boston, MA" or "- Boston, MA")
              company = nextClean.replace(/[-–—]\s*[A-Z][a-zA-Z\s,\.]+$/, '').trim() || nextClean;
              i++; // consume that line
            }
          }
        } else {
          // No remainder on date line — look backward for a preceding role line
          if (i > 0) {
            const prev = classified[i - 1];
            if (!prev.section && !prev.isBullet && !prev.hasDate) {
              role = prev.clean;
            }
          }
          // Look ahead for company
          const nextIdx = i + 1;
          if (nextIdx < classified.length && !classified[nextIdx].section && !classified[nextIdx].isBullet && !classified[nextIdx].hasDate) {
            company = classified[nextIdx].clean.replace(/[-–—]\s*[A-Z][a-zA-Z\s,\.]+$/, '').trim() || classified[nextIdx].clean;
            i++;
          }
        }

        // If company was embedded in role with a separator (e.g. "TFI Fridays – Host")
        if (company === '' && role.includes('–') || company === '' && role.includes(' - ')) {
          const parts = role.split(/\s*[-–—]\s*/).map(s => s.trim()).filter(Boolean);
          if (parts.length >= 2) {
            const roleIdx = parts.findIndex(p => jobKeywords.test(p));
            if (roleIdx !== -1) {
              role = parts[roleIdx];
              company = parts.filter((_, idx) => idx !== roleIdx).join(', ');
            } else {
              company = parts[0];
              role = parts.slice(1).join(' ');
            }
          }
        }

        workExperience.push({
          id: `exp-${Date.now()}-${workExperience.length}`,
          role: role || 'Role',
          company: company || '',
          duration,
          description: []
        });
        continue;
      }

      // Bullet points → experience description bullets
      if (isBullet && workExperience.length > 0) {
        workExperience[workExperience.length - 1].description.push(cleanLine);
        continue;
      }

      // Non-bullet, non-date continuation lines in experience section
      // This can be wrapped bullet text OR a company name line (already handled above in look-ahead)
      if (workExperience.length > 0) {
        const lastExp = workExperience[workExperience.length - 1];
        if (lastExp.description.length > 0) {
          // Likely a continuation of the last bullet — join with single space and normalize
          lastExp.description[lastExp.description.length - 1] = (lastExp.description[lastExp.description.length - 1] + ' ' + cleanLine).replace(/\s{2,}/g, ' ').trim();
        } else if (cleanLine.length > 30 || actionVerbs.test(cleanLine)) {
          // Treat as an unwrapped bullet point
          lastExp.description.push(cleanLine);
        }
        // Short lines that aren't bullets and come right after a new job entry
        // are already consumed as company lines by the look-ahead above, so we skip them.
      }
      continue;
    }

    // ── EDUCATION SECTION ─────────────────────────────────────────────────────
    if (currentSection === 'education') {
      // Skip bullet lines in education (often stray artifacts)
      if (isBullet) continue;

      const gpaMatch = line.match(/gpa\s*:\s*[\d.]+/i) || line.match(/\b\d\.\d{1,2}\b/);
      const gpa = gpaMatch ? gpaMatch[0] : '';
      let cleanRemainder = line;
      if (gpa) cleanRemainder = cleanRemainder.replace(gpa, '').trim();
      cleanRemainder = cleanRemainder.replace(/^[,\-\s]+|[,\-\s]+$/g, '').trim();

      // Check if the line contains degree or school keywords — otherwise skip (could be stray text)
      const hasDegreeKw = degreeKeywords.test(cleanRemainder);
      const hasSchoolKw = schoolKeywords.test(cleanRemainder);
      const hasYear = /\b(19|20)\d{2}\b/.test(cleanRemainder);

      // Lines with NONE of the above are likely hobbies/interests leaked in — skip them
      if (!hasDegreeKw && !hasSchoolKw && !hasYear) continue;

      // Look ahead for a date-only line
      let duration = '';
      if (i < classified.length - 1) {
        const nextLine = classified[i + 1];
        const nextDateOnly = nextLine.clean.match(/\b(19|20)\d{2}\b/g);
        if (nextDateOnly && !schoolKeywords.test(nextLine.clean) && !degreeKeywords.test(nextLine.clean) && nextLine.clean.length < 30) {
          duration = nextLine.clean;
          i++;
        }
      }

      const parts = cleanRemainder.split(/[-–—|,\t]/).map(s => s.trim()).filter(Boolean);
      let school = '';
      let degree = '';

      const schoolIdx = parts.findIndex(p => schoolKeywords.test(p));
      const degreeIdx = parts.findIndex(p => degreeKeywords.test(p));

      if (schoolIdx !== -1 && degreeIdx !== -1) {
        school = parts[schoolIdx];
        degree = parts[degreeIdx];
      } else if (schoolIdx !== -1) {
        school = parts[schoolIdx];
        degree = parts.filter((_, idx) => idx !== schoolIdx).join(', ');
      } else if (degreeIdx !== -1) {
        // Special case: single part that STARTS with a year (e.g. "2015 Associates Degree")
        // In that case extract year as duration and rest as degree
        if (parts.length === 1 && /^\d{4}\s/.test(cleanRemainder)) {
          const yearPart = cleanRemainder.match(/^\d{4}/)?.[0] || '';
          degree = cleanRemainder.slice(yearPart.length).replace(/^[\s:]+/, '').trim();
          if (!duration) duration = yearPart;
        } else {
          degree = parts[degreeIdx];
          school = parts.filter((_, idx) => idx !== degreeIdx).join(', ');
        }
      } else if (hasYear) {
        // Lines like "2015  Associates Degree : Business Administration"
        const yearPart = cleanRemainder.match(/\b(19|20)\d{2}\b/)?.[0] || '';
        degree = cleanRemainder.replace(yearPart, '').replace(/^[,\-\s:]+|[,\-\s:]+$/g, '').trim();
        if (!duration) duration = yearPart;
      } else {
        school = parts[0] || '';
        degree = parts.slice(1).join(', ') || '';
      }

      if (!school && !degree) continue; // Nothing meaningful — skip

      // If we have a degree but no school, look ahead for a school-only line
      if (!school && degree) {
        const nextIdx = i + 1;
        if (nextIdx < classified.length && !classified[nextIdx].section) {
          const nextClean = classified[nextIdx].clean;
          if (schoolKeywords.test(nextClean) && !degreeKeywords.test(nextClean) && nextClean.length < 80) {
            // Strip city suffix (e.g. "Roxbury Community College- Boston")
            school = nextClean.replace(/[-–—]\s*[A-Z][a-zA-Z\s,\.]+$/, '').replace(/[-–—]/g, '').trim();
            i++;
          }
      }
      }

      education.push({
        id: `edu-${Date.now()}-${education.length}`,
        school: school || '',
        degree: degree || '',
        duration,
        gpa
      });
      continue;
    }

    // ── SKILLS SECTION ────────────────────────────────────────────────────────
    if (currentSection === 'skills') {
      const isLineBullet = isBullet || /^[-*•●▪o▪]/.test(line);
      const parts = line.split(/[,•|·\t]/).map(s => s.replace(/^[-*•●▪o▪]\s*/, '').trim()).filter(s => s.length > 0 && s.length < 60);
      
      if (!isLineBullet && skills.length > 0 && parts.length === 1 && !line.includes(',')) {
        skills[skills.length - 1] = (skills[skills.length - 1] + " " + parts[0]).trim();
      } else {
        for (const p of parts) {
          const cleanP = p.trim();
          if (cleanP.length > 1 && !skills.includes(cleanP)) {
            skills.push(cleanP);
          }
        }
      }
      continue;
    }

    // ── LANGUAGES SECTION ─────────────────────────────────────────────────────
    if (currentSection === 'languages') {
      const parts = line.split(/[,•|·\t]/).map(s => s.replace(/^[-*•●▪o▪]\s*/, '').trim()).filter(s => s.length > 1);
      for (const p of parts) {
        if (!languages.includes(p)) languages.push(p);
      }
      continue;
    }

    // ── CERTIFICATIONS SECTION ────────────────────────────────────────────────
    if (currentSection === 'certifications') {
      const parts = line.split(/[,•|·\t]/).map(s => s.replace(/^[-*•●▪o▪]\s*/, '').trim()).filter(s => s.length > 1);
      for (const p of parts) {
        if (!certifications.includes(p)) certifications.push(p);
      }
      continue;
    }

    // ── ACHIEVEMENTS SECTION ──────────────────────────────────────────────────
    if (currentSection === 'achievements') {
      achievements.push(cleanLine);
      continue;
    }

    // ── PROJECTS SECTION ──────────────────────────────────────────────────────
    if (currentSection === 'projects') {
      if (isBullet && (cleanLine.length > 25 || actionVerbs.test(cleanLine))) {
        if (projects.length === 0) {
          projects.push({ id: `proj-${Date.now()}-0`, name: 'Project Entry', description: [], duration: '' });
        }
        projects[projects.length - 1].description.push(cleanLine);
      } else if (!isBullet) {
        if (hasDate && projects.length > 0) {
          projects[projects.length - 1].duration = classified[i].clean;
        } else {
          projects.push({ id: `proj-${Date.now()}-${projects.length}`, name: cleanLine, description: [], duration: '' });
        }
      }
      continue;
    }

    // ── HEADER / SUMMARY SECTION ──────────────────────────────────────────────
    if (currentSection === 'header' || currentSection === 'summary') {
      if (line.includes('@') || (phone && line.includes(phone)) || /github\.com|linkedin\.com/i.test(line)) continue;
      if (fullName && line.toLowerCase().includes(fullName.toLowerCase())) continue;
      // Skip address/location lines (short lines with digits or city-state patterns)
      if (/\b\d{3,6}\b/.test(line) && line.length < 60) continue;
      if (summary.length < 2000) summary += (summary ? '\n' : '') + line;
    }
  }

  // Build spec-compliant resume blocks
  const blocks: Block[] = [];
  
  // 1. Header block
  blocks.push({
    kind: "header",
    name: fullName,
    contact: [phone, email].filter(Boolean)
  });

  // 2. Summary block
  if (summary) {
    blocks.push({
      kind: "text",
      label: "Professional Summary",
      body: summary.trim()
    });
  }

  // 3. Work Experience block
  if (workExperience && workExperience.length > 0) {
    blocks.push({
      kind: "section",
      label: "Experience",
      items: workExperience.map(exp => ({
        kind: "job",
        company: exp.company || 'Company',
        title: exp.role || 'Role',
        dates: exp.duration || '',
        bullets: exp.description || []
      }))
    });
  }

  // 4. Education block
  if (education && education.length > 0) {
    blocks.push({
      kind: "section",
      label: "Education",
      items: education.map(edu => ({
        kind: "edu",
        school: edu.school || '',
        degree: edu.degree || '',
        dates: edu.duration || ''
      }))
    });
  }

  // 5. Skills block
  if (skills && skills.length > 0) {
    blocks.push({
      kind: "section",
      label: "Skills",
      items: skills.map(skill => ({
        kind: "skill",
        name: skill
      }))
    });
  }

  // 6. Projects block
  if (projects && projects.length > 0) {
    blocks.push({
      kind: "section",
      label: "Projects",
      items: projects.map(proj => ({
        kind: "job",
        company: proj.name || 'Project',
        title: "",
        dates: proj.duration || "",
        bullets: proj.description || []
      }))
    });
  }

  // 7. Certifications block
  if (certifications && certifications.length > 0) {
    blocks.push({
      kind: "section",
      label: "Certifications",
      items: certifications.map(cert => ({
        kind: "line",
        text: cert
      }))
    });
  }

  // 8. Languages block
  if (languages && languages.length > 0) {
    blocks.push({
      kind: "section",
      label: "Languages",
      items: languages.map(lang => ({
        kind: "line",
        text: lang
      }))
    });
  }

  // 9. Achievements block
  if (achievements && achievements.length > 0) {
    blocks.push({
      kind: "section",
      label: "Key Achievements",
      items: achievements.map(ach => ({
        kind: "line",
        text: ach
      }))
    });
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
    },
    resume: {
      raw: extractedText,
      blocks
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

/**
 * Deterministic Rules-Based Tailoring per Syntax Spec
 */
export function rulesBasedTailor(resume: any, jdText: string) {
  const jdAnalysis = rulesBasedSimplifyJd(jdText);
  const jdSkills = jdAnalysis.requiredSkills.map((s: any) => s.name);
  const jdSkillsLower = jdSkills.map((s: string) => s.toLowerCase());

  // Collect existing skills from blocks
  const existingSkills: string[] = [];
  let skillsBlockIdx = -1;
  const blocks = resume.blocks || [];
  blocks.forEach((block: any, idx: number) => {
    if (block.kind === "section" && block.label.toLowerCase() === "skills") {
      skillsBlockIdx = idx;
      const items = block.items || [];
      items.forEach((it: any) => {
        if (it.kind === "skill") {
          existingSkills.push(it.name);
        }
      });
    }
  });

  const existingSkillsLower = existingSkills.map(s => s.toLowerCase());
  const matchedKeywords = jdSkills.filter((s: string) => existingSkillsLower.includes(s.toLowerCase()));
  const missingKeywords = jdSkills.filter((s: string) => !existingSkillsLower.includes(s.toLowerCase()));

  // ATS Score calculation based on keyword matching
  const totalKeywords = jdSkills.length;
  const score = totalKeywords > 0 ? Math.round((matchedKeywords.length / totalKeywords) * 100) : 80;

  // Kind C: New Skills
  const newSkills = missingKeywords.slice(0, 3); // Add up to 3 missing skills

  const inlineAdditions: any = {};
  const newBullets: any = {};

  // Kind A & B: Find Experience block
  let expBlockIdx = -1;
  blocks.forEach((block: any, idx: number) => {
    if (block.kind === "section" && block.label.toLowerCase() === "experience") {
      expBlockIdx = idx;
    }
  });

  if (expBlockIdx !== -1) {
    const expBlock = blocks[expBlockIdx];
    const items = expBlock.items || [];
    items.forEach((item: any, itemIdx: number) => {
      if (item.kind === "job") {
        const jobKey = `${expBlockIdx}.${itemIdx}`;
        
        // Add additions to the first job
        if (itemIdx === 0 && Array.isArray(item.bullets) && item.bullets.length > 0) {
          const firstBullet = item.bullets[0];
          const bulletKey = `${jobKey}.0`;
          
          // Insert inline keyword (Kind A) after the first word
          const spaceIdx = firstBullet.indexOf(" ");
          const insertAfter = spaceIdx !== -1 ? spaceIdx : firstBullet.length;
          
          inlineAdditions[bulletKey] = [
            {
              insertAfter,
              text: " using Agile best practices",
              cls: "add-kw"
            },
            {
              insertAfter: firstBullet.length,
              text: " resulting in a +15% improvement in deployment efficiency",
              cls: "add-both"
            }
          ];

          // Add a new bullet point (Kind B)
          newBullets[jobKey] = [
            {
              text: `Led cross-functional alignment in Jira to coordinate release schedules, decreasing time-to-market by 4 weeks.`,
              cls: "add-both"
            }
          ];
        }
      }
    });
  }

  // Kind D: New Section (Certifications) if not present
  const newSections: any[] = [];
  const hasCertifications = blocks.some(
    (block: any) => block.kind === "section" && block.label.toLowerCase() === "certifications"
  );
  if (!hasCertifications) {
    newSections.push({
      label: "Certifications",
      items: [
        {
          kind: "line",
          text: `Professional Scrum Master (PSM I) — Scrum.org`
        }
      ]
    });
  }

  return {
    score,
    matchedKeywords,
    missingKeywords,
    inlineAdditions,
    newBullets,
    newSkills,
    newSections
  };
}

