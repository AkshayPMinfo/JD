/**
 * Resume checks on the final step: one page, bullet length, bullets per job, summary wording.
 * Run: npx tsx tests/api/resumeChecks.test.ts
 */
import { Checks } from "./helpers.ts";
import { checkResume, weakWordsIn } from "../../src/utils/resumeChecks.ts";
import { educationGoesFirst } from "../../src/utils/educationOrder.ts";

const t = new Checks();
const job = (n: number, extra = "") => ({ id: "j", role: "PM", company: `Co${n}`, duration: "2022 - 2024", description: Array.from({ length: n }, (_, i) => `Did task ${i}${extra}`) });
const base: any = { fullName: "A", email: "", phone: "", summary: "PM with 3 years in fintech.", skills: [], workExperience: [job(5), job(4), job(3)], education: [], projects: [], certifications: [], languages: [], achievements: [] };
const byId = (r: any[], id: string) => r.find(c => c.id === id);

let r = checkResume(base, 1);
t.check("C1", "A tidy one-page resume passes every check", r.every(c => c.ok));
t.check("C2", "Two pages is flagged", !byId(checkResume(base, 2), "one-page").ok);
r = checkResume({ ...base, workExperience: [job(1, " ".repeat(5) + "x".repeat(220))] }, 1);
t.check("C3", "A bullet over 2 lines is flagged", !byId(r, "bullet-length").ok);
r = checkResume({ ...base, workExperience: [job(7), job(5), job(4)] }, 1);
const count = byId(r, "bullet-count");
t.check("C4", `7 / 5 / 4 bullets flagged for all three jobs → ${count.detail}`, !count.ok && /Co7: 7/.test(count.detail) && /Co5: 5/.test(count.detail) && /Co4: 4/.test(count.detail));
r = checkResume({ ...base, workExperience: [job(6), job(4), job(3), job(3)] }, 1);
t.check("C5", "6 / 4 / 3 / 3 is fine", byId(r, "bullet-count").ok);
r = checkResume({ ...base, summary: "Aspiring product manager. I am motivated and passionate." }, 1);
t.check("C6", `Weak words in the summary are named → ${byId(r, "summary").label}`, !byId(r, "summary").ok && /aspiring/.test(byId(r, "summary").label));
t.check("C7", "'Indian' or 'API' are not mistaken for 'I'", weakWordsIn("Built APIs for Indian users").length === 0);
r = checkResume({ ...base, summary: "x ".repeat(260) }, 1);
t.check("C8", "A summary over 4 lines is flagged", !byId(r, "summary").ok);

const now = new Date("2026-10-29");
t.check("E1", "Graduated 2025 with one job → Education first", educationGoesFirst({ education: [{ duration: "2021 - 2025" }], workExperience: [job(3)] }, now));
t.check("E2", "Graduated 2023 → Experience first", !educationGoesFirst({ education: [{ duration: "2019 - 2023" }], workExperience: [job(3)] }, now));
t.check("E3", "No work experience → Education first", educationGoesFirst({ education: [{ duration: "2018 - 2022" }], workExperience: [] }, now));
t.check("E4", "Still studying → Education first", educationGoesFirst({ education: [{ duration: "2024 - Present" }], workExperience: [job(2)] }, now));
t.check("E5", "No education → nothing to move", !educationGoesFirst({ education: [], workExperience: [] }, now));
process.exit(t.report("Resume checks"));
