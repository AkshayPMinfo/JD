/**
 * Name and email split by a wrapped PDF header.
 * Run: npx tsx tests/api/contactRepair.test.ts
 */
import { Checks } from "./helpers.ts";
import { repairSplitEmail as fix, fillContactFromText as fill } from "../../api/contactRepair.ts";

const t = new Checks();
let r = fix({ fullName: "Akshay Anand om", email: "Shivace.professional@gmail.c" });
t.check("R1", `"om" moves back to the email → ${r.fullName} / ${r.email}`, r.fullName === "Akshay Anand" && r.email === "Shivace.professional@gmail.com");
r = fix({ fullName: "Riya Mehta xyz", email: "riya@gmail.c" });
t.check("R2", "Nothing changes when the joined email still looks wrong", r.fullName === "Riya Mehta xyz" && r.email === "riya@gmail.c");
r = fix({ fullName: "Riya Mehta", email: "riya@gmail.com" });
t.check("R3", "A correct name and email stay the same", r.fullName === "Riya Mehta" && r.email === "riya@gmail.com");
r = fix({ fullName: "Ana de", email: "ana@site.com" });
t.check("R4", "A lowercase name part stays when the email is fine", r.fullName === "Ana de");
r = fix({ fullName: "Riya Mehta co", email: "riya@acme.co" });
t.check("R5", "An email ending in .co is left alone", r.fullName === "Riya Mehta co" && r.email === "riya@acme.co");
r = fix({ fullName: "Riya Mehta", email: "riya@gmail.c" });
t.check("R6", "A cut email with no stray piece is left alone", r.email === "riya@gmail.c");
// Live tests (3 Nov): LinkedIn / GitHub links and city were dropped when reading the file
const arjun = fill({ email: "arjun.mehta.test@example.com" }, "Arjun Mehta\nPune, India | arjun.mehta.test@example.com | +91 90000 67890 | github.com/arjunmehta-test\nPROFESSIONAL SUMMARY");
t.check("L1", `GitHub link and city filled → ${arjun.website} / ${arjun.location}`, arjun.website === "github.com/arjunmehta-test" && arjun.location === "Pune, India");
const neha = fill({ email: "neha.kapoor.test@example.com" }, "Neha Kapoor\nPune, India | neha.kapoor.test@example.com | +91 90000 12345 | linkedin.com/in/nehakapoor-test");
t.check("L2", `LinkedIn filled, not copied into website → ${neha.linkedin} / ${neha.website || "(none)"}`, neha.linkedin === "linkedin.com/in/nehakapoor-test" && !neha.website);
const kept = fill({ email: "a@b.com", linkedin: "linkedin.com/in/own", location: "Delhi" }, "Pune | a@b.com | linkedin.com/in/other");
t.check("L3", "Never overwrites what the parser already found", kept.linkedin === "linkedin.com/in/own" && kept.location === "Delhi");
const none = fill({ email: "a@b.com" }, "Riya\na@b.com | +91 98765 43210");
t.check("L4", "Nothing made up when the resume has no links or city", !none.linkedin && !none.website && !none.location);
process.exit(t.report("Name and email repair"));
