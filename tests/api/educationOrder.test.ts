/**
 * Education is listed newest first (src/utils/educationOrder.ts).
 * Run with: npm run test:api
 */
import { Checks } from "./helpers.ts";
import { educationNewestFirst } from "../../src/utils/educationOrder.ts";

const t = new Checks();
const order = (list: { degree: string; duration: string }[]) => educationNewestFirst(list).map(e => e.degree).join(", ");
t.check("E1", "10th, 12th, BCA → BCA, 12th, 10th",
  order([{ degree: "10th", duration: "2005" }, { degree: "12th", duration: "2005-2007" }, { degree: "BCA", duration: "2010-2013" }]) === "BCA, 12th, 10th");
t.check("E2", "'Present' counts as newest",
  order([{ degree: "B.Tech", duration: "2016 - 2020" }, { degree: "M.Tech", duration: "2023 - Present" }]) === "M.Tech, B.Tech");
t.check("E3", "Already newest first stays the same",
  order([{ degree: "MBA", duration: "2021 - 2023" }, { degree: "B.Com", duration: "2015 - 2018" }]) === "MBA, B.Com");
t.check("E4", "Entries with no year keep their place after dated ones",
  order([{ degree: "Diploma", duration: "" }, { degree: "BA", duration: "2012" }]) === "BA, Diploma");
process.exit(t.report("Education order"));
