import type { ResumeStructure } from "../types";

/**
 * A made-up resume and job post so visitors can try the whole flow in one click,
 * without uploading their own resume. The person and contact details are fictional.
 */
export const SAMPLE_RESUME: ResumeStructure = {
  fullName: "Riya Mehta (Sample)",
  email: "riya.sample@example.com",
  phone: "+91 90000 00000",
  summary: "Associate product manager with 2 years of experience building consumer app features with engineering and design teams.",
  skills: ["Product Management", "User Research", "Wireframing", "Jira", "Agile", "Stakeholder Management", "Excel", "Communication"],
  languages: ["English", "Hindi"],
  workExperience: [
    {
      id: "exp-sample-0",
      role: "Associate Product Manager",
      company: "QuickCart",
      duration: "Jun 2023 - Present",
      description: [
        "Wrote product requirements and user stories for the checkout and order-tracking screens.",
        "Ran weekly sprint planning with engineers and designers.",
        "Interviewed customers to find why they dropped off during sign-up.",
        "Launched a reorder button that increased repeat orders by 12%."
      ]
    },
    {
      id: "exp-sample-1",
      role: "Business Analyst Intern",
      company: "FinServe",
      duration: "Jan 2023 - May 2023",
      description: [
        "Built Excel dashboards to track loan application drop-offs.",
        "Prepared weekly reports for the product and sales teams."
      ]
    }
  ],
  education: [
    { id: "edu-sample-0", degree: "B.Tech in Computer Science", school: "Pune Institute of Technology", duration: "2019 - 2023", gpa: "8.1" }
  ],
  projects: [
    {
      id: "proj-sample-0",
      name: "Campus Food Ordering App",
      description: ["Designed and tested a food pre-ordering app for the college canteen with 300 student users."]
    }
  ],
  certifications: ["Google Project Management Certificate"],
  achievements: []
};

export const SAMPLE_JOB_POST = `Associate Product Manager - Swiggy (Bengaluru)

About the role
Swiggy is looking for an Associate Product Manager to work on the customer ordering experience in our food delivery app, used by millions of people every day.

What you will do
- Write PRDs and user stories for new features
- Prioritise the product backlog and run sprint planning with engineering and design
- Analyse funnel data with SQL to find where customers drop off
- Run A/B tests to improve conversion and retention
- Talk to customers and turn their problems into product ideas
- Track metrics like conversion rate, order frequency and retention

What we are looking for
- 1-3 years of product management or analyst experience
- Comfortable with SQL, Excel and analytics tools like Mixpanel
- Experience working with cross-functional teams in an agile setup
- Strong communication and stakeholder management skills
- A customer-first mindset and curiosity about consumer apps`;
