import { diffArrays } from "diff";

export interface WordPart { text: string; changed: boolean }

/** A word without case or ending punctuation, so "needs." and "Needs" count as the same */
const bare = (w: string) => w.toLowerCase().replace(/[.,;:!?]+$/, "");

/**
 * Splits the new line into parts, marking the words that are new compared with the old line.
 * Works on whole words, so "cross functional" → "cross-functional" marks the whole word, not just the hyphen.
 * Removed words are left out.
 */
export function wordChanges(before: string, after: string): WordPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const parts = diffArrays(a, b, { comparator: (x, y) => bare(x) === bare(y) })
    .filter(part => !part.removed)
    .map(part => {
      const text = part.value.join("");
      // A lone "the" or "a" isn't worth highlighting
      const onlySmallWord = /^\s*(a|an|the|to|of|for|and|in|on|with|at|by)\s*$/i.test(text);
      return { text, changed: !!part.added && /\S/.test(text) && !onlySmallWord };
    });
  // Join neighbours with the same state, and a lone space between two changes, into one block
  const joined: WordPart[] = [];
  parts.forEach((p, i) => {
    const bridge = !p.changed && !/\S/.test(p.text) && parts[i - 1]?.changed && parts[i + 1]?.changed;
    const changed = p.changed || !!bridge;
    const last = joined[joined.length - 1];
    if (last && last.changed === changed) last.text += p.text;
    else joined.push({ text: p.text, changed });
  });
  return joined;
}
