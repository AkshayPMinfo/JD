/**
 * Tests the Gemini → Groq fallback with a fake Groq server (no real keys, no cost).
 * Runs the app with AI mode on and no Gemini key, so every text request must go to Groq.
 * Run with: npm run test:api
 */
import http from "http";
import type { AddressInfo } from "net";
import { startApp, postJson, Checks } from "./helpers.ts";

interface GroqCall { path: string; authOk: boolean; jsonMode: string; hasSchema: boolean; kind: string; careerNote: boolean; prompt: string }
const calls: GroqCall[] = [];
const FAKE_KEY = "test-groq-key";

// Fake OpenAI-compatible Groq endpoint: returns canned JSON based on which schema the app asked for.
const fakeGroq = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const system: string = j.messages?.[0]?.content || "";
    const user: string = j.messages?.[1]?.content || "";
    const kind = system.includes('"tailoredResume"') ? "tailor" : system.includes('"isValidJd"') ? "simplify" : "other";
    calls.push({
      path: req.url || "",
      authOk: req.headers.authorization === `Bearer ${FAKE_KEY}`,
      jsonMode: j.response_format?.type,
      hasSchema: system.includes("JSON Schema"),
      kind,
      careerNote: user.includes("CAREER CHANGE"),
      prompt: user
    });
    let content: string;
    if (kind === "tailor") {
      // Echo the resume back with an unrequested skill ("Go") to check the app strips it.
      const m = user.match(/Candidate's Original Resume:\n([\s\S]*?)\n\nJob Description:/);
      const original = m ? JSON.parse(m[1]) : {};
      const tailored = JSON.parse(JSON.stringify(original));
      tailored.skills = [...(original.skills || []), "Kafka", "Go"];
      content = JSON.stringify({ suggestions: [], tailoredResume: tailored });
    } else if (kind === "simplify") {
      content = JSON.stringify({
        isValidJd: true, invalidReason: "", jobTitle: "Senior Backend Engineer",
        companyPitch: "Backend engineer for order systems.",
        requiredSkills: [{ name: "Python", priority: "high" }, { name: "Kafka", priority: "high" }],
        keyResponsibilities: ["Design scalable distributed systems"], candidateExpectations: ["Mentor engineers"],
        keywordsToTarget: ["Python", "Kafka"], requiredQualifications: []
      });
    } else {
      content = JSON.stringify({ ok: true });
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});
await new Promise<void>(resolve => fakeGroq.listen(0, "127.0.0.1", () => resolve()));
const groqPort = (fakeGroq.address() as AddressInfo).port;

const app = await startApp({
  USE_GEMINI: "true",
  GEMINI_API_KEY: "",
  GROQ_API_KEY: FAKE_KEY,
  GROQ_BASE_URL: `http://127.0.0.1:${groqPort}`,
  // No Supabase here, so the daily AI limit is off (see aiLimit.test.ts for the limit itself)
  VITE_SUPABASE_URL: "",
  SUPABASE_URL: ""
});
const t = new Checks();
const post = (route: string, body: unknown) => postJson(app.baseUrl, route, body);

const structure = {
  fullName: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 98765 43210",
  summary: "Backend software engineer with 4 years of experience.",
  workExperience: [{ id: "exp-1", role: "Senior Software Engineer", company: "Flipkart", duration: "Jan 2023 - Present",
    description: ["Built order-tracking REST APIs in Node.js serving 2M requests per day"] }],
  education: [{ id: "edu-1", degree: "B.Tech in Computer Science", school: "NIT Trichy", duration: "2016 - 2020", gpa: "8.6" }],
  projects: [], skills: ["Python", "Node.js", "Redis"], certifications: [], languages: [], achievements: []
};
const blocks = { raw: "", blocks: [{ kind: "header", name: "Priya Sharma", contact: [] }] };
const JD = "Senior Backend Engineer. Must have Python, Kafka and Kubernetes. Design scalable distributed systems and mentor engineers. Requirements: 4+ years of experience building backend services.";

try {
  const simp = await post("/api/simplify-jd", { jdText: JD });
  t.check("F1", "Simplify JD goes through Groq when there's no Gemini key", simp.status === 200 && simp.json.jobTitle === "Senior Backend Engineer", `status=${simp.status} err=${simp.json.error || ""}`);

  const tail = await post("/api/tailor-resume", { resume: blocks, resumeStructure: structure, jdText: JD, selectedSkills: ["Kafka"] });
  const tr = tail.json.tailoredResume || {};
  t.check("F2", "Tailor goes through Groq", tail.status === 200 && !!tail.json.tailoredResume, `status=${tail.status} err=${tail.json.error || ""}`);
  t.check("F3", "Only the ticked skill (Kafka) is added; the model's extra 'Go' is removed",
    JSON.stringify(tr.skills) === JSON.stringify(["Python", "Node.js", "Redis", "Kafka"]), JSON.stringify(tr.skills));
  t.check("F4", "Facts kept (name, company, dates, school)",
    tr.fullName === "Priya Sharma" && tr.workExperience?.[0]?.company === "Flipkart" &&
    tr.workExperience?.[0]?.duration === "Jan 2023 - Present" && tr.education?.[0]?.school === "NIT Trichy");
  t.check("F5", "Groq called with the key, JSON mode and the expected schema",
    calls.length >= 2 && calls.every(c => c.authOk && c.jsonMode === "json_object" && c.hasSchema && c.path === "/chat/completions"),
    JSON.stringify(calls));

  const firstTailor = calls.find(c => c.kind === "tailor");
  t.check("F7", "No career-change instructions unless the person says they're switching", firstTailor && !firstTailor.careerNote);
  const switchRes = await post("/api/tailor-resume", {
    resume: blocks, resumeStructure: structure, jdText: JD, selectedSkills: [],
    careerSwitch: { fromRole: "Associate Product Manager", fromField: "product management", toRole: "Backend Software Engineer", toField: "software engineering" }
  });
  const switchCall = calls.filter(c => c.kind === "tailor").pop();
  t.check("F8", "Career switch: AI gets honest-move instructions with both roles",
    switchRes.status === 200 && !!switchCall?.careerNote && /Associate Product Manager/.test(switchCall.prompt) && /Do NOT present them as already having worked as a Backend Software Engineer/.test(switchCall.prompt),
    `status=${switchRes.status}`);

  t.check("F9", "Every tailoring request carries the honesty rules (no new numbers, skills or seniority)",
    calls.filter(c => c.kind === "tailor").every(c => /HONESTY RULES/.test(c.prompt) && /Never add a number/.test(c.prompt) && /Never add or raise seniority/.test(c.prompt)));

  const before = calls.length;
  const img = await post("/api/simplify-jd", { jdImageBase64: "data:image/png;base64,iVBORw0KGgo=" });
  t.check("F6", "Screenshot JDs aren't sent to Groq (text only) and fail cleanly", img.status >= 400 && calls.length === before, `status=${img.status}`);
} catch (err) {
  t.check("CRASH", "Test run crashed", false, String((err as Error)?.stack || err));
} finally {
  await app.close();
  fakeGroq.close();
}

process.exit(t.report("AI mode: Gemini → Groq fallback (fake Groq server)"));
