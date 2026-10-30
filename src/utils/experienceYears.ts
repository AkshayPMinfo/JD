const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "January, 2023" -> months since year 0; "Present" -> now. Missing month counts as January (start) or December (end). */
function toMonth(part: string, isEnd: boolean, now: Date): number | null {
  if (/\b(present|current|now|ongoing|till date|today)\b/i.test(part)) return now.getFullYear() * 12 + now.getMonth();
  const year = part.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;
  const m = MONTHS.findIndex(name => new RegExp(`\\b${name}`, "i").test(part));
  return Number(year[0]) * 12 + (m >= 0 ? m : isEnd ? 11 : 0);
}

/** Total years of work from job dates like "January, 2023 - October, 2024"; overlapping jobs count once. */
export function yearsOfExperience(jobs: { duration?: string }[] = [], now: Date = new Date()): number {
  const spans: [number, number][] = [];
  for (const job of jobs) {
    const [from, to] = String(job.duration || "").split(/\s+(?:-|–|—|to)\s+/i);
    if (!from) continue;
    const start = toMonth(from, false, now);
    const end = to ? toMonth(to, true, now) : start;
    if (start !== null && end !== null && end >= start) spans.push([start, end + 1]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0, curStart = -1, curEnd = -1;
  for (const [s, e] of spans) {
    if (s > curEnd) { months += curEnd - curStart; curStart = s; curEnd = e; }
    else curEnd = Math.max(curEnd, e);
  }
  months += curEnd - curStart;
  return Math.round((months / 12) * 10) / 10;
}

/** Years in one job, e.g. "January, 2023 - October, 2024" -> 1.8 */
export function yearsInJob(duration?: string, now: Date = new Date()): number {
  return yearsOfExperience([{ duration }], now);
}

/**
 * Puts the right numbers into a summary from the job dates:
 * "N years of experience" → total years, "about N years as [title]" → years in that job.
 * The AI sometimes gets these wrong, so they are never left to it.
 */
export function fixSummaryYears(summary: string, jobs: { role?: string; duration?: string }[] = [], now: Date = new Date()): string {
  if (!summary) return summary;
  let out = summary;
  const total = Math.floor(yearsOfExperience(jobs, now));
  if (total >= 1) {
    out = out.replace(/\b(\d+)(\+?)(\s+years?\s+of\s+(?:professional\s+|work\s+)?experience)/i,
      (_m, _n, plus, rest) => `${total}${plus}${rest.replace(/years?/i, total === 1 ? "year" : "years")}`);
  }
  out = out.replace(/\b((?:about|over|nearly|around|almost)\s+)?(\d+)\+?\s+(years?)\s+as\s+(an?\s+)?([A-Za-z][\w\s/&-]{2,60}?)(?=[.,;]|\s+(?:at|in|with|and)\b|$)/gi,
    (match, about = "", _n, _unit, article = "", title) => {
      const job = jobs.find(j => j.role && j.role.toLowerCase().trim() === title.toLowerCase().trim())
        || jobs.find(j => j.role && title.toLowerCase().includes(j.role.toLowerCase().trim()));
      if (!job) return match;
      const n = Math.max(1, Math.round(yearsInJob(job.duration, now)));
      return `${about}${n} ${n === 1 ? "year" : "years"} as ${article}${title}`;
    });
  return out;
}
