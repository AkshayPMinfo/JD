/**
 * Job post check on step 2: real postings pass, resumes, cover letters and filler text don't.
 * Run: npx tsx tests/api/jdValidation.test.ts
 */
import { Checks } from "./helpers.ts";
import { validateJobDescriptionText as check } from "../../src/utils/jdValidation.ts";
import { rulesBasedSimplifyJd } from "../../api/rulesEngine.ts";

const t = new Checks();

// Like the Sophos LinkedIn post that was wrongly rejected: it says "certifications", "email security",
// "university" and "resumes", which used to make it look like a resume.
const securityPm = `About the job
Our company protects organizations with endpoint, network, email, and cloud security products.
Role Summary
The Product Manager drives strategy, discovery and delivery of our firewall and cloud management platform. You will partner with engineering, design, sales and customer success.
What You Will Do
Own the product lifecycle from discovery to launch. Define the roadmap. Run customer interviews and data analysis. Write product requirements, user stories and acceptance criteria. Track adoption metrics.
What You Will Bring
5+ years of experience in product management in cybersecurity or B2B SaaS. Strong understanding of network security. Comfort with data. Bachelor's degree from a university or equivalent experience; security certifications (CISSP, CCNP) are a plus.
We may use AI tools to support hiring, such as reviewing applications and analyzing resumes. Final decisions are made by humans. Please apply even if you don't check every box.`;
let r = check(securityPm);
t.check("J1", `A security PM post with "email" and "certifications" passes (indicators: ${r.foundIndicators.join(", ")})`, r.isValid && !r.isResume);

const resume = `Riya Mehta
riya.mehta@example.com | +91 98765 43210 | Bengaluru
Summary
Associate product manager with 2 years of experience building consumer app features.
Work Experience
QuickCart, Associate Product Manager, 2023 - Present
Wrote product requirements and user stories for checkout. Ran weekly sprint planning. Interviewed customers about sign-up drop-off. Launched a reorder button that increased repeat orders by 12%.
Education
B.Tech, Computer Science, Delhi University, 2019 - 2023
Skills
SQL, Excel, Jira, Figma, user research, product requirements, roadmaps, stakeholder management`;
r = check(resume);
t.check("J2", "A resume with an email address and phone is still rejected", !r.isValid && r.isResume);

const letter = `Dear Hiring Manager, I am writing to apply for the product manager role. ` + "I have experience with skills and requirements across many teams and projects. ".repeat(6) + "Yours sincerely, Riya";
t.check("J3", "A cover letter is rejected", !check(letter).isValid);

t.check("J4", "Lorem ipsum is rejected", !check("Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(12)).isValid);
t.check("J5", "Text under 50 words is rejected", check("Product manager. Requirements: SQL. Responsibilities: roadmap.").isTooShort);

const shortPost = `Associate Product Manager, Payments. We are looking for an APM to own checkout. Responsibilities: write PRDs and user stories, run user research, define success metrics, run A/B tests, work with engineering in Agile sprints. Requirements: 0-2 years of experience, SQL and Excel skills, clear communication, Figma and Jira. Interest in fintech is a plus. Send questions to careers@example.com.`;
t.check("J6", "A normal post that lists a contact email still passes", check(shortPost).isValid);

// Basic mode (no AI) listed "Sophos", "Providers" and "Multi-tenant scenarios)" as skills (30 Oct)
const sophos = `About the job
Sophos is a cybersecurity leader. Sophos solutions combine machine learning and automation.
Sophos goes to market with Managed Service Providers (MSPs) and partners. Sophos is headquartered in Oxford.
What You Will Do
Own the product lifecycle for Sophos Firewall and Sophos Central. Develop expertise in firewall use cases (including MSP and multi-tenant scenarios), SD-WAN, VPN, and integration with XDR and ZTNA.
What You Will Bring
5+ years of experience in product management with knowledge of network security or B2B SaaS.`;
const names = (rulesBasedSimplifyJd(sophos) as any).requiredSkills.map((s: any) => s.name.toLowerCase());
t.check("K1", `The company and its products aren't skills → ${names.join(", ")}`, !names.some((n: string) => n.includes("sophos")));
t.check("K2", "No stray brackets or description phrases", !names.some((n: string) => /[()]|scenario|provider| with /.test(n)));
t.check("K3", "Real skills still found (VPN, SD-WAN, ZTNA)", ["vpn", "sd-wan", "ztna"].every(k => names.includes(k)));
process.exit(t.report("Job post check"));
