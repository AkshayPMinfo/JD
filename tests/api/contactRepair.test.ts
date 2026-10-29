/**
 * Name and email split by a wrapped PDF header.
 * Run: npx tsx tests/api/contactRepair.test.ts
 */
import { Checks } from "./helpers.ts";
import { repairSplitEmail as fix } from "../../api/contactRepair.ts";

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
process.exit(t.report("Name and email repair"));
