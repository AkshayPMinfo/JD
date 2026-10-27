/**
 * Puffy AI words are removed unless the candidate used them (api/plainWording.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { removeHype } from "../../api/plainWording.ts";

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
process.exit(t.report("Plain wording"));
