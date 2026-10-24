/**
 * API tests for rules mode (USE_GEMINI off, no AI calls).
 * Run with: npm run test:api
 */
import { startApp, postJson, Checks, lc } from "./helpers.ts";
import { buildFixtures, JD_BACKEND, JD_NURSE } from "./fixtures.ts";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KNOWN_JD = "JD reader only knows a short skill/title list; expected to improve with AI mode";
const KNOWN_TWO_COL = "two-column PDFs are read line by line across both columns";

const app = await startApp({ USE_GEMINI: "false", GEMINI_API_KEY: "", GROQ_API_KEY: "" });
const t = new Checks();
const post = (route: string, body: unknown) => postJson(app.baseUrl, route, body);
const fx = await buildFixtures();
const upload = (name: string, type: string, data: Buffer) =>
  post("/api/analyze-uploaded-resume", { fileName: name, fileType: type, base64Data: data.toString("base64") });

try {
  // ───────── Upload / parse ─────────
  const single = await upload("resume_single.pdf", PDF, fx.single);
  {
    const j = single.json, p = j.detectedProfile || {};
    const we = p.workExperience || [];
    const ed = (p.education || [])[0] || {};
    t.check("U1a", "Single-column PDF is accepted as a resume", single.status === 200 && j.isResume === true, `isResume=${j.isResume}`);
    t.check("U1b", "Name parsed", p.fullName === "Priya Sharma", p.fullName);
    t.check("U1c", "Email parsed", p.email === "priya.sharma@example.com", p.email);
    t.check("U1d", "Phone parsed", (p.phone || "").includes("98765"), `phone="${p.phone}"`);
    t.check("U1e", "Location and LinkedIn parsed", (p.location || "").includes("Bengaluru") && (p.linkedin || "").includes("priyasharma"), `location="${p.location}" linkedin="${p.linkedin}"`);
    t.check("U1f", "Both jobs found", we.length === 2, `count=${we.length}`);
    t.check("U1g", "Job titles parsed", we[0]?.role === "Senior Software Engineer" && we[1]?.role === "Software Engineer", we.map((w: any) => w.role).join(", "));
    t.check("U1h", "Company names parsed", we[0]?.company === "Flipkart" && we[1]?.company === "Infosys", we.map((w: any) => w.company).join(", "));
    t.check("U1i", "Job dates parsed", we[0]?.duration === "Jan 2023 - Present" && we[1]?.duration === "Jul 2020 - Dec 2022");
    t.check("U1j", "All 5 bullets kept", we.reduce((n: number, w: any) => n + (w.description?.length || 0), 0) === 5);
    t.check("U1k", "Degree parsed", (ed.degree || "").includes("B.Tech"), `degree="${ed.degree}"`);
    t.check("U1l", "School and education dates parsed", ed.school?.includes("Trichy") && (ed.duration || "").includes("2016"), `school="${ed.school}" duration="${ed.duration}"`);
    t.check("U1m", "Skills parsed (8)", (p.skills || []).length === 8, (p.skills || []).join(", "));
    t.check("U1n", "Project and certification parsed", (p.projects || [])[0]?.name === "Expense Splitter App" && (p.certifications || []).length === 1);
  }

  const twoCol = await upload("resume_twocol.pdf", PDF, fx.twoColumn);
  {
    const j = twoCol.json, p = j.detectedProfile || {};
    const we = p.workExperience || [];
    const skills = (p.skills || []).map((s: string) => s.toLowerCase());
    t.check("U2a", "Two-column PDF accepted", j.isResume === true, j.reason);
    t.check("U2b", "Two-column: name and email", p.fullName === "Rahul Verma" && p.email === "rahul.verma@example.com");
    t.check("U2c", "Two-column: left-column skills found", ["java", "kafka", "docker"].every(s => skills.some((x: string) => x.includes(s))), (p.skills || []).join(", "), { known: KNOWN_TWO_COL });
    t.check("U2d", "Two-column: 2 jobs (Zomato, TCS)", we.length === 2 && lc(we).includes("zomato") && lc(we).includes("tcs"), `count=${we.length}`, { known: KNOWN_TWO_COL });
    t.check("U2e", "Two-column: no left-column leakage into job bullets", !we.some((w: any) => (w.description || []).some((b: string) => /^(java|docker|mysql|bits pilani|kafka)$/i.test(b.trim()))));
    t.check("U2f", "Two-column: education (BITS Pilani)", lc(p.education).includes("bits pilani"), JSON.stringify(p.education), { known: KNOWN_TWO_COL });
  }

  const docx = await upload("resume.docx", DOCX, fx.docx);
  {
    const j = docx.json, p = j.detectedProfile || {};
    t.check("U3a", "Word (.docx) accepted as resume", j.isResume === true, j.reason);
    t.check("U3b", "Word: name, email, 2 jobs, 8 skills",
      p.fullName === "Priya Sharma" && p.email && (p.workExperience || []).length === 2 && (p.skills || []).length === 8,
      `${p.fullName}, jobs=${(p.workExperience || []).length}, skills=${(p.skills || []).length}`);
  }

  const alt = await upload("resume_alt.pdf", PDF, fx.alt);
  {
    const p = alt.json.detectedProfile || {}, we = p.workExperience || [], ed = (p.education || [])[0] || {};
    t.check("U8a", "Alt layout: one-line 'Title | Company | Dates'", we[0]?.role === "Frontend Developer" && we[0]?.company === "Acme Corp" && we[0]?.duration === "Jun 2021 - Present", JSON.stringify(we[0]));
    t.check("U8b", "Alt layout: 'Title at Company'", we[1]?.role === "Software Engineer Intern" && we[1]?.company === "Globex", JSON.stringify(we[1]));
    t.check("U8c", "Alt layout: school line before degree line", ed.school === "University of Texas at Austin" && ed.degree === "B.S. in Computer Science" && ed.duration === "2017 - 2021" && ed.gpa === "3.8/4.0", JSON.stringify(ed));
    t.check("U8d", "Alt layout: US phone, location, website", p.phone === "(512) 555-0147" && p.location === "Austin, TX" && /github\.com\/alexj-test/.test(p.website || ""), `phone="${p.phone}" location="${p.location}" website="${p.website}"`);
    t.check("U8e", "Alt layout: bullets attached to the right jobs", (we[0]?.description || []).length === 2 && (we[1]?.description || []).length === 1);
  }

  const lig = await upload("ligatures.pdf", PDF, fx.ligatures);
  {
    const text: string = lig.json.extractedText || "";
    const p = lig.json.detectedProfile || {};
    t.check("U9a", "Ligature PDF: split words rejoined (define, efficiency, workflow)",
      /define the product roadmap/.test(text) && /efficiency/.test(text) && /workflow/.test(text) && !/de fi ne|ef fi|work fl ow/.test(text),
      text.slice(0, 300));
    t.check("U9b", "Ligature PDF: company name rejoined (Xfin Digital)", /Xfin Digital/.test(text) && (p.workExperience?.[0]?.company || "").includes("Xfin"), `company="${p.workExperience?.[0]?.company}"`);
    t.check("U9c", "Ligature PDF: normal words untouched (\"the five teams\")", /the five teams/.test(text), text.slice(0, 300));
  }

  const recipe = await upload("recipe.pdf", PDF, fx.recipe);
  t.check("U4", "Non-resume PDF (recipe) rejected", recipe.json.isResume === false, recipe.json.reason);
  const txt = await upload("resume.txt", "text/plain", fx.text);
  t.check("U5", "Unsupported .txt rejected cleanly", txt.status === 200 && txt.json.isResume === false && txt.json.fileType === "unsupported");
  const noData = await post("/api/analyze-uploaded-resume", { fileName: "x.pdf", fileType: PDF });
  t.check("U6", "Missing file data → 400", noData.status === 400, `status=${noData.status}`);
  const corrupt = await upload("corrupt.pdf", PDF, fx.corrupt);
  t.check("U7", "Corrupted PDF handled without crashing", corrupt.status === 200 && corrupt.json.isResume === false, `status=${corrupt.status}`);

  // ───────── Simplify JD ─────────
  const simp = await post("/api/simplify-jd", { jdText: JD_BACKEND });
  {
    const j = simp.json;
    const kw = lc(j.keywordsToTarget) + lc(j.requiredSkills);
    const missing = ["python", "postgresql", "redis", "kafka", "docker", "kubernetes", "aws", "microservices", "rest"].filter(w => !kw.includes(w));
    t.check("S1a", "Simplify: valid JD recognised", simp.status === 200 && j.isValidJd === true);
    t.check("S1b", "Simplify: job title extracted", /backend engineer/i.test(j.jobTitle || ""), `jobTitle="${j.jobTitle}"`, { known: KNOWN_JD });
    t.check("S1c", "Simplify: key skills captured", missing.length === 0, `missed: ${missing.join(", ")}`, { known: KNOWN_JD });
    t.check("S1d", "Simplify: responsibilities come from the JD", /distributed|mentor|reliab/i.test(lc(j.keyResponsibilities)), JSON.stringify(j.keyResponsibilities), { known: KNOWN_JD });
    t.check("S1e", "Simplify: skill names properly cased", !(j.keywordsToTarget || []).some((k: string) => ["Aws", "Postgresql", "Ci/cd"].includes(k)), JSON.stringify(j.keywordsToTarget), { known: KNOWN_JD });
  }
  const garbage = await post("/api/simplify-jd", { jdText: "asdf qwerty lorem ipsum hello" });
  t.check("S2", "Simplify: gibberish JD flagged invalid", garbage.json.isValidJd === false, `isValidJd=${garbage.json.isValidJd}`, { known: "server accepts it; the UI's 50-word check blocks most of these" });
  const empty = await post("/api/simplify-jd", {});
  t.check("S3", "Simplify: empty request → 4xx", empty.status >= 400 && empty.status < 500, `status=${empty.status}`);

  // ───────── Tailor (the UI sends the "blocks" format) ─────────
  const resume = single.json.detectedProfile;
  const specResume = single.json.resume;
  const tail = await post("/api/tailor-resume", { resume: specResume, jdText: JD_BACKEND });
  {
    const j = tail.json;
    const adds = Object.values(j.inlineAdditions || {}).flat() as any[];
    const bullets = Object.values(j.newBullets || {}).flat() as any[];
    const invented = [...adds.map(a => a.text), ...bullets.map(b => b.text)].filter((x: string) => /\d+\s*%|\d+\s*weeks/.test(x));
    t.check("T1a", "Tailor: returns 200 with output", tail.status === 200 && !j.error, j.error);
    t.check("T1b", "Tailor: Python and Redis counted as matched", lc(j.matchedKeywords).includes("python") && lc(j.matchedKeywords).includes("redis"), JSON.stringify(j.matchedKeywords));
    t.check("T1c", "Tailor: score > 0 for a matching resume", j.score > 0, `score=${j.score}`);
    t.check("T1d", "Tailor: doesn't suggest skills already on the resume", !(j.newSkills || []).some((s: string) => ["python", "redis", "postgresql", "sql", "node.js"].includes(s.toLowerCase())), JSON.stringify(j.newSkills));
    t.check("T1e", "Tailor: reports Kafka/Kubernetes as missing", lc(j.missingKeywords).includes("kafka") && lc(j.missingKeywords).includes("kubernetes"), JSON.stringify(j.missingKeywords), { known: KNOWN_JD });
    t.check("T1g", "Tailor: doesn't invent metrics (% or weeks)", invented.length === 0, invented.join(" | "));
  }
  const tailNoJd = await post("/api/tailor-resume", { resume: specResume });
  t.check("T2", "Tailor: missing JD → 400", tailNoJd.status === 400, `status=${tailNoJd.status}`);
  const noCert = { ...specResume, blocks: specResume.blocks.filter((b: any) => b.label !== "Certifications") };
  const tailNoCert = await post("/api/tailor-resume", { resume: noCert, jdText: JD_BACKEND });
  t.check("T3", "Tailor: doesn't add a certification the person doesn't have", !(tailNoCert.json.newSections || []).some((s: any) => /certif/i.test(s.label)), JSON.stringify(tailNoCert.json.newSections));
  const tailReact = await post("/api/tailor-resume", { resume: specResume, jdText: "Full stack engineer. Must have React, Python, Go and Docker experience." });
  t.check("T5", "Tailor: without a skill choice, only adds skills the resume already shows (React yes, Go/Docker no)",
    (tailReact.json.newSkills || []).includes("React") && !(tailReact.json.newSkills || []).some((s: string) => /^(go|docker)$/i.test(s)), JSON.stringify(tailReact.json.newSkills));

  // ───────── Skill checkbox step ─────────
  const picked = await post("/api/tailor-resume", { resume: specResume, resumeStructure: resume, jdText: JD_BACKEND, selectedSkills: ["Kafka", "Docker", "python", "  "] });
  t.check("K1", "Chosen skills: adds exactly the ticked ones, skips ones already on the resume", JSON.stringify(picked.json.newSkills) === JSON.stringify(["Kafka", "Docker"]), JSON.stringify(picked.json.newSkills));
  const none = await post("/api/tailor-resume", { resume: specResume, jdText: JD_BACKEND, selectedSkills: [] });
  t.check("K2", "Chosen skills: nothing ticked → nothing added", Array.isArray(none.json.newSkills) && none.json.newSkills.length === 0, JSON.stringify(none.json.newSkills));
  t.check("K3", "Chosen skills: no invented bullets, metrics or sections",
    Object.keys(picked.json.inlineAdditions || {}).length === 0 && Object.keys(picked.json.newBullets || {}).length === 0 && (picked.json.newSections || []).length === 0);
  const dup = await post("/api/tailor-resume", { resume: specResume, jdText: JD_BACKEND, selectedSkills: ["Kafka", "kafka", "KAFKA"] });
  t.check("K4", "Chosen skills: duplicates in any case are added once", (dup.json.newSkills || []).length === 1, JSON.stringify(dup.json.newSkills));

  // ───────── ATS audit (takes the structured resume) ─────────
  const ats = await post("/api/ats-audit", { resume, jdText: JD_BACKEND });
  const atsNurse = await post("/api/ats-audit", { resume, jdText: JD_NURSE });
  {
    const a = ats.json.score, b = atsNurse.json.score;
    const fb = lc(ats.json.criteria);
    t.check("A1a", "ATS: score is a number 0-100", typeof a === "number" && a >= 0 && a <= 100, `score=${a}`);
    t.check("A1b", "ATS: matching JD scores higher than an unrelated one", a > b, `backend=${a}, nurse=${b}`);
    t.check("A1c", "ATS: unrelated (nurse) JD scores low (<40)", typeof b === "number" && b < 40, `nurse=${b}`, { known: "40% of the score comes from having standard sections" });
    t.check("A1d", "ATS: feedback names Kafka/Kubernetes as missing", fb.includes("kafka") && fb.includes("kubernetes"), (ats.json.criteria || [])[0]?.feedback, { known: KNOWN_JD });
    t.check("A1e", "ATS: doesn't say the phone is missing (resume has one)", !fb.includes("phone number is missing"));
  }
  const atsNoResume = await post("/api/ats-audit", { jdText: JD_BACKEND });
  t.check("A3", "ATS: missing resume → 400", atsNoResume.status === 400, `status=${atsNoResume.status}`);
} catch (err) {
  t.check("CRASH", "Test run crashed", false, String((err as Error)?.stack || err));
} finally {
  await app.close();
}

process.exit(t.report("Rules mode (no AI)"));
