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

export function removeHype(text: string, originalResumeText: string): string {
  if (!text) return text;
  const original = originalResumeText.toLowerCase();
  let out = text;
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

/** Apply removeHype to every line the AI wrote. */
export function plainResumeWording<T extends { summary?: string; workExperience?: any[]; projects?: any[] }>(tailored: T, originalResumeText: string): T {
  const clean = (s: any) => (typeof s === "string" ? removeHype(s, originalResumeText) : s);
  return {
    ...tailored,
    summary: clean(tailored.summary),
    workExperience: (tailored.workExperience || []).map(j => ({ ...j, description: (j.description || []).map(clean) })),
    projects: (tailored.projects || []).map(p => ({ ...p, description: (p.description || []).map(clean) }))
  };
}
