/**
 * Keeps only the skills the job post actually names.
 * The AI sometimes adds guesses ("Amplitude" when the post says "Mixpanel or similar tools").
 */

// Words that say what kind of skill it is, not which one ("Product Analytics" needs "analytics", but "Testing" alone isn't proof)
const KIND_WORDS = new Set("skills skill management testing tools tool methodology methodologies analysis development design".split(" "));

const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
const stem = (w: string) => w.replace(/(ies|es|s)$/, "");

export function skillNamedInJd(skill: string, jdText: string): boolean {
  const jd = norm(jdText);
  const name = norm(skill).trim();
  if (!name) return false;
  if (jd.includes(name)) return true;
  // Same skill without spaces or punctuation: "e commerce" vs "ecommerce"
  if (jd.replace(/\s/g, "").includes(name.replace(/[\s.]/g, ""))) return true;
  const words = name.split(/[\s(),]+/).filter(w => w.length >= 2);
  const telling = words.filter(w => !KIND_WORDS.has(w));
  const check = telling.length ? telling : words;
  const jdWords = new Set((jd.match(/[a-z0-9+#/.]+/g) || []).map(stem));
  // Short names like "A/B" or "SQL" must match a whole word; longer ones may be singular or plural
  // "Roadmapping" is named by "roadmap", "Prioritization" by "prioritise"
  const root = (w: string) => w.replace(/(pping|ing|ed|ation|isation|ization)$/, "");
  return check.some(w => jdWords.has(stem(w)) || (w.length > 3 && jd.includes(w)) || (root(w).length >= 5 && jd.includes(root(w))));
}

export function keepSkillsNamedInJd<T extends { name?: string }>(skills: T[], jdText: string): T[] {
  if (!jdText?.trim()) return skills;
  const kept = skills.filter(s => skillNamedInJd(String(s?.name || ""), jdText));
  // Never empty the list because of an odd job post
  return kept.length ? kept : skills;
}
