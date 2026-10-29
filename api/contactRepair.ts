/**
 * Some PDFs wrap a long email onto the next line, so the parser reads
 * "Akshay Anand om" as the name and "name@gmail.c" as the email.
 * Move that stray piece back onto the email.
 */
const TLD_END = /\.(com|in|org|net|io|co|me|ai|dev|edu|info|us|uk|co\.in|co\.uk)$/i;

export function repairSplitEmail<T extends { fullName?: string; email?: string }>(resume: T): T {
  const name = (resume.fullName || "").trim();
  const email = (resume.email || "").trim();
  if (!name || !email || !email.includes("@") || TLD_END.test(email)) return resume;
  const parts = name.split(/\s+/);
  const last = parts[parts.length - 1];
  // Real name parts are capitalised; a short lowercase piece is the email's lost ending
  if (parts.length < 2 || !/^[a-z]{1,4}$/.test(last)) return resume;
  const fixed = email + last;
  if (!TLD_END.test(fixed)) return resume;
  return { ...resume, fullName: parts.slice(0, -1).join(" "), email: fixed };
}
