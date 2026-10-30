/**
 * Puffy AI words are removed unless the candidate used them (api/plainWording.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { removeHype, keepDigits, undoPointlessChange, plainResumeWording, dropFillerEnding, keepAppWord, keepNamedDetails } from "../../api/plainWording.ts";

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
// Found in the live test (29 Oct): vague endings that add words the person never wrote
same("V1", "Drops ', providing data for analysis'", dropFillerEnding("Built Excel dashboards to track loan application drop-offs, providing data for analysis.", "Built Excel dashboards to track loan application drop-offs."), "Built Excel dashboards to track loan application drop-offs.");
same("V2", "Drops ', improving clarity for development'", dropFillerEnding("Wrote PRDs and user stories for checkout and order-tracking screens, improving clarity for development.", "Wrote product requirements and user stories for the checkout and order-tracking screens."), "Wrote PRDs and user stories for checkout and order-tracking screens.");
same("V3", "Drops 'for the customer ordering experience'", dropFillerEnding("Launched a reorder button feature that increased repeat orders by 12% for the customer ordering experience.", "Launched a reorder button that increased repeat orders by 12%."), "Launched a reorder button feature that increased repeat orders by 12%.");
same("V4", "Drops ', enhancing the ordering experience'", dropFillerEnding("Designed and tested a food pre-ordering app for a college canteen, serving 300 student users, enhancing the ordering experience.", "Designed and tested a food pre-ordering app for the college canteen with 300 student users."), "Designed and tested a food pre-ordering app for a college canteen, serving 300 student users.");
same("V5", "Keeps an ending with a number (warning handles it)", dropFillerEnding("Ran A/B tests on checkout, improving conversion by 8%.", "Ran A/B tests on checkout."), "Ran A/B tests on checkout, improving conversion by 8%.");
same("V6", "Keeps a real detail from your line", dropFillerEnding("Led weekly syncs, supporting design and engineering handoffs.", "Led weekly syncs to support design and engineering handoffs."), "Led weekly syncs, supporting design and engineering handoffs.");
same("A1", "'mobile application' back to 'app'", keepAppWord("Built consumer mobile application features.", "Built consumer app features."), "Built consumer app features.");
same("A2", "Keeps 'application' if you wrote it", keepAppWord("Tracked loan application drop-offs in the app.", "Tracked loan application drop-offs."), "Tracked loan application drop-offs in the app.");
same("W1", "Drops 'aspiring' the AI added", removeHype("Aspiring product manager with 2 years in fintech.", "Analyst with 2 years in fintech."), "Product manager with 2 years in fintech.");
same("W2", "Keeps 'aspiring' if you wrote it (the final-step check flags it instead)", removeHype("Aspiring product manager.", "Aspiring product manager."), "Aspiring product manager.");
// Found in the live Sophos test (30 Oct): specific names were swapped for vague words
const fb = "Managed content creation, scheduling, and publication for platforms like Facebook, Instagram, Twitter, and LinkedIn.";
same("N1", "Keeps your line when Facebook, Instagram... are dropped", keepNamedDetails("Managed content creation, scheduling, and publication across major social media platforms.", fb), fb);
same("N2", "A rewrite that keeps every name stays", keepNamedDetails("Ran content and scheduling for Facebook, Instagram, Twitter and LinkedIn.", fb), "Ran content and scheduling for Facebook, Instagram, Twitter and LinkedIn.");
same("N3", "Keeps your line when a number is dropped", keepNamedDetails("Launched a reorder button that increased repeat orders.", "Launched a reorder button that increased repeat orders by 12%."), "Launched a reorder button that increased repeat orders by 12%.");
same("N4", "Lowercase change of a name is fine", keepNamedDetails("Ran sprints in jira.", "Ran sprints in Jira."), "Ran sprints in jira.");
same("N5", "First word and months don't count as names", keepNamedDetails("Wrote PRDs from March to June.", "Created PRDs from March to June."), "Wrote PRDs from March to June.");
process.exit(t.report("Plain wording"));
