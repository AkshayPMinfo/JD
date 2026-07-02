import { ResumeStructure, Resume, Block, Item, TailoredResume } from "../types";

export function resumeStructureToResume(res: ResumeStructure, rawText?: string): Resume {
  const blocks: Block[] = [];

  // 1. Header block
  blocks.push({
    kind: "header",
    name: res.fullName || "Resume Candidate",
    contact: [res.phone, res.email, res.linkedin, res.website, res.location].filter(Boolean)
  });

  // 2. Summary block
  if (res.summary) {
    blocks.push({
      kind: "text",
      label: "Professional Summary",
      body: res.summary
    });
  }

  // 3. Work Experience block
  if (res.workExperience && res.workExperience.length > 0) {
    blocks.push({
      kind: "section",
      label: "Experience",
      items: res.workExperience.map(exp => ({
        kind: "job",
        company: exp.company || "Company",
        title: exp.role || "Role",
        dates: exp.duration || "",
        bullets: exp.description || []
      }))
    });
  }

  // 4. Education block
  if (res.education && res.education.length > 0) {
    blocks.push({
      kind: "section",
      label: "Education",
      items: res.education.map(edu => ({
        kind: "edu",
        school: edu.school || "",
        degree: edu.degree || "",
        dates: edu.duration || ""
      }))
    });
  }

  // 5. Skills block
  if (res.skills && res.skills.length > 0) {
    blocks.push({
      kind: "section",
      label: "Skills",
      items: res.skills.map(skill => ({
        kind: "skill",
        name: skill
      }))
    });
  }

  // 6. Projects block
  if (res.projects && res.projects.length > 0) {
    blocks.push({
      kind: "section",
      label: "Projects",
      items: res.projects.map(proj => ({
        kind: "job",
        company: proj.name || "Project",
        title: "",
        dates: proj.duration || "",
        bullets: proj.description || []
      }))
    });
  }

  // 7. Certifications block
  if (res.certifications && res.certifications.length > 0) {
    blocks.push({
      kind: "section",
      label: "Certifications",
      items: res.certifications.map(cert => ({
        kind: "line",
        text: cert
      }))
    });
  }

  // 8. Languages block
  if (res.languages && res.languages.length > 0) {
    blocks.push({
      kind: "section",
      label: "Languages",
      items: res.languages.map(lang => ({
        kind: "line",
        text: lang
      }))
    });
  }

  // 9. Achievements block
  if (res.achievements && res.achievements.length > 0) {
    blocks.push({
      kind: "section",
      label: "Key Achievements",
      items: res.achievements.map(ach => ({
        kind: "line",
        text: ach
      }))
    });
  }

  return {
    raw: rawText || "",
    blocks
  };
}

export function mergeResumeWithAdditions(
  resume: Resume | ResumeStructure,
  tailored: TailoredResume
): ResumeStructure {
  const normResume = "blocks" in resume ? resume : resumeStructureToResume(resume);

  // Helper to render plain text with inline additions
  const getMergedText = (text: string, additions: any[] | undefined): string => {
    if (!additions || additions.length === 0) return text;
    const sorted = [...additions].sort((a, b) => a.insertAfter - b.insertAfter);
    let result = "";
    let pos = 0;
    sorted.forEach(add => {
      if (add.insertAfter > pos) {
        result += text.slice(pos, add.insertAfter);
        pos = add.insertAfter;
      }
      result += add.text;
    });
    if (pos < text.length) {
      result += text.slice(pos);
    }
    return result;
  };

  // Convert blocks back to ResumeStructure while merging additions
  const headerBlock = normResume.blocks.find(b => b.kind === "header") as any;
  const name = headerBlock?.name || "";
  const contact = headerBlock?.contact || [];
  const email = contact.find((c: string) => c.includes("@")) || "";
  const phone = contact.find((c: string) => /^[+\d\s()-]{7,20}$/.test(c.replace(/[^\d+]/g, ""))) || "";
  const linkedin = contact.find((c: string) => c.toLowerCase().includes("linkedin.com")) || "";
  const website = contact.find((c: string) => !c.includes("@") && c !== phone && c !== linkedin) || "";

  // Summary block
  const summaryBlockIdx = normResume.blocks.findIndex(b => b.kind === "text" && (b.label?.toLowerCase().includes("summary") || b.label?.toLowerCase().includes("profile")));
  let summary = "";
  if (summaryBlockIdx !== -1) {
    const sb = normResume.blocks[summaryBlockIdx] as any;
    summary = getMergedText(sb.body, tailored.inlineAdditions?.[`${summaryBlockIdx}.summary`]);
  }

  // Work Experience block
  const expBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "experience");
  const workExperience: any[] = [];
  if (expBlockIdx !== -1) {
    const eb = normResume.blocks[expBlockIdx] as any;
    eb.items.forEach((item: any, itemIdx: number) => {
      if (item.kind === "job") {
        const jobKey = `${expBlockIdx}.${itemIdx}`;
        const mergedBullets = item.bullets.map((bullet: string, bulletIdx: number) => {
          return getMergedText(bullet, tailored.inlineAdditions?.[`${jobKey}.${bulletIdx}`]);
        });
        
        // Append new bullets (Kind B)
        const nbs = tailored.newBullets?.[jobKey] || [];
        nbs.forEach(nb => {
          mergedBullets.push(nb.text);
        });

        workExperience.push({
          id: `exp-${Date.now()}-${itemIdx}`,
          company: item.company,
          role: item.title,
          duration: item.dates,
          description: mergedBullets
        });
      }
    });
  }

  // Education block
  const eduBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "education");
  const education: any[] = [];
  if (eduBlockIdx !== -1) {
    const eb = normResume.blocks[eduBlockIdx] as any;
    eb.items.forEach((item: any, itemIdx: number) => {
      if (item.kind === "edu") {
        education.push({
          id: `edu-${Date.now()}-${itemIdx}`,
          school: item.school,
          degree: item.degree,
          duration: item.dates
        });
      }
    });
  }

  // Skills block
  const skillsBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "skills");
  const skills: string[] = [];
  if (skillsBlockIdx !== -1) {
    const sb = normResume.blocks[skillsBlockIdx] as any;
    sb.items.forEach((item: any) => {
      if (item.kind === "skill") {
        skills.push(item.name);
      }
    });
  }
  // Append new skills (Kind C)
  if (tailored.newSkills) {
    tailored.newSkills.forEach(sk => {
      if (!skills.includes(sk)) skills.push(sk);
    });
  }

  // Projects block
  const projBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "projects");
  const projects: any[] = [];
  if (projBlockIdx !== -1) {
    const pb = normResume.blocks[projBlockIdx] as any;
    pb.items.forEach((item: any, itemIdx: number) => {
      if (item.kind === "job") {
        projects.push({
          id: `proj-${Date.now()}-${itemIdx}`,
          name: item.company,
          duration: item.dates,
          description: item.bullets
        });
      }
    });
  }

  // Languages block
  const langBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "languages");
  const languages: string[] = [];
  if (langBlockIdx !== -1) {
    const lb = normResume.blocks[langBlockIdx] as any;
    lb.items.forEach((item: any) => {
      if (item.kind === "line") {
        languages.push(item.text);
      }
    });
  }

  // Certifications block
  const certBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "certifications");
  const certifications: string[] = [];
  if (certBlockIdx !== -1) {
    const cb = normResume.blocks[certBlockIdx] as any;
    cb.items.forEach((item: any) => {
      if (item.kind === "line") {
        certifications.push(item.text);
      }
    });
  }

  // Achievements block
  const achBlockIdx = normResume.blocks.findIndex(b => b.kind === "section" && b.label.toLowerCase() === "achievements");
  const achievements: string[] = [];
  if (achBlockIdx !== -1) {
    const ab = normResume.blocks[achBlockIdx] as any;
    ab.items.forEach((item: any) => {
      if (item.kind === "line") {
        achievements.push(item.text);
      }
    });
  }

  // Handle new sections (Kind D)
  if (tailored.newSections) {
    tailored.newSections.forEach(sec => {
      const label = sec.label.toLowerCase();
      if (label === "certifications") {
        sec.items.forEach(it => {
          if (it.kind === "line") certifications.push(it.text);
        });
      } else if (label === "languages") {
        sec.items.forEach(it => {
          if (it.kind === "line") languages.push(it.text);
        });
      } else if (label === "achievements") {
        sec.items.forEach(it => {
          if (it.kind === "line") achievements.push(it.text);
        });
      }
    });
  }

  return {
    fullName: name,
    email,
    phone,
    summary,
    workExperience,
    education,
    skills,
    projects,
    languages,
    certifications,
    achievements
  };
}
