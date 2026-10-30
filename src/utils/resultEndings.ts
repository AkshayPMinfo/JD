// Ready-made endings that add a real result to a resume line; the user types only the number.
// Picked from the line's own words so they fit ("budget" -> "worth ₹__").
const RESULT_ENDINGS: { words: RegExp; endings: string[] }[] = [
  // most specific first, so the best-fitting ending is the first chip
  { words: /\b(budgets?|costs?|spend|revenue)\b/i, endings: ["worth ₹__", "cutting costs by __%"] },
  { words: /\binterview|\bsurvey|usability/i, endings: ["across __ interviews", "with __ customers"] },
  { words: /\breports?\b|\bdashboards?\b/i, endings: ["for __ stakeholders", "saving __ hours a week"] },
  { words: /\bresearch|analysis|analy[sz]ed|competitor|market\b/i, endings: ["covering __ competitors", "across __ markets"] },
  { words: /\bcampaign|marketing|social|content|brand|engagement|posts?|reels?|followers/i, endings: ["reaching __ people", "growing engagement by __%"] },
  { words: /\bteams?\b|engineers?|developers?|mentor|cross[ -]functional|coordinat|collaborat|stakeholder/i, endings: ["for a team of __", "with __ engineers"] },
  { words: /\bsprint|backlog|process|execution|pipeline|automat|deliver|deadline|tests?\b/i, endings: ["across __ sprints", "saving __ hours a week"] },
  { words: /\busers\b|\buser\b(?! stor)|customers?|merchants?|clients?/i, endings: ["used by __ people", "for __ customers"] }
];
export const resultEndingsFor = (line: string): string[] => {
  const picked: string[] = [];
  // The line already says what went up ("increasing brand visibility"): just add how much
  if (/\b(increas|boost|grow|grew|improv|rais|reduc|cut)\w*\b/i.test(line) && !/\d/.test(line)) picked.push("by __%");
  for (const group of RESULT_ENDINGS) if (group.words.test(line)) picked.push(...group.endings);
  // Fallbacks that read naturally after any line ("...on schedule for a team of 6")
  for (const fallback of ["for a team of __", "saving __ hours a week", "across __ projects"]) picked.push(fallback);
  return [...new Set(picked)].slice(0, 3);
};
// "Led sprint planning." + "for a team of __" + "8" -> "Led sprint planning for a team of 8."
export const addResultToLine = (line: string, ending: string, value: string): string => {
  const hadPeriod = /\.\s*$/.test(line);
  // "...planning, saving 4 hours a week" reads better with a comma before an -ing ending
  const joiner = /^[a-z]+ing\b/i.test(ending) ? ", " : " ";
  return `${line.replace(/[.,\s]+$/, "")}${joiner}${ending.replace("__", value.trim())}${hadPeriod ? "." : ""}`;
};

