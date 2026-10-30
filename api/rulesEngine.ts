import { Block } from '../src/types';

// Skills the rules engine can recognise in a job description.
// Each entry: canonical display name first, then other ways it's written. An alias starting with "="
// is matched case-sensitively (e.g. "Go" the language, not "go" the verb). A display name starting with "!"
// is too generic to match on its own ("Growth", "Testing") and is found only through its aliases.
const SKILL_CATALOG: string[][] = [
  // Programming languages
  ["JavaScript", "js"], ["TypeScript"], ["Python"], ["Java"], ["C++"], ["C#"], ["Ruby"], ["Go", "=Go", "golang"], ["Rust"], ["PHP"],
  ["Swift"], ["Kotlin"], ["Scala"], ["SQL"], ["HTML"], ["CSS"], ["Sass"], ["Bash", "shell scripting"], [".NET", "dotnet"],
  // Frontend
  ["React", "react.js", "reactjs"], ["Next.js", "nextjs"], ["Vue", "vue.js"], ["Angular"], ["Svelte"], ["Tailwind CSS", "tailwind"],
  ["Redux"], ["Webpack"], ["Vite"], ["Storybook"], ["Jest"], ["Cypress"], ["Playwright"], ["!Automated Testing", "automated tests", "unit testing", "unit tests", "test automation", "writing tests", "write tests"],
  ["Accessibility", "a11y", "wcag"], ["Design Systems", "design system", "component library"], ["!Web Performance", "web performance", "performance optimization", "page performance", "load and interaction performance"],
  // Backend, data stores, platforms
  ["Node.js", "nodejs", "node"], ["Express", "express.js"], ["NestJS", "nest.js"], ["Django"], ["Flask"], ["FastAPI"], ["Spring Boot", "spring"],
  ["REST APIs", "rest api", "restful apis", "restful api"], ["GraphQL"], ["Microservices", "microservice"], ["Distributed Systems", "distributed system"],
  ["System Design"], ["PostgreSQL", "postgres"], ["MySQL"], ["MongoDB"], ["Redis"], ["DynamoDB"], ["Cassandra"], ["Elasticsearch"],
  ["Kafka", "apache kafka"], ["RabbitMQ"], ["BigQuery"], ["Snowflake"], ["Spark", "apache spark"],
  // Cloud and DevOps
  ["AWS", "amazon web services"], ["GCP", "google cloud"], ["Azure"], ["Docker"], ["Kubernetes", "k8s"], ["CI/CD", "ci/cd pipelines", "continuous integration"],
  ["Terraform"], ["Jenkins"], ["GitHub Actions"], ["Git"], ["Linux"],
  // Data and analytics
  ["Excel", "microsoft excel", "advanced excel"], ["Tableau"], ["Power BI", "powerbi"], ["Looker"], ["pandas"], ["Statistics", "statistical"],
  ["A/B Testing", "a/b tests", "ab testing", "split testing"], ["Experimentation", "experiments"], ["Data Modeling", "data modelling"],
  ["Data Analysis", "data analytics"], ["Machine Learning"], ["Dashboards", "dashboard"],
  // Product
  ["Product Roadmap", "owning a roadmap", "own the roadmap", "roadmap planning"], ["User Research", "customer interviews"], ["PRDs", "prd", "product requirements"], ["B2B SaaS", "b2b saas"], ["SaaS"],
  ["Agile", "scrum", "sprints"], ["Jira"], ["Mixpanel"], ["Amplitude"], ["!Growth", "growth goals", "growth metrics", "growth marketing", "activation and retention"], ["Product Management"],
  // Design
  ["Figma"], ["Adobe XD"], ["Sketch"], ["Prototyping", "prototypes"], ["Wireframing", "wireframes"], ["Usability Testing", "usability tests"],
  ["Interaction Design"], ["Visual Design"], ["Design Thinking"],
  // Marketing
  ["Google Ads"], ["Meta Ads", "facebook ads"], ["SEO"], ["SEM"], ["Email Marketing", "lifecycle email", "email campaigns"],
  ["Content Marketing", "content calendar"], ["Social Media Marketing", "social media"], ["Google Analytics"], ["HubSpot"],
  ["Performance Marketing"], ["ROAS"], ["CAC"], ["Budget Management", "large monthly budgets", "marketing budget"], ["Brand Marketing"],
  // Sales
  ["B2B Sales"], ["Inside Sales"], ["Lead Generation"], ["Cold Calling", "cold calls"], ["Salesforce"], ["CRM"], ["Pipeline Management", "managing a pipeline"],
  ["Negotiation"], ["Quota", "quota attainment", "sales targets"], ["Account Management"], ["Product Demos", "product demo", "demos"],
  // HR and recruiting
  ["Technical Recruiting", "technical recruiter", "tech recruiting"], ["Sourcing"], ["Greenhouse"], ["LinkedIn Recruiter"], ["Employer Branding"],
  ["Employee Relations"], ["Performance Management", "performance review"], ["HR Policies", "hr policy"], ["Onboarding"], ["Talent Acquisition"],
  ["Campus Hiring"],
  // Finance and accounting
  ["Financial Modeling", "financial modelling"], ["Budgeting", "annual budget"], ["Forecasting", "forecasts"], ["Variance Analysis", "variances"],
  ["Ind AS"], ["IFRS"], ["GAAP"], ["Audit", "audits", "auditing"], ["Internal Controls"], ["SAP", "=SAP"], ["Tally"], ["Taxation"],
  // People and ways of working
  ["Stakeholder Management", "stakeholders"], ["Team Leadership", "leading a small team", "lead a team", "team management", "managing or mentoring a team"],
  ["Mentoring", "mentor engineers", "mentor senior engineers", "mentoring"], ["Communication", "communication skills"], ["Problem Solving"],
  ["Project Management"], ["Customer Support"]
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rejoins words that PDF text extraction split around ligature glyphs (fi, fl, ff, ffi, ffl):
 * "de fi ne" -> "define", "ef fi cient" -> "efficient", "work fl ow" -> "workflow", "sta ff" -> "staff".
 * Only joins a ligature that sits between letters, so normal words like "the five" are left alone.
 */
export function fixSplitLigatures(text: string): string {
  return text
    .replace(/\uFB00/g, "ff").replace(/\uFB01/g, "fi").replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi").replace(/\uFB04/g, "ffl")
    // inside a word: "de fi ne", "X fi n.digital", "speci fi c"
    .replace(/([A-Za-z]) (ffi|ffl|fi|fl|ff) (?=[a-z])/g, "$1$2")
    // start of a word: "fi nancial", "fl exible"
    .replace(/(^|[\s(\[“"'/-])(ffi|ffl|fi|fl|ff) (?=[a-z]{2})/gm, "$1$2")
    // end of a word: "sta ff", "o ff."
    .replace(/([a-z]{2}) (ffi|ffl|fi|fl|ff)(?=[\s.,;:!?)\]]|$)/gm, "$1$2");
}

function cleanLigatures(text: string): string {
  return fixSplitLigatures(text)
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

  // Phone: any run of 10–13 digits with common separators (+91 98765 43210, (555) 123-4567, 555.123.4567).
  // Year ranges like "2016 - 2020" have too few digits to qualify.
  let phone = '';
  for (const m of cleanedText.matchAll(/\+?\(?\d[\d\s().-]{8,18}\d/g)) {
    const candidate = m[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13 && !/(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}/.test(candidate)) {
      phone = candidate;
      break;
    }
  }

  const linkedinMatch = cleanedText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i);
  const linkedin = linkedinMatch ? linkedinMatch[0] : '';
  const websiteMatch = cleanedText.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i) ||
                       cleanedText.match(/https?:\/\/(?!(?:www\.)?linkedin\.com)[^\s|,]+/i);
  const website = websiteMatch ? websiteMatch[0] : '';

  // Location: a short "City, State/Country" piece in the header lines (before the first section)
  let location = '';
  const firstSectionIdx = mergedLines.findIndex(l => /^(professional summary|summary|objective|profile|experience|work experience|education|skills)$/i.test(l.trim()));
  const headerLines = mergedLines.slice(0, firstSectionIdx === -1 ? 6 : Math.min(firstSectionIdx, 6));
  for (const hl of headerLines) {
    const piece = hl.split(/\s*[|•·]\s*/).find(p =>
      p.length < 40 && !/[@\d/]/.test(p) && /^[A-Z][A-Za-z.\s]+,\s*[A-Z][A-Za-z.\s]+$/.test(p.trim()) && p.split(/\s+/).length <= 5
    );
    if (piece) { location = piece.trim(); break; }
  }

  const sectionHeaders: Record<string, RegExp> = {
    experience: /^(experience|work history|employment|employment history|career|career history|professional experience|work record|work experience|experience record|relevant experience|internships?|internship experience|work and internships?|experience and internships?)$/i,
    education: /^(education|academic|academics|academic profile|academic background|education background|educational background|academic record|education and credentials|education and certifications|education and training|qualifications|academic qualifications|educational qualifications)$/i,
    projects: /^(projects|personal projects|academic projects|key projects|repositories|portfolio|selected projects|side projects)$/i,
    skills: /^(skills|key skills|technical skills|technologies|tools|competencies|expertise|areas of expertise|core competencies|core skills|skills and expertise|tools and skills|skills and tools|tools and technologies|technical skills and tools|skill set|skillset)$/i,
    certifications: /^(certifications?|licenses?|credentials?)$/i,
    languages: /^(languages)$/i,
    achievements: /^(achievements|awards|honors|extracurriculars|key achievements)$/i,
    summary: /^(summary|objective|profile|about me|professional summary|executive summary)$/i,
    // Sections we want to recognise and SKIP (don't dump into education or experience)
    ignore: /^(interests?|hobbies|volunteer|volunteering|references?|activities|personal interests?|other interests?)$/i
  };

  const singleDate = /(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*\.?[\s,]*\d{4}|\d{1,2}\/\d{4}|\b\d{4}\b)/i;
  const dateRegex = new RegExp(`(${singleDate.source})\\s*[-–—]\\s*(${singleDate.source}|present|current|active)`, 'i');
  const jobKeywords = /\b(manager|engineer|developer|intern|lead|analyst|coordinator|specialist|host|service|worker|head|founder|ceo|pm|consultant|director|writer|designer|assistant|strategist|representative|executive|supervisor|officer|president|associate|recruiter|accountant|auditor|nurse|teacher|marketer|scientist|architect|administrator|advisor|counsel+or|trainee|apprentice|programmer|sde|partner|owner|tester)\b/i;
  const actionVerbs = /^(collaborated|conducted|managed|coordinated|developed|created|executed|leveraged|designed|analyzed|implemented|spearheaded|built|partnered|authored|facilitated|mapped|drafted|assisted|led|oversaw|supported|maintained|delivered|drove|launched|established|improved|streamlined|optimized|generated|achieved)/i;

  // ── SECTION DETECTION PASS ──────────────────────────────────────────────────
  // Pre-classify each line as a section header or content so we can look ahead/behind
  type LineType = { raw: string; clean: string; section: string | null; isBullet: boolean; hasDate: boolean };
  const classified: LineType[] = mergedLines.map(raw => {
    const normalized = raw.replace(/[\u2013\u2014\u2015]/g, "-").trim();
    const clean = normalized.replace(/^[-*•●▪o▪]\s*/, '').trim();
    let sectionLabel: string | null = null;
    if (clean.length < 50) {
      // "Tools & Skills:" and "Tools and Skills" are the same heading
      const headingKey = clean.replace(/&/g, " and ").replace(/:\s*$/, "").replace(/\s+/g, " ").trim();
      for (const [sec, rx] of Object.entries(sectionHeaders)) {
        if (rx.test(headingKey) && !headingKey.includes(':') && !clean.includes('|')) {
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

  const schoolKeywords = /\b(college|university|school|institute|academy|high school|iit|iim|nit|iiit|bits|jntu|icai|icsi|isb|xlri|nift|nid|polytechnic)\b/i;
  const degreeKeywords = /\b(bachelor'?s?|master'?s?|ph\.?\s?d\.?|doctorate|b\.a\.|m\.a\.|b\.?s\.?c?|m\.?s\.?c?|b\.?\s?tech|m\.?\s?tech|b\.e\.?|m\.e\.?|b\.?com|m\.?com|mba|bba|bca|mca|pgdm|b\.?\s?des|m\.?\s?des|llb|llm|mbbs|b\.?\s?pharm|chartered accountant|cfa|cpa|acca|degree|diploma|associates?|associate's|10th|12th|hsc|ssc|metric|matriculation|intermediate)(?![a-z])/i;

  // Splits an education line into its text, a date/year range, and a GPA value.
  // "National Institute of Technology Trichy | 2016 - 2020 | CGPA 8.6"
  //   → { text: "National Institute of Technology Trichy", duration: "2016 - 2020", gpa: "8.6" }
  const pullEduDateAndGpa = (input: string) => {
    let text = input;
    let gpa = '';
    const labelled = text.match(/\b(?:c?gpa|cpi|cgpa)\s*[:\-]?\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/i);
    if (labelled) {
      gpa = labelled[1].replace(/\s+/g, '');
      text = text.replace(labelled[0], ' ');
    } else {
      const bare = text.match(/(?:^|\s|\|)(\d\.\d{1,2})(?=\s|\||$)/);
      if (bare) { gpa = bare[1]; text = text.replace(bare[1], ' '); }
    }
    let duration = '';
    const range = text.match(dateRegex);
    if (range) {
      duration = range[0].trim();
      text = text.replace(range[0], ' ');
    } else {
      const single = text.match(singleDate);
      if (single && /\d{4}/.test(single[0])) {
        duration = single[0].trim();
        text = text.replace(single[0], ' ');
      }
    }
    text = text
      .replace(/\(\s*\)/g, ' ')
      .replace(/(\s*[|,·]\s*){2,}/g, ' | ')
      .replace(/^[\s|,·:\-–—]+|[\s|,·:\-–—]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return { text, duration, gpa };
  };

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
        // Strip the date and any leftover separators, e.g. "Flipkart | " → "Flipkart"
        const remainder = line.replace(duration, '').replace(/^[\s,|·•@\-–—]+|[\s,|·•@\-–—(]+$/g, '').trim();

        // A plain header line just above the date line (skipped earlier), e.g. "Senior Software Engineer"
        const prev = i > 0 ? classified[i - 1] : null;
        const prevHeader = prev && !prev.section && !prev.isBullet && !prev.hasDate && prev.clean.length < 80 && !actionVerbs.test(prev.clean)
          ? prev.clean : '';

        let role = '';
        let company = '';

        // Split "Software Engineer | Flipkart", "Software Engineer at Flipkart", "Flipkart · Bengaluru"
        const remParts = remainder.split(/\s*[|·•]\s*|\s+at\s+|\s+@\s+/i).map(s => s.trim()).filter(Boolean);

        if (remainder.length > 0 && prevHeader) {
          // Layout: "Title" line, then "Company | Dates" (or the reverse order)
          const remIsRole = jobKeywords.test(remParts[0]) && !jobKeywords.test(prevHeader);
          if (remIsRole) {
            role = remParts[0];
            company = [prevHeader, ...remParts.slice(1)].join(', ');
          } else {
            role = prevHeader;
            company = remParts[0];
          }
        } else if (remainder.length > 0 && remParts.length >= 2) {
          // Layout: "Title | Company | Dates" on one line
          const roleIdx = remParts.findIndex(p => jobKeywords.test(p));
          const ri = roleIdx === -1 ? 0 : roleIdx;
          role = remParts[ri];
          company = remParts.filter((_, idx) => idx !== ri).join(', ');
        } else if (remainder.length > 0) {
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

        // "Frontend Developer, Brightline Health - Remote": title, company, then an optional location
        if (!company && role.includes(',')) {
          const withoutLocation = role.replace(/\s+-\s+[^,]{2,40}$/, '').trim();
          const [first, ...rest] = withoutLocation.split(/,\s*/);
          const restText = rest.join(', ').trim();
          if (restText && jobKeywords.test(first) && !jobKeywords.test(restText)) {
            role = first.trim();
            company = restText;
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
          role: role,
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

      // Pull dates and GPA out first so they never end up inside the degree/school text
      let { text: cleanRemainder, duration, gpa } = pullEduDateAndGpa(line);

      // A date-only line belongs to the previous education entry
      if (!cleanRemainder && duration) {
        const last = education[education.length - 1];
        if (last && !last.duration) last.duration = duration;
        continue;
      }

      // Check if the line contains degree or school keywords — otherwise skip (could be stray text)
      const hasDegreeKw = degreeKeywords.test(cleanRemainder);
      const hasSchoolKw = schoolKeywords.test(cleanRemainder);

      // Lines with NONE of the above are likely hobbies/interests leaked in — skip them
      if (!hasDegreeKw && !hasSchoolKw && !duration) continue;

      const parts = cleanRemainder.split(/\s*[|,\t]\s*|\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
      let school = '';
      let degree = '';

      const schoolIdx = parts.findIndex(p => schoolKeywords.test(p));
      const degreeIdx = parts.findIndex(p => degreeKeywords.test(p));

      if (schoolIdx !== -1 && degreeIdx !== -1 && schoolIdx !== degreeIdx) {
        school = parts[schoolIdx];
        degree = parts[degreeIdx];
      } else if (schoolIdx !== -1) {
        school = parts[schoolIdx];
        degree = parts.filter((_, idx) => idx !== schoolIdx).join(', ');
      } else if (degreeIdx !== -1) {
        degree = parts[degreeIdx];
        school = parts.filter((_, idx) => idx !== degreeIdx).join(', ');
      } else {
        // Lines like "2015  Associates Program : Business Administration"
        degree = cleanRemainder.replace(/^[,\-\s:]+|[,\-\s:]+$/g, '').trim();
      }

      if (!school && !degree) continue; // Nothing meaningful — skip

      // Degree and school are often on separate lines (either order) — merge the next line in
      const next = i + 1 < classified.length ? classified[i + 1] : null;
      if (next && !next.section && !next.isBullet && next.clean.length < 120) {
        const nextParsed = pullEduDateAndGpa(next.clean);
        const nextFirst = nextParsed.text.split(/\s*[|,\t]\s*/)[0]?.trim() || '';
        // "School | 2016 - 2020" right under a degree is the school, even without "University" in its name
        const takeSchool = !school && degree && !degreeKeywords.test(nextParsed.text) && nextFirst.length > 1 &&
          (schoolKeywords.test(nextParsed.text) || !!nextParsed.duration);
        const takeDegree = !degree && school && degreeKeywords.test(nextParsed.text) && !schoolKeywords.test(nextParsed.text);
        const takeDateOnly = !duration && !nextParsed.text && nextParsed.duration;
        if (takeSchool || takeDegree || takeDateOnly) {
          if (takeSchool) school = nextFirst.replace(/\s+[-–—]\s+[A-Z][a-zA-Z\s,.]+$/, '').trim();
          if (takeDegree) degree = nextParsed.text.split(/\s*[|\t]\s*/)[0].trim();
          if (!duration) duration = nextParsed.duration;
          if (!gpa) gpa = nextParsed.gpa;
          i++;
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
    contact: [phone, email, linkedin, website, location].filter(Boolean)
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
        company: exp.company || '',
        title: exp.role || '',
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
      linkedin,
      website,
      location,
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
const TITLE_WORDS = /\b(engineer|developer|manager|analyst|designer|scientist|architect|lead|director|head|specialist|executive|associate|consultant|recruiter|partner|accountant|auditor|marketer|officer|coordinator|administrator|intern|nurse|teacher|writer|strategist|representative|programmer|tester)\b/i;

function findJobTitle(jdText: string): string {
  const lines = jdText.split(/\n/).map(l => l.trim()).filter(Boolean);
  // 1. The first line of a posting is usually the title: "Senior Backend Engineer - Swiggy (Bengaluru)"
  if (lines.length) {
    const first = lines[0]
      .replace(/\([^)]*\)/g, " ")
      .split(/\s+[-–—|]\s+|\s+at\s+|:\s/i)[0]
      .replace(/^(job title|role|position)\s*[:-]?\s*/i, "")
      .replace(/\s+/g, " ").trim();
    if (first && first.length <= 60 && first.split(" ").length <= 8 && TITLE_WORDS.test(first)) return first;
  }
  // 2. "We are hiring a Senior Backend Engineer", "looking for a Data Analyst to ..."
  const m = jdText.match(/\b(?:hiring|looking for|seeking|searching for)\s+(?:an?|our next|a talented|an experienced)?\s*([A-Z][\w/&+.-]*(?:\s+[A-Z&][\w/&+.-]*){0,5})/);
  if (m && TITLE_WORDS.test(m[1])) return m[1].trim();
  return "Tailored Position";
}

function findSkills(jdText: string): string[] {
  const found: string[] = [];
  for (const [rawCanonical, ...aliases] of SKILL_CATALOG) {
    const generic = rawCanonical.startsWith("!");
    const canonical = generic ? rawCanonical.slice(1) : rawCanonical;
    const names = generic ? aliases : [canonical, ...aliases];
    const hit = names.some(name => {
      if (name.startsWith("=")) {
        return new RegExp(`(?:^|[^A-Za-z0-9#+.-])${escapeRegExp(name.slice(1))}(?:$|[^A-Za-z0-9#+-])`).test(jdText);
      }
      if (canonical === "Go") return false; // only the case-sensitive alias counts for Go
      return new RegExp(`(?:^|[^a-zA-Z0-9#+.-])${escapeRegExp(name)}(?:$|[^a-zA-Z0-9#+-])`, "i").test(jdText);
    });
    if (hit && !found.includes(canonical)) found.push(canonical);
  }
  // Prefer specific skills over their generic parent ("B2B SaaS" over "SaaS", "Inside Sales" stays separate)
  return found.filter(s => !(s === "SaaS" && found.includes("B2B SaaS")));
}

// Words that are capitalised in postings but aren't skills
const NOT_SKILLS = new Set(("requirements responsibilities requirement responsibility experience we you our the this that these those help own keep join " +
  "build write work familiarity monitoring strong nice plus about role position team company years year remote hybrid onsite on-site india " +
  "bengaluru bangalore mumbai pune chennai hyderabad delhi gurugram gurgaon noida kolkata ahmedabad san francisco new york london us usa " +
  "uk ideally preferred required must bsc msc btech mba degree bachelor master a an and or of in with for to on at by is are be will " +
  "if as from your their they it its play store app apps product products customers customer users user people million " +
  "ui pm ca tools tool similar standards targets building using working shipping providers provider scenarios organizations " +
  "organisations partners solutions services businesses enterprises").split(" "));

// Second pass for skills the catalog doesn't know: names like "Firebase", "Zendesk", "BLS", and
// phrases after "experience with", "skills in", "knowledge of" in requirement sentences.
function findExtraSkills(jdText: string, known: string[], title: string, company: string): string[] {
  const knownKeys = new Set(known.map(k => k.toLowerCase()));
  // The employer's name repeats all over a posting ("Sophos" 15 times); a capitalised word used 4+ times
  // that isn't a known skill is the company, not a skill
  const counts = new Map<string, number>();
  for (const w of jdText.match(/\b[A-Z][a-z]{2,}\b/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
  const frequentNames = [...counts].filter(([w, n]) => n >= 4 && !known.some(k => k.toLowerCase() === w.toLowerCase())).map(([w]) => w.toLowerCase());
  const skipWords = new Set([...title.toLowerCase().split(/\s+/), ...company.toLowerCase().split(/\s+/), ...frequentNames].filter(Boolean));
  const out: string[] = [];
  const knownWords = new Set(known.flatMap(k => k.toLowerCase().split(/\s+/)));
  const add = (raw: string) => {
    const name = raw
      .replace(/\([^)]*\)/g, " ").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^(the|a|an|strong|solid|good|deep|basic|working|advanced|hands-on|modern|similar|maintaining|ideally( with)?|comfort(able)?( with| writing)?|experience( with| building| in)?)\s+/i, "")
      .replace(/\s+(skills?|targets?|standards?|tools?|experience)$/i, "")
      .replace(/[\s,.;:]+$/, "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    // a single word that's part of a skill we already have ("Power" from "Power BI", "Ind" from "Ind AS")
    if (!key.includes(" ") && knownWords.has(key)) return;
    if (!name || name.length < 2 || name.length > 32 || name.split(/\s+/).length > 3) return;
    // "multi-tenant scenarios", "managed service providers", "integration with XDR" are descriptions, not skills
    if (/\s(with|for|of)\s/i.test(name) || /\s(scenarios?|providers?|offerings?|partners?|organi[sz]ations?|use cases?)$/i.test(name)) return;
    if (knownKeys.has(key) || out.some(o => o.toLowerCase() === key)) return;
    if (key.split(/\s+/).every(w => NOT_SKILLS.has(w) || skipWords.has(w))) return;
    if (/\d/.test(name) && !/^[A-Z0-9.+#-]+$/.test(name)) return; // "3+ years" etc.
    out.push(name.charAt(0).toUpperCase() + name.slice(1));
  };
  const lines = jdText.split(/\n/).slice(1).join("\n"); // skip the title line
  const sentences = lines.split(/[.!?\n;]/).map(x => x.trim()).filter(Boolean);
  const isRequirement = (sent: string) => /\b(requirements?|experience|skills?|knowledge|familiar|proficien|hands-on|certif|must|plus|preferred|expected|tools? like|such as|with)\b/i.test(sent);
  for (const sent of sentences) {
    if (!isRequirement(sent)) continue;
    // Phrases: "experience with demand forecasting and inventory management", "skills in patient care and medication administration"
    const phrase = sent.match(/\b(?:experience (?:with|in|building)|skills? in|knowledge of|expertise in|familiarity with|background in|tools like|such as|hands-on with)\s+([^.;]+)/i);
    if (phrase) {
      phrase[1].split(/,|\band\b|\bor\b/).map(x => x.trim()).filter(x => x && x.split(/\s+/).length <= 3 && !/\b(is|are|a|plus|preferred|expected|years?)\b/i.test(x)).forEach(add);
    }
    // "strong copywriting and editing skills"
    const pre = sent.match(/\bstrong\s+([a-z][a-z\s-]{2,40}?)\s+skills\b/i);
    if (pre) pre[1].split(/\band\b|,/).map(x => x.trim()).forEach(add);
    // Names and acronyms that aren't the first word of the sentence: Firebase, WordPress, BLS, ACLS, MVVM
    const tokens = sent.match(/(?<=\s)(?:[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[A-Z]{2,6}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?=[\s,)]|$)/g) || [];
    tokens.forEach(add);
  }
  return out.slice(0, 8);
}

function looksLikeJobDescription(jdText: string): boolean {
  const words = jdText.trim().split(/\s+/).filter(Boolean);
  if (words.length < 15) return false;
  const signals = [/\b(requirements?|qualifications?|must have|nice to have)\b/i, /\b(responsibilit(y|ies)|you will|you'll|duties)\b/i,
    /\b(experience|years|skills?|certification|registration|degree)\b/i, /\b(role|position|hiring|join|team|need|needs|looking for|seeking|wanted)\b/i];
  return signals.filter(rx => rx.test(jdText)).length >= 2;
}

export function rulesBasedSimplifyJd(jdText: string) {
  const isValidJd = looksLikeJobDescription(jdText);
  const jobTitle = findJobTitle(jdText);
  // Skills are read even from short text: tailoring re-reads a one-line JD summary ("Role: ... Keywords: ...")
  const catalogSkills = findSkills(jdText);
  const firstLineCompany = (jdText.split("\n")[0].match(/\s[-–—|]\s+([A-Z][\w&.' ]{1,40}?)(?:\s*[,(]|$)/) || [])[1] || "";
  const isSummaryText = /^Role:/m.test(jdText) && /^Keywords:/m.test(jdText);
  // The general finder runs on any real posting text; validity only decides the "not a JD" warning
  const matchedSkills = isSummaryText
    ? catalogSkills
    : [...catalogSkills, ...findExtraSkills(jdText, catalogSkills, jobTitle, firstLineCompany)];

  // High priority when mentioned in a "requirements / must / strong" sentence
  const highPriorityKeywords = /\b(must|required|requirements?|essential|minimum|need|expert|strong|deep|hands-on|experience with|proficient)\b/i;
  const sentences = jdText.split(/[.!?\n;]/).map(s => s.trim()).filter(s => s.length > 0);
  const mentions = (sent: string, skill: string) =>
    new RegExp(`(?:^|[^a-zA-Z0-9#+.-])${escapeRegExp(skill)}(?:$|[^a-zA-Z0-9#+-])`, "i").test(sent);
  const requiredSkills: { name: string; priority: "high" | "medium" }[] = matchedSkills.map(name => ({
    name,
    priority: sentences.some(sent => mentions(sent, name) && highPriorityKeywords.test(sent)) ? "high" : "medium"
  }));

  // Responsibilities: sentences after "Responsibilities:", or that start with an action verb
  const actionVerbs = /^(build|design|manage|coordinate|develop|maintain|lead|collaborate|support|implement|write|test|create|drive|oversee|ensure|work|partner|own|plan|run|improve|deliver|ship|define|review|analy[sz]e|present|hire|coach|track|set|scale|sell|close|audit|prepare|explain|supervise|communicate|gather|hand off|answer|automate|use)\b/i;
  const keyResponsibilities: string[] = [];
  const respBlock = jdText.match(/responsibilities\s*[:-]\s*([\s\S]*?)(?:\n\s*\n|requirements\s*:|qualifications\s*:|nice to have\s*:|$)/i);
  const candidates = respBlock
    ? respBlock[1].split(/[.;\n]|,\s*(?=and\s)|\band\s(?=[a-z]+\s)/).map(x => x.replace(/^[\s,•*-]+|[\s,]+$/g, ""))
    : sentences;
  for (const c of candidates) {
    const clean = c.replace(/^(and|also)\s+/i, "").trim();
    if (clean.length > 12 && clean.length < 160 && actionVerbs.test(clean) && !keyResponsibilities.includes(clean)) {
      keyResponsibilities.push(clean.charAt(0).toUpperCase() + clean.slice(1));
    }
  }

  const companyMatch = jdText.split("\n")[0].match(/\s[-–—|]\s+([A-Z][\w&.' ]{1,40}?)(?:\s*\(|$)/);
  const company = companyMatch ? companyMatch[1].trim() : "";

  return {
    isValidJd,
    invalidReason: isValidJd ? "" : "This doesn't look like a job description. Paste the full posting, including the requirements.",
    jobTitle,
    companyPitch: jobTitle !== "Tailored Position"
      ? `${company ? company + " is" : "They're"} hiring a ${jobTitle}${matchedSkills.length ? ` with ${matchedSkills.slice(0, 3).join(", ")}` : ""}.`
      : "",
    requiredSkills,
    keyResponsibilities: keyResponsibilities.slice(0, 6),
    candidateExpectations: [],
    keywordsToTarget: [...requiredSkills].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1)).map(s => s.name).slice(0, 12),
    requiredQualifications: []
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
  
  // If no skills could be read from the JD we can't say the resume matches: score it neutral, not perfect
  const skillScore = jdSkills.length > 0 ? Math.round((matchedSkillsCount / jdSkills.length) * 100) : 50;

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
        : `Your resume matches only ${matchedSkillsCount} of ${jdSkills.length} key skills. Consider adding missing keywords: ${jdSkills.filter(s => !resumeText.includes(s.toLowerCase())).slice(0, 8).join(", ")}.`,
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
export function rulesBasedTailor(resume: any, jdText: string, selectedSkills?: string[]) {
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

  // Everything else the candidate wrote (summary, bullets, projects, certifications).
  // A JD skill found here is backed by the resume itself.
  const otherText = blocks
    .filter((_: any, idx: number) => idx !== skillsBlockIdx)
    .map((block: any) => {
      if (block.kind === "text") return block.body || "";
      if (block.kind !== "section") return "";
      return (block.items || [])
        .map((it: any) => [it.title, it.company, it.degree, it.school, it.text, ...(it.bullets || [])].filter(Boolean).join(" "))
        .join(" ");
    })
    .join(" ");

  // Returns the skill as the candidate spelled it in their own text, or null.
  const findInText = (skill: string): string | null => {
    const rx = new RegExp(`(?:^|[^a-zA-Z0-9#+.-])(${escapeRegExp(skill)})(?:$|[^a-zA-Z0-9#+.-])`, "i");
    const m = otherText.match(rx);
    return m ? m[1] : null;
  };

  const matchedKeywords = jdSkills.filter((s: string) => existingSkillsLower.includes(s.toLowerCase()) || findInText(s) !== null);
  const missingKeywords = jdSkills.filter((s: string) => !matchedKeywords.includes(s));

  // ATS Score calculation based on keyword matching
  const totalKeywords = jdSkills.length;
  const score = totalKeywords > 0 ? Math.round((matchedKeywords.length / totalKeywords) * 100) : 80;

  // Only add a skill to the Skills section when the resume already shows it elsewhere
  // (e.g. a project bullet mentions React). Never add skills the candidate doesn't claim,
  // and never invent bullets, metrics or certifications — missing skills are only reported.
  // When the candidate ticked skills in the checkbox step, add exactly those (and only those).
  const newSkills: string[] = [];
  if (Array.isArray(selectedSkills)) {
    const seen = new Set(existingSkillsLower);
    for (const raw of selectedSkills) {
      const skill = String(raw).trim();
      if (skill && !seen.has(skill.toLowerCase())) {
        seen.add(skill.toLowerCase());
        newSkills.push(skill);
      }
    }
  } else {
    newSkills.push(...jdSkills
      .filter((s: string) => !existingSkillsLower.includes(s.toLowerCase()))
      .map((s: string) => findInText(s))
      .filter((s: string | null): s is string => s !== null));
  }

  const inlineAdditions: any = {};
  const newBullets: any = {};
  const newSections: any[] = [];

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

