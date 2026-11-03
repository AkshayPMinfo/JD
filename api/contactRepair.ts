/**
 * Some PDFs wrap a long email onto the next line, so the parser reads
 * "Akshay Anand om" as the name and "name@gmail.c" as the email.
 * Move that stray piece back onto the email.
 */
const TLD_END = /\.(com|in|org|net|io|co|me|ai|dev|edu|info|us|uk|co\.in|co\.uk)$/i;

export function repairSplitEmail<T extends { fullName?: string; email?: string }>(resume: T): T {
  const name = (resume.fullName || "").trim();
  // "name@gmail.c om": a PDF line break left a space inside the email
  const joined = (resume.email || "").replace(/\s+/g, "");
  if (joined !== (resume.email || "").trim() && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(joined)) resume = { ...resume, email: joined };
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

const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+\/?/i;
const PROFILE_SITE = /(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com)\/[A-Za-z0-9_.-]+\/?|https?:\/\/[A-Za-z0-9.-]+\.[a-z]{2,}(?:\/[^\s|,;)]*)?/i;

/**
 * The parser sometimes leaves out the LinkedIn, GitHub/portfolio link or city that sit in the
 * contact line. Fill any that are empty straight from the resume's own text (never invented).
 */
export function fillContactFromText<T extends { email?: string; linkedin?: string; website?: string; location?: string }>(resume: T, text: string): T & { linkedin?: string; website?: string; location?: string } {
  if (!resume || !text) return resume;
  const out: any = { ...resume };
  if (!String(out.linkedin || "").trim()) {
    const m = text.match(LINKEDIN);
    if (m) out.linkedin = m[0].replace(/\/$/, "");
  }
  if (!String(out.website || "").trim()) {
    const m = text.replace(LINKEDIN, " ").match(PROFILE_SITE);
    if (m) out.website = m[0].replace(/\/$/, "");
  }
  if (!String(out.location || "").trim() && out.email) {
    // The contact line: "Pune, India | name@example.com | +91 ..." -> "Pune, India"
    const line = text.split("\n").find(l => l.includes(out.email));
    const part = line?.split(/\s*[|•·]\s*/).map(p => p.trim())
      .find(p => p && !p.includes("@") && !/\d{3}|\.com|\.in\b|https?:|www\.|\/\w/i.test(p) && /^[A-Za-z][A-Za-z .,'-]{1,40}$/.test(p));
    if (part) out.location = part;
  }
  return out;
}
