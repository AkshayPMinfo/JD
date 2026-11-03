/**
 * Gemini hangs (never answers): tailoring must still finish well inside Vercel's 60s limit,
 * using the Groq backup. Fake servers only, no real keys.
 * Run with: npm run test:api
 */
import http from "http";
import type { AddressInfo } from "net";
import { startApp, postJson, Checks } from "./helpers.ts";

let geminiHits = 0;
// Fake Gemini that takes the request and never replies
const stuckGemini = http.createServer(() => { geminiHits++; });
await new Promise<void>(r => stuckGemini.listen(0, "127.0.0.1", () => r()));

const fakeGroq = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    const user: string = JSON.parse(body || "{}").messages?.[1]?.content || "";
    const m = user.match(/Candidate's Original Resume:\n([\s\S]*?)\n\nJob Description:/);
    const original = m ? JSON.parse(m[1]) : {};
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify({ suggestions: [], tailoredResume: original }) } }] }));
  });
});
await new Promise<void>(r => fakeGroq.listen(0, "127.0.0.1", () => r()));

const port = (s: http.Server) => (s.address() as AddressInfo).port;
const app = await startApp({
  USE_GEMINI: "true",
  GEMINI_API_KEY: "test-gemini-key",
  GOOGLE_GEMINI_BASE_URL: `http://127.0.0.1:${port(stuckGemini)}`,
  GROQ_API_KEY: "test-groq-key",
  GROQ_BASE_URL: `http://127.0.0.1:${port(fakeGroq)}`,
  NVIDIA_API_KEY: "",
  VITE_SUPABASE_URL: "",
  SUPABASE_URL: ""
});
const t = new Checks();

const structure = {
  fullName: "Neha Kapoor", email: "neha.kapoor.test@example.com", phone: "+91 90000 12345",
  summary: "Product professional with experience in product and analytics.",
  workExperience: [{ id: "exp-1", role: "Associate Product Manager", company: "Pixelcart", duration: "Apr 2023 - Present",
    description: ["Launched a one-tap reorder feature that increased repeat orders by 9%."] }],
  education: [], projects: [], skills: ["Jira", "SQL"], certifications: [], languages: [], achievements: []
};
const JD = "Associate Product Manager, Payments. Write PRDs and user stories, run A/B tests on checkout flows, work with engineering and design in Agile sprints using Jira. 1-3 years of product management experience.";

try {
  const started = Date.now();
  const res = await postJson(app.baseUrl, "/api/tailor-resume", { resume: { raw: "", blocks: [] }, resumeStructure: structure, jdText: JD, selectedSkills: [] });
  const secs = (Date.now() - started) / 1000;
  t.check("T1", "Gemini was tried", geminiHits >= 1, `hits=${geminiHits}`);
  t.check("T2", "Tailoring still returns a resume", res.status === 200 && !!res.json.tailoredResume, `status=${res.status}`);
  t.check("T3", "Finished in under 40s (Vercel stops at 60s)", secs < 40, `${secs.toFixed(1)}s`);
} catch (err) {
  t.check("CRASH", "Test run crashed", false, String((err as Error)?.stack || err));
} finally {
  await app.close();
  stuckGemini.closeAllConnections?.(); stuckGemini.close(); fakeGroq.close();
}
process.exit(t.report("AI mode: Gemini stuck → backup answers in time"));
