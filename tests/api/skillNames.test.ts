/**
 * Unit checks for cleaning messy skill names (src/utils/skillNames.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { cleanSkillName } from "../../src/utils/skillNames.ts";

const t = new Checks();
const eq = (input: string, expected: string[]) => JSON.stringify(cleanSkillName(input)) === JSON.stringify(expected);
const cases: [string, string, string[]][] = [
  ["N1", "Tableau (or similar data-visualization tool)", ["Tableau"]],
  ["N2", "Mixpanel or Amplitude", ["Mixpanel", "Amplitude"]],
  ["N3", "Applicant Tracking System (e.g., Greenhouse)", ["Applicant Tracking System", "Greenhouse"]],
  ["N4", "SAP familiarity", ["SAP"]],
  ["N5", "Content Marketing/HubSpot (or similar marketing automation)", ["Content Marketing", "HubSpot"]],
  ["N6", "Amplitude (product analytics)", ["Amplitude"]],
  ["N7", "Hands-on experience with Docker", ["Docker"]],
  ["N8", "Python, Java or Go", ["Python", "Java", "Go"]],
  ["N9", "CI/CD", ["CI/CD"]],
  ["N10", "A/B Testing", ["A/B Testing"]],
  ["N11", "Node.js", ["Node.js"]],
  ["N12", "Accessibility (WCAG)", ["Accessibility", "WCAG"]]
];
for (const [id, input, expected] of cases) {
  t.check(id, `"${input}" → ${expected.join(", ")}`, eq(input, expected), JSON.stringify(cleanSkillName(input)));
}

process.exit(t.report("Skill name cleanup"));
