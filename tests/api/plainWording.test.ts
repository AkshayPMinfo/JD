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
process.exit(t.report("Plain wording"));
