/**
 * Checks the downloaded PDF is ATS-readable: real text (no images), every fact present,
 * awkward characters handled, and our own resume reader can read the exported file back.
 * Run with: npm run test:api
 */
import { getDocumentProxy, extractText } from "unpdf";
import { startApp, postJson, Checks } from "./helpers.ts";
import { buildResumePdf, toPdfSafeText } from "../../src/utils/resumePdf.ts";
import type { ResumeStructure } from "../../src/types.ts";

const longBullet = "Coordinated a cross-team migration of the order platform to event-driven services, writing the rollout plan, running weekly reviews with 6 teams and tracking risks until launch";
const resume: ResumeStructure = {
  fullName: "Priya Sharma",
  email: "priya.sharma@example.com",
  phone: "+91 98765 43210",
  linkedin: "linkedin.com/in/priyasharma-test",
  location: "Bengaluru, India",
  summary: "Backend engineer with 4 years’ experience building “high-traffic” REST APIs – and data pipelines… in Python and Node.js.",
  workExperience: [
    { id: "e1", role: "Senior Software Engineer", company: "Flipkart", duration: "Jan 2023 - Present", description: [
      "Built order-tracking REST APIs in Node.js serving 2M requests per day",
      "Reduced p95 latency by 35% by adding Redis caching",
      "Managed a ₹40 lakh cloud budget for the team",
      longBullet
    ] },
    { id: "e2", role: "Software Engineer", company: "Infosys", duration: "Jul 2020 - Dec 2022", description: [
      "Developed ETL pipelines in Python moving 500GB of data nightly",
      "Wrote unit tests raising coverage from 40% to 85%"
    ] }
  ],
  education: [{ id: "d1", degree: "B.Tech in Computer Science", school: "National Institute of Technology Trichy", duration: "2016 - 2020", gpa: "8.6" }],
  projects: [{ id: "p1", name: "Expense Splitter App", description: ["Built a React and Express app to split group expenses, 1,000 monthly users"] }],
  skills: ["Python", "Node.js", "PostgreSQL", "Redis", "Docker", "Kafka"],
  certifications: ["AWS Certified Cloud Practitioner (2022)"],
  languages: ["English", "Hindi"],
  achievements: []
};

const t = new Checks();
const bytes = new Uint8Array(buildResumePdf(resume, "Senior Backend Engineer").output("arraybuffer"));
const raw = Buffer.from(bytes).toString("latin1");
const pdf = await getDocumentProxy(bytes.slice()); // pdf.js takes ownership of the buffer it's given
const { text } = await extractText(pdf, { mergePages: true });
const flat = String(text).replace(/\s+/g, " ");

t.check("X1", "PDF has a real text layer (no images)", flat.length > 500 && !/\/Subtype\s*\/Image/.test(raw), `chars=${flat.length}`);
t.check("X2", "PDF is small (under 100 KB; the old image PDF was ~7.5 MB)", bytes.length < 100_000, `${Math.round(bytes.length / 1024)} KB`);
t.check("X3", "Name, email, phone and LinkedIn are in the text",
  ["Priya Sharma", "priya.sharma@example.com", "+91 98765 43210", "linkedin.com/in/priyasharma-test"].every(s => flat.includes(s)));
t.check("X4", "Every job title, company and date range is in the text",
  resume.workExperience.every(j => flat.includes(j.role) && flat.includes(j.company) && flat.includes(j.duration)));
t.check("X5", "Every bullet is in the text (long ones wrapped, not cut)",
  resume.workExperience.flatMap(j => j.description).every(b => flat.includes(toPdfSafeText(b))),
  resume.workExperience.flatMap(j => j.description).filter(b => !flat.includes(toPdfSafeText(b))).join(" | "));
t.check("X6", "Standard section headings present", ["SUMMARY", "SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "LANGUAGES"].every(h => flat.includes(h)));
t.check("X7", "Skills listed as plain text", flat.includes("Python, Node.js, PostgreSQL, Redis, Docker, Kafka"));
t.check("X8", "Awkward characters come through readable (₹ → Rs., smart quotes, dashes)",
  flat.includes("Rs. 40 lakh") && flat.includes("4 years' experience") && flat.includes('"high-traffic"') && flat.includes("REST APIs - and data pipelines...") && !/[�]/.test(flat),
  flat.slice(flat.indexOf("SUMMARY"), flat.indexOf("SUMMARY") + 160));
t.check("X9", "Empty sections are left out (no 'Achievements' heading)", !flat.includes("ACHIEVEMENTS"));

// Round trip: upload the exported PDF to our own resume reader, like an ATS would read it
const app = await startApp({ USE_GEMINI: "false", GEMINI_API_KEY: "", GROQ_API_KEY: "", NVIDIA_API_KEY: "" });
try {
  const up = await postJson(app.baseUrl, "/api/analyze-uploaded-resume", {
    fileName: "exported.pdf", fileType: "application/pdf", base64Data: Buffer.from(bytes).toString("base64")
  });
  const p = up.json.detectedProfile || {};
  const we = p.workExperience || [];
  t.check("X10", "Round trip: exported PDF is accepted as a resume", up.json.isResume === true, `${up.json.reason} | ${String(up.json.extractedText || "").slice(0, 500)}`);
  t.check("X11", "Round trip: name, email, phone read back", p.fullName === "Priya Sharma" && p.email === resume.email && (p.phone || "").includes("98765"),
    `${p.fullName} | ${p.email} | ${p.phone}`);
  t.check("X12", "Round trip: both jobs read back with title, company and dates",
    we.length === 2 && we[0].role === "Senior Software Engineer" && we[0].company === "Flipkart" && we[0].duration === "Jan 2023 - Present" && we[1].company === "Infosys",
    JSON.stringify(we.map((w: any) => [w.role, w.company, w.duration])));
  t.check("X13", "Round trip: skills read back", ["Python", "Redis", "Kafka"].every(s => (p.skills || []).includes(s)), JSON.stringify(p.skills));
} finally {
  await app.close();
}

process.exit(t.report("PDF export (ATS readability)"));
