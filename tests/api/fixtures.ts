/**
 * Builds the fake test resumes in memory (no binary files in the repo).
 * All names, contacts and companies are made up.
 */
import { jsPDF } from "jspdf";
import JSZip from "jszip";

export const RESUME_TEXT = `Priya Sharma
Bengaluru, India | priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priyasharma-test

PROFESSIONAL SUMMARY
Backend software engineer with 4 years of experience building REST APIs and data pipelines in Python and Node.js.

EXPERIENCE
Senior Software Engineer
Flipkart | Jan 2023 - Present
- Built order-tracking REST APIs in Node.js serving 2M requests per day
- Reduced p95 latency by 35% by adding Redis caching
- Mentored 3 junior engineers through code reviews

Software Engineer
Infosys | Jul 2020 - Dec 2022
- Developed ETL pipelines in Python moving 500GB of data nightly
- Wrote unit tests raising coverage from 40% to 85%

EDUCATION
B.Tech in Computer Science
National Institute of Technology Trichy | 2016 - 2020 | CGPA 8.6

SKILLS
Python, Node.js, JavaScript, SQL, PostgreSQL, Redis, Git, Linux

PROJECTS
Expense Splitter App
- Built a React and Express app to split group expenses, 1,000 monthly users

CERTIFICATIONS
AWS Certified Cloud Practitioner (2022)`;

// Title | company | dates on one line, "Title at Company", school before degree, US phone
export const ALT_RESUME_TEXT = `Alex Johnson
Austin, TX • alex.j@example.com • (512) 555-0147 • github.com/alexj-test

SUMMARY
Frontend developer focused on React and accessible UI.

WORK EXPERIENCE
Frontend Developer | Acme Corp | Jun 2021 - Present
- Built a design system used by 12 product teams
- Cut bundle size by 40% with code splitting
Software Engineer Intern at Globex | May 2020 - Aug 2020
- Wrote integration tests for the checkout flow

EDUCATION
University of Texas at Austin
B.S. in Computer Science | 2017 - 2021 | GPA: 3.8/4.0

SKILLS
React, TypeScript, CSS`;

export const RECIPE_TEXT = `Grandma's Banana Bread

Ingredients
3 ripe bananas
1/3 cup melted butter
1 cup sugar
1 egg
1 tsp baking soda
1.5 cups flour

Method
Preheat oven to 175C. Mash bananas, mix in butter.
Add sugar, egg, then flour. Bake 60 minutes.`;

function writeLines(doc: jsPDF, lines: string[], x: number, yStart: number, size = 10): number {
  doc.setFontSize(size);
  let y = yStart;
  for (const line of lines) { doc.text(line, x, y); y += size * 0.55; }
  return y;
}

function pdfFromText(text: string, size = 10): Buffer {
  const doc = new jsPDF();
  writeLines(doc, text.split("\n"), 14, 16, size);
  return Buffer.from(doc.output("arraybuffer"));
}

/** Two-column layout: contact/skills/education on the left, experience on the right. */
function twoColumnPdf(): Buffer {
  const doc = new jsPDF();
  doc.setFontSize(16); doc.text("Rahul Verma", 14, 16);
  writeLines(doc, [
    "CONTACT", "rahul.verma@example.com", "+91 91234 56789", "Pune, India", "",
    "SKILLS", "Java", "Spring Boot", "Kubernetes", "Docker", "MySQL", "Kafka", "",
    "EDUCATION", "M.Tech Software Systems", "BITS Pilani", "2015 - 2017"
  ], 14, 28, 9);
  writeLines(doc, [
    "PROFESSIONAL SUMMARY", "Java developer with 6 years building microservices.", "",
    "EXPERIENCE", "Lead Engineer", "Zomato | Mar 2021 - Present",
    "- Migrated monolith to 14 Spring Boot microservices",
    "- Set up Kafka event streaming for 50K events/sec", "",
    "Software Developer", "TCS | Aug 2017 - Feb 2021",
    "- Built payment reconciliation services in Java",
    "- Containerised 20 services with Docker and Kubernetes"
  ], 80, 28, 9);
  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Mimics PDFs that store "fi"/"fl" as separate ligature glyphs: each line is written as touching
 * chunks ("de" + "fi" + "ne"), which is how text extraction ended up with "de fi ne".
 */
function ligaturePdf(): Buffer {
  const doc = new jsPDF();
  doc.setFontSize(10);
  const lines: string[][] = [
    ["Meera Iyer"],
    ["Pune, India | meera.iyer@example.com | +91 90000 11111"],
    ["EXPERIENCE"],
    ["Associate Product Manager"],
    ["X", "fi", "n Digital | Jan 2023 - Present"],
    ["- Collaborated with design to de", "fi", "ne the product roadmap for the five teams"],
    ["- Improved sprint ef", "fi", "ciency and documented the release work", "fl", "ow"],
    ["EDUCATION"],
    ["BCA"],
    ["IMTS Institute | 2010 - 2013"],
    ["SKILLS"],
    ["Product Management, Agile, Figma, Jira"]
  ];
  let y = 16;
  for (const chunks of lines) {
    let x = 14;
    for (const chunk of chunks) {
      doc.text(chunk, x, y);
      x += doc.getTextWidth(chunk); // next chunk starts exactly where this one ends: no gap
    }
    y += 5.5;
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/** Minimal valid .docx: one paragraph per line. */
async function docxFromText(text: string): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = text.split("\n").map(l => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

export interface Fixtures {
  single: Buffer;
  twoColumn: Buffer;
  alt: Buffer;
  docx: Buffer;
  recipe: Buffer;
  corrupt: Buffer;
  text: Buffer;
  ligatures: Buffer;
}

export async function buildFixtures(): Promise<Fixtures> {
  return {
    single: pdfFromText(RESUME_TEXT),
    twoColumn: twoColumnPdf(),
    alt: pdfFromText(ALT_RESUME_TEXT),
    docx: await docxFromText(RESUME_TEXT),
    recipe: pdfFromText(RECIPE_TEXT, 11),
    corrupt: Buffer.from("%PDF-1.4\nthis is not really a pdf \x00\x01\x02"),
    text: Buffer.from(RESUME_TEXT),
    ligatures: ligaturePdf()
  };
}

export const JD_BACKEND = `Senior Backend Engineer - Swiggy
We are hiring a Senior Backend Engineer. Requirements: 4+ years with Python or Go, experience building REST APIs and microservices, strong knowledge of PostgreSQL, Redis, Kafka, Docker and Kubernetes. Experience with AWS and CI/CD pipelines. Nice to have: GraphQL, Terraform.
Responsibilities: Design scalable distributed systems. Mentor engineers. Own system reliability and on-call.`;

export const JD_NURSE = `Registered Nurse - Apollo Hospitals
We need a Registered Nurse with BSc Nursing, valid nursing council registration, 3 years ICU experience, patient care, medication administration, ventilator management and BLS/ACLS certification.`;
