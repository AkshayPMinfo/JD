import { diffWords } from 'diff';

export function findBestMatch(target: string, candidates: string[]): { match: string | null, similarity: number } {
  if (!candidates || candidates.length === 0) return { match: null, similarity: 0 };
  
  let bestMatch = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const changes = diffWords(candidate, target);
    let unchangedChars = 0;
    let totalChars = 0;
    
    for (const part of changes) {
      if (!part.added && !part.removed) {
        unchangedChars += part.value.length;
      }
      if (!part.removed) {
        totalChars += part.value.length;
      }
    }
    
    const score = totalChars === 0 ? 0 : unchangedChars / totalChars;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return { match: bestMatch, similarity: bestScore };
}
