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
