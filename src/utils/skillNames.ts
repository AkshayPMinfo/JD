/**
 * Turns messy skill phrases (often from AI) into clean, searchable skill names:
 *   "Tableau (or similar data-visualization tool)" -> ["Tableau"]
 *   "Mixpanel or Amplitude"                         -> ["Mixpanel", "Amplitude"]
 *   "Applicant Tracking System (e.g., Greenhouse)"  -> ["Applicant Tracking System", "Greenhouse"]
 *   "SAP familiarity"                               -> ["SAP"]
 *   "Content Marketing/HubSpot"                     -> ["Content Marketing", "HubSpot"]
 */

// Slash names that are one skill, not alternatives
const KEEP_SLASH = new Set(["ci/cd", "a/b testing", "a/b test", "ui/ux", "ux/ui", "tcp/ip", "pl/sql", "i/o", "b2b/b2c", "p&l"]);
const GENERIC = /\b(similar|tools?|platforms?|etc|equivalent|other|any|software|systems?)\b/i;

function tidy(s: string): string {
  return s
    .replace(/^(hands[- ]on( experience)?( with| in)?|working knowledge of|knowledge of|familiarity with|experience (with|in)|proficiency (with|in)|expertise in|strong|basic|advanced)\s+/i, "")
    .replace(/\s+(familiarity|experience|knowledge|proficiency|skills?|basics|expertise)$/i, "")
    .replace(/\s+or similar.*$/i, "")
    .replace(/,?\s*e\.g\.?.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "")
    .trim();
}

function splitAlternatives(s: string): string[] {
  if (KEEP_SLASH.has(s.toLowerCase())) return [s];
  const parts = s.split(/\s+or\s+|\s*,\s*/i);
  return parts.flatMap(part => {
    if (KEEP_SLASH.has(part.toLowerCase()) || !part.includes("/")) return [part];
    const sides = part.split("/").map(x => x.trim());
    return sides.every(x => x.length >= 3) ? sides : [part];
  });
}

export function cleanSkillName(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const out: string[] = [];
  // Examples in brackets become their own skills; vague brackets are dropped
  const bracket = text.match(/\(([^)]*)\)/);
  const main = text.replace(/\s*\([^)]*\)/g, " ");
  out.push(...splitAlternatives(tidy(main)));
  if (bracket) {
    const inner = bracket[1].replace(/^(e\.g\.?,?|such as|like|including|ie\.?,?|i\.e\.?,?)\s*/i, "");
    // Keep only names (Greenhouse, WCAG), not lowercase descriptions like "product analytics"
    const items = splitAlternatives(tidy(inner)).filter(x => x && /^[A-Z0-9]/.test(x) && !GENERIC.test(x) && x.split(" ").length <= 3);
    out.push(...items);
  }
  const seen = new Set<string>();
  return out.map(tidy).filter(x => {
    const key = x.toLowerCase();
    if (!x || x.length > 40 || x.split(" ").length > 4 || GENERIC.test(x) && x.split(" ").length > 1 && /\b(similar|any|other|etc)\b/i.test(x) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
