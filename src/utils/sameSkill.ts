/**
 * Job-post words that mean the same as something the resume already says.
 * "PRD" isn't a new claim when the resume says "product requirements".
 */
const SAME_AS: { words: RegExp; backedBy: RegExp }[] = [
  { words: /^prds?$|product requirements? doc/, backedBy: /product requirement|requirements doc|\bprds?\b|\bspecs?\b/ },
  { words: /a\/b|split test|experiment/, backedBy: /a\/b|experiment|split test/ },
  { words: /^agile$|^scrum$|sprint/, backedBy: /\bsprints?\b|\bscrum\b|\bagile\b/ },
  { words: /user research|customer interview|customer discovery|usability/, backedBy: /interview|user research|usability|survey/ },
  { words: /data analys|analytics/, backedBy: /dashboard|analy[sz]|report|excel|sql/ },
  { words: /cross[- ]functional/, backedBy: /cross[- ]functional|engineers? and designers?|engineering and design|product and sales/ },
  { words: /stakeholder/, backedBy: /stakeholder|sales teams?|product and sales/ },
  { words: /backlog/, backedBy: /backlog|sprint planning/ },
  { words: /user stor/, backedBy: /user stor/ }
];

export function backedBy(originalText: string, word: string): boolean {
  const w = word.toLowerCase().trim();
  const text = originalText.toLowerCase();
  return SAME_AS.some(s => s.words.test(w) && s.backedBy.test(text));
}
