/**
 * Quick checks on the final resume, based on common recruiter advice:
 * one page, bullets of 1–2 lines, 5–6 / 4 / 3 bullets per job (newest first),
 * and a short summary without "I", "aspiring" or "motivated".
 * They only point things out; nothing is changed automatically.
 */
import type { ResumeStructure } from "../types";

export type ResumeCheck = { id: string; ok: boolean; label: string; detail?: string };

// About 2 lines of a bullet on an A4 page at 10 pt
export const MAX_BULLET_CHARS = 210;
// About 4 lines of summary
export const MAX_SUMMARY_CHARS = 420;
// Newest job, the one before, then every older job
export const BULLET_LIMITS = [6, 4, 3];

// Words to drop (any case), and first-person words (exact case, so "Indian" or "API" never match "I")
const WEAK_WORDS = /\b(aspiring|motivated|self-motivated|passionate|hard-?working|committed to)\b/gi;
const FIRST_PERSON = /\b(I am|I'm|I have|I|me|my)\b/g;

export function weakWordsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of (text || "").matchAll(WEAK_WORDS)) found.add(m[1].toLowerCase());
  for (const m of (text || "").matchAll(FIRST_PERSON)) found.add(m[1]);
  return [...found];
}

export function checkResume(resume: ResumeStructure, pages: number): ResumeCheck[] {
  const checks: ResumeCheck[] = [];
  const jobs = (resume.workExperience || []).filter(j => j.role || j.company || j.description?.length);

  checks.push(pages <= 1
    ? { id: "one-page", ok: true, label: "Fits on one page" }
    : { id: "one-page", ok: false, label: `Runs to ${pages} pages`, detail: "Recruiters prefer one page unless you have 10+ years of experience. Trim older jobs to 1–2 bullets." });

  const allBullets = [...jobs.flatMap(j => j.description || []), ...(resume.projects || []).flatMap(p => p.description || [])];
  const long = allBullets.filter(b => (b || "").trim().length > MAX_BULLET_CHARS);
  checks.push(long.length
    ? { id: "bullet-length", ok: false, label: `${long.length} bullet${long.length > 1 ? "s are" : " is"} longer than 2 lines`, detail: `Keep each bullet to 1–2 lines. Starts with: "${long[0].trim().slice(0, 60)}…"` }
    : { id: "bullet-length", ok: true, label: "Every bullet is 1–2 lines" });

  const tooMany = jobs
    .map((j, i) => ({ name: j.company || j.role || `Job ${i + 1}`, count: (j.description || []).filter(Boolean).length, limit: BULLET_LIMITS[Math.min(i, BULLET_LIMITS.length - 1)] }))
    .filter(j => j.count > j.limit);
  checks.push(tooMany.length
    ? { id: "bullet-count", ok: false, label: "Too many bullets for some jobs", detail: tooMany.map(j => `${j.name}: ${j.count} (aim for ${j.limit} or fewer)`).join(" · ") + ". Newest job 5–6, the one before 4, older ones 3." }
    : { id: "bullet-count", ok: true, label: "Bullets per job look right (5–6, 4, 3)" });

  const summary = (resume.summary || "").trim();
  const weak = weakWordsIn([summary, ...allBullets].join(" \n "));
  const summaryLong = summary.length > MAX_SUMMARY_CHARS;
  checks.push(!summaryLong && !weak.length
    ? { id: "summary", ok: true, label: summary ? "Summary is short and factual" : "No \"I\", \"aspiring\" or \"motivated\"" }
    : {
        id: "summary",
        ok: false,
        label: summaryLong ? "Summary is longer than 4 lines" : `Uses ${weak.map(w => `"${w}"`).join(", ")}`,
        detail: [summaryLong ? "Keep the summary to 2–4 lines: years of experience, domain and main skills." : "", weak.length ? `Drop ${weak.map(w => `"${w}"`).join(", ")}: recruiters want facts, and "I" isn't used on resumes.` : ""].filter(Boolean).join(" ")
      });

  return checks;
}
