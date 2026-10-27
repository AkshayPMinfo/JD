/**
 * Puffy AI words are removed unless the candidate used them (api/plainWording.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { removeHype, keepDigits, undoPointlessChange, plainResumeWording, dropFillerEnding } from "../../api/plainWording.ts";

const t = new Checks();
const orig = "Managed content for Facebook and Instagram. Ran marketing campaigns that increased footfall.";
const eq = (id: string, label: string, input: string, want: string, original = orig) => {
  const got = removeHype(input, original);
  t.check(id, `${label} → "${got}"`, got === want);
};
eq("P1", "Drops an added adverb", "Developed campaigns that significantly increased footfall.", "Developed campaigns that increased footfall.");
eq("P2", "Two adverbs in one line", "Demonstrably increased footfall and meticulously tailored posts.", "Increased footfall and tailored posts.");
eq("P3", "Fancy verb back to plain", "Orchestrated end-to-end content creation across Facebook.", "Managed content creation across Facebook.");
eq("P4", "Fixes a/an after removing an adjective", "Built an innovative dashboard and a comprehensive app.", "Built a dashboard and an app.");
eq("P5", "Keeps a word the candidate used", "Ran highly effective campaigns.", "Ran highly effective campaigns.", "Ran highly effective campaigns.");
eq("P6", "Leverage → use", "Leveraged SQL to find drop-offs.", "Used SQL to find drop-offs.");
eq("P7", "Plain line stays the same", "Managed product backlogs and sprint planning.", "Managed product backlogs and sprint planning.");
eq("P8", "Doesn't touch words inside other words", "Worked with highlyrated teams in Highlands.", "Worked with highlyrated teams in Highlands.");
eq("P9", "Fixes odd number spacing", "Reduced latency by 35\u202f% for 1\u202f000 users and 2\u202fM requests", "Reduced latency by 35% for 1,000 users and 2M requests");
eq("P10", "Fixes special hyphens", "Built order\u2011tracking APIs", "Built order-tracking APIs");
const same = (id: string, label: string, got: string, want: string) => t.check(id, `${label} → "${got}"`, got === want);
same("D1", "Three back to 3 when you wrote 3", keepDigits("Mentored three junior engineers", "Mentored 3 junior engineers"), "Mentored 3 junior engineers");
same("D2", "Keeps the word if you wrote the word", keepDigits("Mentored three engineers", "Mentored three engineers"), "Mentored three engineers");
same("D3", "Doesn't turn 'one' into 1 when you wrote 10", keepDigits("Led one of the teams", "Led 10 people"), "Led one of the teams");
same("S1", "Built -> Developed only: keep yours", undoPointlessChange("Developed ETL pipelines in Python moving 500GB of data nightly", "Built ETL pipelines in Python moving 500GB of data nightly"), "Built ETL pipelines in Python moving 500GB of data nightly");
same("S2", "Only punctuation changed: keep yours", undoPointlessChange("Managed content creation, scheduling and publication.", "Managed content creation, scheduling, and publication"), "Managed content creation, scheduling, and publication");
same("S3", "A real rewrite stays", undoPointlessChange("Built REST APIs in Node.js serving 2M requests per day", "Worked on backend code"), "Built REST APIs in Node.js serving 2M requests per day");
const src = { summary: "", workExperience: [{ id: "e1", description: ["Mentored 3 junior engineers through code reviews", "Built ETL pipelines in Python"] }], projects: [] };
const out = plainResumeWording({ summary: "", workExperience: [{ id: "e1", description: ["Mentored three junior engineers via code reviews", "Developed ETL pipelines in Python"] }], projects: [] }, src);
same("S4", "Whole resume: digit kept, pointless swap undone", out.workExperience[0].description.join(" | "), "Mentored 3 junior engineers via code reviews | Built ETL pipelines in Python");
same("F1", "Drops 'demonstrating ...' ending", dropFillerEnding("Built order-tracking REST APIs in Node.js, handling 2M requests per day, demonstrating capability in high-volume distributed systems.", "Built order-tracking REST APIs in Node.js serving 2M requests per day"), "Built order-tracking REST APIs in Node.js, handling 2M requests per day");
same("F2", "Drops 'aligning with the job's ...' ending", dropFillerEnding("Mentored 3 junior engineers, providing guidance through code reviews, aligning with the job's mentoring responsibility.", "Mentored 3 junior engineers through code reviews"), "Mentored 3 junior engineers, providing guidance through code reviews");
same("F3", "Keeps 'ensuring' if you wrote it", dropFillerEnding("Defined features, ensuring alignment with business goals.", "Defined features, ensuring alignment with business goals."), "Defined features, ensuring alignment with business goals.");
same("F4", "Keeps the period if yours had one", dropFillerEnding("Ran campaigns, showcasing strong creativity.", "Ran campaigns."), "Ran campaigns.");
process.exit(t.report("Plain wording"));
