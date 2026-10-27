/**
 * Removes puffy words the AI adds on its own ("significantly increased", "meticulously crafted").
 * A word is only removed when the candidate's original resume never used it, so their own
 * wording is never touched.
 */
const HYPE_ADVERBS = [
  "significantly", "substantially", "dramatically", "demonstrably", "drastically", "greatly",
  "meticulously", "seamlessly", "strategically", "successfully", "effectively", "efficiently",
  "consistently", "proactively", "exceptionally", "remarkably", "tremendously", "highly",
  "closely", "actively", "rapidly", "skillfully", "expertly", "masterfully", "diligently"
];
const HYPE_ADJECTIVES = [
  "comprehensive", "innovative", "cutting-edge", "world-class", "best-in-class", "robust",
  "dynamic", "impactful", "high-impact", "exceptional", "outstanding", "results-driven",
  "visionary", "groundbreaking", "state-of-the-art", "detailed", "strategic", "end-to-end"
];
// Fancy verbs swapped back to plain ones
const PLAIN_VERBS: Record<string, string> = {
  orchestrated: "managed", spearheaded: "led", leveraged: "used", leveraging: "using",
  utilized: "used", utilizing: "using", championed: "led", architected: "designed",
  crafted: "created", synergized: "worked", revolutionized: "improved", pioneered: "started"
};

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^a-z-])${esc(w)}(?=[^a-z-]|$)`, "i");

const keepCase = (from: string, to: string) => (from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);

/**
 * Some models write numbers with special spaces and hyphens ("35 %", "1 000", "2 M", "order‑tracking").
 * Put them back the normal way so numbers match the original resume.
 */
export function normalizeTypography(text: string): string {
  return text
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/(\d)[\u00a0\u202f\u2009 ]%/g, "$1%")
    .replace(/(\d)[\u00a0\u202f\u2009](\d{3})(?!\d)/g, "$1,$2")
    .replace(/(\d)[\u00a0\u202f\u2009]([KMB])\b/g, "$1$2")
    .replace(/[\u00a0\u202f\u2009]/g, " ");
}

export function removeHype(text: string, originalResumeText: string): string {
  if (!text) return text;
  const original = originalResumeText.toLowerCase();
  let out = normalizeTypography(text);
  for (const w of [...HYPE_ADVERBS, ...HYPE_ADJECTIVES]) {
    if (wordRe(w).test(original)) continue;
    // "significantly increased" -> "increased"; "a comprehensive plan" -> "a plan"; "an innovative app" -> "an app"
    out = out.replace(
      new RegExp(`(^|[^a-z-])(?:(a|an)\\s+)?(${esc(w)}),?\\s+([a-z])`, "gi"),
      (_m, pre: string, article: string | undefined, word: string, next: string) => {
        const nextOut = word[0] === word[0].toUpperCase() && !article ? next.toUpperCase() : next;
        if (!article) return pre + nextOut;
        const an = /[aeiou]/i.test(next) ? "an" : "a";
        return pre + keepCase(article, an) + " " + nextOut;
      }
    );
  }
  for (const [fancy, plain] of Object.entries(PLAIN_VERBS)) {
    if (wordRe(fancy).test(original)) continue;
    out = out.replace(new RegExp(`(^|[^a-z-])(${esc(fancy)})(?=[^a-z-]|$)`, "gi"), (_, pre, word) => pre + keepCase(word, plain));
  }
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** "Mentored three engineers" -> "Mentored 3 engineers" when the original line wrote 3. Recruiters scan for digits. */
export function keepDigits(text: string, originalLine: string): string {
  let out = text;
  NUMBER_WORDS.forEach((word, n) => {
    const digitInOriginal = new RegExp(`(^|[^\\d.,])${n}(?![\\d.,]?\\d)`).test(originalLine);
    if (!digitInOriginal || wordRe(word).test(originalLine)) return;
    out = out.replace(new RegExp(`(^|[^a-z-])${word}(?=[^a-z-]|$)`, "gi"), (_m, pre) => pre + String(n));
  });
  return out;
}

// Opening verbs that mean the same thing; swapping one for another adds nothing
const SAME_VERBS = [
  ["built", "developed", "created", "made"],
  ["used", "utilized", "utilised", "leveraged", "employed", "applied"],
  ["wrote", "authored", "drafted", "crafted"],
  ["helped", "assisted", "supported", "aided"],
  ["worked", "collaborated", "partnered", "teamed"],
  ["ran", "conducted", "carried", "performed", "executed"],
  ["managed", "handled", "oversaw", "looked"]
];
const sameVerb = (a: string, b: string) => SAME_VERBS.some(g => g.includes(a) && g.includes(b));
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9%₹$ ]+/g, " ").split(/\s+/).filter(Boolean);

/** Undo rewrites that change nothing real: only punctuation or case, or only the opening verb to a same-meaning one. */
export function undoPointlessChange(text: string, originalLine: string): string {
  if (!originalLine.trim()) return text;
  const a = words(text), b = words(originalLine);
  if (a.join(" ") === b.join(" ")) return originalLine;
  if (a.length === b.length && a.slice(1).join(" ") === b.slice(1).join(" ") && sameVerb(a[0], b[0])) return originalLine;
  return text;
}

// Trailing clauses that only talk about the job or sound like a cover letter, e.g.
// ", demonstrating capability in X" or ", aligning with the job's mentoring responsibility"
const FILLER_STARTS = ["demonstrating", "showcasing", "highlighting", "aligning with", "in alignment with", "in line with",
  "reflecting", "underscoring", "illustrating", "exemplifying", "contributing to", "ensuring", "for performance optimization",
  "to enhance code quality and", "relevant to", "as required by", "matching the"];

/** Drop filler endings the AI tacks on, unless the candidate's own line already had that wording. */
export function dropFillerEnding(text: string, originalLine: string): string {
  const orig = originalLine.toLowerCase();
  let out = text;
  for (const start of FILLER_STARTS) {
    if (orig.includes(start)) continue;
    // ", demonstrating ... ." at the end of the line
    out = out.replace(new RegExp(`,\\s*${esc(start)}\\b[^,;]*[.]?\\s*$`, "i"), originalLine.trim().endsWith(".") ? "." : "");
  }
  // "the job's" / "this role's" never belongs in a resume line
  if (/\b(the|this) (job|role|position)('s)?\b/i.test(out) && !/\b(the|this) (job|role|position)/i.test(orig)) {
    out = out.replace(/,?\s*[^,]*\b(the|this) (job|role|position)('s)?\b[^,.]*/i, "");
  }
  out = out.replace(/\s+([.,])/g, "$1").replace(/,\s*\./g, ".").trim();
  // a cut line keeps its sentence ending like the original
  if (originalLine.trim().endsWith(".") && !/[.!?]$/.test(out)) out += ".";
  return out;
}

/** Clean every line the AI wrote, comparing each with the candidate's own line where there is one. */
export function plainResumeWording<T extends { summary?: string; workExperience?: any[]; projects?: any[] }>(tailored: T, source: any): T {
  const originalResumeText = JSON.stringify(source || {});
  const clean = (s: any, originalLine = "") => {
    if (typeof s !== "string") return s;
    const plain = dropFillerEnding(keepDigits(removeHype(s, originalResumeText), originalLine), originalLine);
    return undoPointlessChange(plain, originalLine);
  };
  const match = (list: any[] = [], item: any, i: number) => list.find(x => x?.id && x.id === item?.id) || list[i];
  return {
    ...tailored,
    summary: clean(tailored.summary, source?.summary || ""),
    workExperience: (tailored.workExperience || []).map((j, i) => {
      const orig = match(source?.workExperience, j, i);
      return { ...j, description: (j.description || []).map((d: any, k: number) => clean(d, orig?.description?.[k] || "")) };
    }),
    projects: (tailored.projects || []).map((p, i) => {
      const orig = match(source?.projects, p, i);
      return { ...p, description: (p.description || []).map((d: any, k: number) => clean(d, orig?.description?.[k] || "")) };
    })
  };
}
