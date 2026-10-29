/**
 * Resumes list education newest first. Uploaded resumes are often oldest first
 * (10th, 12th, then the degree), so sort by the latest year in each entry's dates.
 * Entries without a year keep their place after the dated ones.
 */
export function latestYear(duration?: string): number {
  const text = String(duration || "");
  if (/\b(present|current|ongoing|pursuing|now)\b/i.test(text)) return 9999;
  const years = (text.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  return years.length ? Math.max(...years) : -1;
}

export function educationNewestFirst<T extends { duration?: string }>(list: T[] = []): T[] {
  return list
    .map((item, index) => ({ item, index, year: latestYear(item.duration) }))
    .sort((a, b) => (b.year - a.year) || (a.index - b.index))
    .map(x => x.item);
}

/**
 * Education goes above Experience only for recent graduates (finished this year or last year,
 * or still studying) and people with no work experience yet. Everyone else: Experience first.
 */
export function educationGoesFirst(
  resume: { education?: { duration?: string }[]; workExperience?: { role?: string; company?: string; description?: string[] }[] },
  now: Date = new Date()
): boolean {
  const education = resume.education || [];
  if (!education.length) return false;
  const jobs = (resume.workExperience || []).filter(j => j.role || j.company || j.description?.length);
  if (!jobs.length) return true;
  const newest = Math.max(...education.map(e => latestYear(e.duration)));
  if (newest === 9999) return true; // still studying
  return newest >= now.getFullYear() - 1;
}
