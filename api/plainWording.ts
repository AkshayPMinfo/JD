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
  "visionary", "groundbreaking", "state-of-the-art", "detailed", "strategic", "end-to-end",
  // recruiters read these as filler (they want facts): "aspiring product manager" -> "product manager"
  "aspiring", "motivated", "self-motivated", "passionate", "hardworking", "hard-working"
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

const VAGUE_VERBS = ["providing", "enhancing", "improving", "supporting", "enabling", "facilitating", "driving", "boosting",
  "strengthening", "streamlining", "fostering", "increasing", "helping", "resulting in", "leading to"];
const STOP = new Set(["the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "by", "through", "across", "within", "into", "from", "its", "their", "our", "more", "better"]);
const contentWords = (t: string) => words(t).filter(w => w.length > 2 && !STOP.has(w));

/** True when the clause adds nothing from the original line: no number, and at most one of its words appears there. */
function isVague(clause: string, originalLine: string): boolean {
  if (/\d/.test(clause)) return false; // a number is a result claim; the review warning handles it
  const orig = new Set(contentWords(originalLine));
  const found = contentWords(clause).filter(w => orig.has(w)).length;
  return found <= 1;
}

export function dropVagueTail(text: string, originalLine: string): string {
  if (!originalLine.trim()) return text;
  const end = originalLine.trim().endsWith(".") ? "." : "";
  let out = text.trim();
  // ", providing data for analysis."
  const ing = out.match(new RegExp(`,\\s*(${VAGUE_VERBS.map(esc).join("|")})\\b([^,;]*?)[.]?$`, "i"));
  if (ing && !originalLine.toLowerCase().includes(ing[1].toLowerCase()) && isVague(ing[2], originalLine)) {
    out = out.slice(0, ing.index).trim() + end;
  }
  // " for the customer ordering experience." / " in the mobile application."
  const tail = out.match(/\s+(for|in|within|across|on) (the|a|an) ((?:[\w-]+\s+){0,3}(?:experience|application|platform|product|app))[.]?$/i);
  if (tail && isVague(tail[3], originalLine) && !originalLine.toLowerCase().includes(tail[0].trim().toLowerCase().replace(/[.]$/, ""))) {
    out = out.slice(0, tail.index).trim() + end;
  }
  return out;
}

/** "app" stays "app": undo the AI's switch to "application" / "mobile application" when your line said app. */
export function keepAppWord(text: string, originalLine: string): string {
  if (!/\bapps?\b/i.test(originalLine) || /\bapplication/i.test(originalLine)) return text;
  const mobile = /\bmobile\b/i.test(originalLine);
  return text
    .replace(/\bmobile (application)(s?)\b/gi, (_m, _a, pl) => (mobile ? "mobile app" : "app") + pl)
    .replace(/\bapplication(s?)\b/gi, (_m, pl) => "app" + pl);
}

/** Drop filler endings the AI tacks on, unless the candidate's own line already had that wording. */
export function dropFillerEnding(text: string, originalLine: string): string {
  const orig = originalLine.toLowerCase();
  let out = text;
  for (const start of FILLER_STARTS) {
    if (orig.includes(start)) continue;
    // ", demonstrating ... ." at the end of the line
    out = out.replace(new RegExp(`,\\s*${esc(start)}\\b[^,;]*[.]?\\s*$`, "i"), originalLine.trim().endsWith(".") ? "." : "");
  }
  // Vague add-ons like ", providing data for analysis" or "for the customer ordering experience":
  // dropped when they bring in words your own line never had (real details like "code reviews" stay)
  out = dropVagueTail(out, originalLine);
  // "the job's" / "this role's" never belongs in a resume line
  if (/\b(the|this) (job|role|position)('s)?\b/i.test(out) && !/\b(the|this) (job|role|position)/i.test(orig)) {
    out = out.replace(/,?\s*[^,]*\b(the|this) (job|role|position)('s)?\b[^,.]*/i, "");
  }
  out = out.replace(/\s+([.,])/g, "$1").replace(/,\s*\./g, ".").trim();
  // a cut line keeps its sentence ending like the original
  if (originalLine.trim().endsWith(".") && !/[.!?]$/.test(out)) out += ".";
  return out;
}

// Capitalised words that aren't names: sentence starters and everyday words
const NOT_NAMES = new Set(["i", "a", "an", "the", "and", "or", "for", "with", "in", "on", "at", "to", "of", "by",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);

/** Names (Facebook, Figma, LinkedIn) and numbers (12%, 300) in a line, skipping the first word. */
function namedDetails(line: string): string[] {
  const out: string[] = [];
  const tokens = line.match(/[A-Za-z][\w.+#&'-]*|\d[\d,.]*%?/g) || [];
  tokens.forEach((tok, i) => {
    const t = tok.replace(/[.,']+$/, "");
    if (/^\d/.test(t)) out.push(t);
    else if (i > 0 && /[A-Z]/.test(t) && !NOT_NAMES.has(t.toLowerCase())) out.push(t);
  });
  return out;
}

/** If the rewrite drops a name or number your line had ("Facebook, Instagram" -> "social media platforms"), keep your line. */
export function keepNamedDetails(text: string, originalLine: string): string {
  if (!originalLine.trim() || !text) return text;
  const lower = text.toLowerCase();
  const lost = namedDetails(originalLine).filter(d => !lower.includes(d.toLowerCase()));
  return lost.length ? originalLine : text;
}

// "boost revenue", "increase customer footfall", "reduced costs": the thing that changed is the result
const RESULT_VERB = /\b(?:increas\w*|boost\w*|grow\w*|grew|reduc\w*|improv\w*|rais\w*|cut(?:ting)?|sav(?:e|ed|ing)|drove|driv\w*|lower\w*)\s+(?:the\s+|a\s+|an\s+)?(?:customer\s+|brand\s+|online\s+|repeat\s+)?([a-z][a-z-]{2,})/gi;
const NOT_RESULT = new Set(["and", "the", "by", "to", "for", "with", "across", "while", "from", "our", "their", "its", "more", "overall"]);

/** If the rewrite drops a result your line had ("and boost revenue"), keep your line. */
export function keepResults(text: string, originalLine: string): string {
  if (!originalLine.trim() || !text) return text;
  const lower = text.toLowerCase();
  const results = [...originalLine.matchAll(RESULT_VERB)].map(m => m[1].toLowerCase()).filter(w => !NOT_RESULT.has(w));
  const lost = results.filter(w => !lower.includes(w.replace(/s$/, "")));
  return lost.length ? originalLine : text;
}

// Vague filler a recruiter skips: "Possesses foundational understanding of Fintech contexts"
const WEAK_SENTENCE = /\b(possess(es)?|foundational understanding|basic understanding|working knowledge|exposure to|familiarity with|well-versed|keen interest|eager to|passionate about)\b/i;

/** Drop summary sentences that only claim vague understanding; keep the factual ones. */
export function dropWeakSentences(summary: string, originalSummary = ""): string {
  if (!summary) return summary;
  // split only where a full stop is followed by a space, so "1.8 years" stays whole
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter(sn => !WEAK_SENTENCE.test(sn) || WEAK_SENTENCE.test(originalSummary));
  return (kept.length ? kept : sentences).join(" ").replace(/\s{2,}/g, " ").trim();
}

/** "engagement ." -> "engagement." and "teams ,and" -> "teams, and" */
export function tidySpacing(text: string): string {
  if (typeof text !== "string") return text;
  return text.replace(/\s+([.,;:!?])/g, "$1").replace(/([,;:])(?=[A-Za-z])/g, "$1 ").replace(/\s{2,}/g, " ").trim();
}

/** Clean every line the AI wrote, comparing each with the candidate's own line where there is one. */
export function plainResumeWording<T extends { summary?: string; workExperience?: any[]; projects?: any[] }>(tailored: T, source: any): T {
  const originalResumeText = JSON.stringify(source || {});
  const clean = (s: any, originalLine = "") => {
    if (typeof s !== "string") return s;
    const plain = dropFillerEnding(keepAppWord(keepDigits(removeHype(s, originalResumeText), originalLine), originalLine), originalLine);
    return tidySpacing(keepResults(keepNamedDetails(undoPointlessChange(plain, originalLine), originalLine), originalLine));
  };
  const match = (list: any[] = [], item: any, i: number) => list.find(x => x?.id && x.id === item?.id) || list[i];
  return {
    ...tailored,
    summary: dropWeakSentences(clean(tailored.summary, source?.summary || ""), source?.summary || ""),
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
