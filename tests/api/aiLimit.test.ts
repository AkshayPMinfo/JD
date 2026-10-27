/**
 * Daily AI limit (api/aiLimit.ts): 3 AI tailorings a day for signed-in users, 1 for guests,
 * then the no-AI (rules) mode. Uses a fake Supabase and a fake AI, so no keys and no cost.
 * Run with: npm run test:api
 */
import http from "http";
import type { AddressInfo } from "net";
import { startApp, Checks } from "./helpers.ts";

// Fake Supabase RPCs. Token "user-*" = signed in (3/day), "guest-*" = anonymous (1/day),
// "expired" = rejected sign-in. While `notSetUp` is true the functions don't exist (SQL not run yet).
let notSetUp = false;
const used = new Map<string, number>();
const RESETS_AT = new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString();
const fakeSupabase = http.createServer((req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  req.resume();
  req.on("end", () => {
    if (req.headers.apikey !== "anon-key") return send(401, { message: "No API key" });
    if (notSetUp) return send(404, { code: "PGRST202", message: "Could not find the function" });
    if (!token || token === "expired") return send(401, { code: "PGRST301", message: "JWT expired" });
    const limit = token.startsWith("guest") ? 1 : 3;
    const n = used.get(token) || 0;
    if (req.url === "/rest/v1/rpc/jd_ai_credits") return send(200, { used: n, limit, remaining: Math.max(limit - n, 0), resets_at: RESETS_AT });
    if (req.url === "/rest/v1/rpc/jd_use_ai_credit") {
      if (n >= limit) return send(200, { allowed: false, used: n, limit, remaining: 0, resets_at: RESETS_AT });
      used.set(token, n + 1);
      return send(200, { allowed: true, used: n + 1, limit, remaining: limit - n - 1, resets_at: RESETS_AT });
    }
    send(404, {});
  });
});

// Fake AI: counts calls and returns a rewritten resume / JD analysis. `aiDown` makes it fail like an outage.
let aiCalls = 0;
let aiDown = false;
const fakeAi = http.createServer((req, res) => {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => {
    aiCalls++;
    if (aiDown) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "service unavailable" } })); return; }
    const j = JSON.parse(body || "{}");
    const system: string = j.messages?.[0]?.content || "";
    const user: string = j.messages?.[1]?.content || "";
    let content: string;
    if (system.includes('"tailoredResume"')) {
      const m = user.match(/Candidate's Original Resume:\n([\s\S]*?)\n\nJob Description:/);
      const tailored = m ? JSON.parse(m[1]) : {};
      tailored.summary = "Backend engineer who builds reliable APIs.";
      content = JSON.stringify({ suggestions: [], tailoredResume: tailored });
    } else {
      content = JSON.stringify({ isValidJd: true, invalidReason: "", jobTitle: "Backend Engineer", companyPitch: "",
        requiredSkills: [{ name: "Python", priority: "high" }, { name: "Redis", priority: "high" }, { name: "Kafka", priority: "high" }],
        keyResponsibilities: [], candidateExpectations: [], keywordsToTarget: ["Python"], requiredQualifications: [] });
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});

const listen = (s: http.Server) => new Promise<number>(r => s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)));
const supaPort = await listen(fakeSupabase);
const aiPort = await listen(fakeAi);
const app = await startApp({
  USE_GEMINI: "true", GEMINI_API_KEY: "", GROQ_API_KEY: "fake", NVIDIA_API_KEY: "", GROQ_BASE_URL: `http://127.0.0.1:${aiPort}`,
  VITE_SUPABASE_URL: `http://127.0.0.1:${supaPort}`, VITE_SUPABASE_ANON_KEY: "anon-key", SUPABASE_URL: "", SUPABASE_ANON_KEY: ""
});

const call = async (method: "GET" | "POST", route: string, token?: string, body?: unknown) => {
  const r = await fetch(app.baseUrl + route, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json() as Promise<any>;
};
const structure = {
  fullName: "Priya Sharma", email: "priya@example.com", phone: "+91 98765 43210", summary: "Backend engineer.",
  workExperience: [{ id: "e1", role: "Software Engineer", company: "Flipkart", duration: "2022 - Present", description: ["Built REST APIs in Python"] }],
  education: [], projects: [], skills: ["Python", "Redis"], certifications: [], languages: [], achievements: []
};
const resume = { raw: "", blocks: [{ kind: "header", name: "Priya Sharma", contact: [] }, { kind: "section", label: "Skills", items: [{ kind: "skill", name: "Python" }] }] };
const jdText = "Role: Backend Engineer\nCompany Pitch: \nKeywords: Python, Kafka";
const tailor = (token?: string) => call("POST", "/api/tailor-resume", token, { resume, resumeStructure: structure, jdText, selectedSkills: [] });
const isAi = (r: any) => !!r.tailoredResume && !r.inlineAdditions;

const t = new Checks();

const c0 = await call("GET", "/api/ai-credits", "user-1");
t.check("L1", "Signed-in user starts with 3 of 3", c0.aiEnabled === true && c0.remaining === 3 && c0.limit === 3, JSON.stringify(c0));

const runs = [await tailor("user-1"), await tailor("user-1"), await tailor("user-1")];
t.check("L2", "First 3 tailorings use AI and count down 2, 1, 0",
  runs.every(isAi) && runs.map(r => r.aiUsage?.remaining).join(",") === "2,1,0", JSON.stringify(runs.map(r => r.aiUsage)));

const callsBefore = aiCalls;
const fourth = await tailor("user-1");
t.check("L3", "4th tailoring uses basic mode, says the limit is reached, and doesn't call the AI",
  !isAi(fourth) && fourth.aiUsage?.status === "limit-reached" && fourth.aiUsage?.mode === "rules" && aiCalls === callsBefore,
  JSON.stringify(fourth.aiUsage));
t.check("L4", "It says when AI is back", typeof fourth.aiUsage?.resetsAt === "string");

const jdAfter = await call("POST", "/api/simplify-jd", "user-1", { jdText: "Backend Engineer at Zepto. Requirements: 3+ years with Python, Redis and Kafka. Responsibilities: build REST APIs and microservices that handle millions of orders a day, write clean tested code." });
t.check("L5", "After the limit, reading a job post uses the rules reader (still finds skills)",
  jdAfter.aiUsage?.mode === "rules" && (jdAfter.requiredSkills || []).length > 0 && aiCalls === callsBefore, JSON.stringify(jdAfter.aiUsage));

const g1 = await tailor("guest-1");
const g2 = await tailor("guest-1");
t.check("L6", "Guest gets 1 AI tailoring, then basic mode", isAi(g1) && g1.aiUsage?.limit === 1 && !isAi(g2) && g2.aiUsage?.status === "limit-reached",
  JSON.stringify([g1.aiUsage, g2.aiUsage]));

t.check("L7", "Another user's count is separate", isAi(await tailor("user-2")));

const noToken = await tailor();
t.check("L8", "No sign-in → basic mode, no AI", !isAi(noToken) && noToken.aiUsage?.status === "not-signed-in");
const expired = await tailor("expired");
t.check("L9", "Expired sign-in → basic mode", !isAi(expired) && expired.aiUsage?.status === "not-signed-in");

notSetUp = true;
const before = aiCalls;
const notSet = await tailor("user-1");
t.check("L10", "SQL not run in Supabase yet → AI stays on (app doesn't break)", isAi(notSet) && notSet.aiUsage?.status === "not-set-up" && aiCalls > before,
  JSON.stringify(notSet.aiUsage));
notSetUp = false;

aiDown = true;
const down = await tailor("user-3");
t.check("L11", "Both AIs down → still returns a resume, made without AI", !!down && !down.error && !isAi(down) && down.aiUsage?.status === "ai-unavailable",
  JSON.stringify(down).slice(0, 300));
const downJd = await call("POST", "/api/simplify-jd", "user-3", { jdText: "Backend Engineer at Zepto. Requirements: 3+ years with Python, Redis and Kafka. Responsibilities: build REST APIs and microservices that handle millions of orders a day, write clean tested code." });
t.check("L12", "Both AIs down → job post still read without AI", downJd.isValidJd === true && (downJd.requiredSkills || []).length > 0 && downJd.aiUsage?.status === "ai-unavailable",
  JSON.stringify(downJd).slice(0, 300));
aiDown = false;

await app.close();
fakeSupabase.close();
fakeAi.close();
process.exit(t.report("Daily AI limit"));
