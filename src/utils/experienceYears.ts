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
