/**
 * Unit checks for the job-switcher detection (src/utils/roleFamily.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { roleFamilyOf, detectRoleMismatch } from "../../src/utils/roleFamily.ts";

const t = new Checks();
const fam = (title: string) => roleFamilyOf(title)?.id ?? null;

t.check("R1", "Product titles → product", fam("Associate Product Manager") === "product" && fam("Product Owner") === "product");
t.check("R2", "Engineering titles → engineering",
  ["Backend Software Engineer", "Senior Software Engineer", "Full Stack Developer", "SDE II", "DevOps Engineer"].every(x => fam(x) === "engineering"),
  ["Backend Software Engineer", "Senior Software Engineer", "Full Stack Developer", "SDE II", "DevOps Engineer"].map(x => `${x}=${fam(x)}`).join(", "));
t.check("R3", "More specific families win (Data Engineer → data, Product Designer → design)", fam("Data Engineer") === "data" && fam("Product Designer") === "design");
t.check("R4", "Marketing titles → marketing", fam("Social Media Manager") === "marketing" && fam("Campaign manager") === "marketing");
t.check("R5", "Unknown or placeholder titles → no family", fam("Tailored Position") === null && fam("") === null && fam("Chief Happiness Officer") === null);

const switcher = detectRoleMismatch("Associate Product Manager", "Backend Software Engineer");
t.check("R6", "PM resume vs backend job → flagged as a switch", switcher?.resumeFamily.id === "product" && switcher?.jobFamily.id === "engineering", JSON.stringify(switcher));
t.check("R7", "Same family → not flagged (Senior Software Engineer vs Backend Engineer)", detectRoleMismatch("Senior Software Engineer", "Backend Engineer") === null);
t.check("R8", "Can't classify one side → not flagged", detectRoleMismatch("Associate Product Manager", "Tailored Position") === null);
t.check("R9", "Engineer → nurse job → flagged", detectRoleMismatch("Software Engineer", "Registered Nurse")?.jobFamily.id === "healthcare");

process.exit(t.report("Job-switcher detection"));
