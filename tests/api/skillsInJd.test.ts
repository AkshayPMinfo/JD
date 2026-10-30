/**
 * Step 3 only lists skills the job post actually names.
 * Run: npx tsx tests/api/skillsInJd.test.ts
 */
import { Checks } from "./helpers.ts";
import { skillNamedInJd as named, keepSkillsNamedInJd } from "../../api/skillsInJd.ts";

const t = new Checks();
const jd = "Associate Product Manager for our quick-commerce app. Write PRDs, own the roadmap and prioritise features. Analyse data with SQL and product analytics tools. Run A/B experiments. Experience with Jira, Figma and Mixpanel or similar tools, ideally in e-commerce. Strong stakeholder management skills.";

t.check("S1", "A guess the post doesn't name is dropped (Amplitude)", !named("Amplitude", jd));
t.check("S2", "Tools the post names are kept (SQL, Figma, Mixpanel, Jira)", ["SQL", "Figma", "Mixpanel", "Jira"].every(s => named(s, jd)));
t.check("S3", "Hyphens and spacing don't matter (Quick Commerce, E-commerce)", named("Quick Commerce", jd) && named("E-commerce", jd));
t.check("S4", "Short names match (A/B Testing from 'A/B experiments')", named("A/B Testing", jd));
t.check("S5", "Word endings match (Roadmapping, Feature Prioritization)", named("Roadmapping", jd) && named("Feature Prioritization", jd));
t.check("S6", "A kind word alone isn't proof (Python Testing dropped)", !named("Python Testing", jd));
t.check("S7", "Never empties the list", keepSkillsNamedInJd([{ name: "Tableau" }], jd).length === 1);
t.check("S8", "Filters a mixed list", keepSkillsNamedInJd([{ name: "SQL" }, { name: "Tableau" }, { name: "Figma" }], jd).map(s => s.name).join(",") === "SQL,Figma");

process.exit(t.report("Skills named in the job post"));
