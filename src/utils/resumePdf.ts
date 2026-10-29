/**
 * Builds an ATS-friendly resume PDF: real, selectable text in a single column with standard
 * section headings. No images, tables, columns or icons, so applicant tracking systems can read it.
 */
import { jsPDF } from "jspdf";
import { type ResumeColor, resumeColorHex, hexToRgb } from "./resumeColors";
import type { ResumeStructure } from "../types";
import { educationNewestFirst, educationGoesFirst } from "./educationOrder";

// The built-in PDF fonts cover Latin-1 only. Map common typographic characters to safe ones
// so nothing turns into blank boxes or garbage in the PDF text layer.
export function toPdfSafeText(value: unknown): string {
  return String(value ?? "")
    .replace(/₹\s*/g, "Rs. ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  -​ ]/g, " ")
    .replace(/[•●▪◦‣]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 18;
const MARGIN_TOP = 18;
const MARGIN_BOTTOM = 16;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const PT_TO_MM = 0.3528;

export function buildResumePdf(resume: ResumeStructure, headline = "", color: ResumeColor = "classic"): jsPDF {
  // Accent colour for the name, headings and lines; "classic" keeps the original black and grey
  const accent = color === "classic" ? null : hexToRgb(resumeColorHex(color));
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const name = toPdfSafeText(resume.fullName) || "Resume";
  doc.setProperties({ title: `${name} - Resume`, author: name, subject: "Resume", creator: "Auralis Resumes" });

  let y = MARGIN_TOP;
  const lineHeight = (size: number, factor = 1.35) => size * PT_TO_MM * factor;
  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  };
  const write = (text: string, opts: { size: number; bold?: boolean; italic?: boolean; color?: number; rgb?: [number, number, number]; indent?: number; gapAfter?: number }) => {
    const clean = toPdfSafeText(text);
    if (!clean) return;
    const style = opts.bold && opts.italic ? "bolditalic" : opts.bold ? "bold" : opts.italic ? "italic" : "normal";
    doc.setFont("helvetica", style);
    doc.setFontSize(opts.size);
    if (opts.rgb) doc.setTextColor(...opts.rgb); else doc.setTextColor(opts.color ?? 20);
    const indent = opts.indent ?? 0;
    const lines: string[] = doc.splitTextToSize(clean, CONTENT_W - indent);
    const lh = lineHeight(opts.size);
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, MARGIN_X + indent, y + lh * 0.8);
      y += lh;
    }
    y += opts.gapAfter ?? 0;
  };
  const bullet = (text: string) => {
    const clean = toPdfSafeText(text).replace(/^[-*]\s*/, "");
    if (!clean) return;
    const size = 10;
    const lh = lineHeight(size, 1.3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(30);
    const lines: string[] = doc.splitTextToSize(clean, CONTENT_W - 5);
    ensureSpace(lh);
    doc.text("-", MARGIN_X + 1, y + lh * 0.8);
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, MARGIN_X + 5, y + lh * 0.8);
      y += lh;
    }
    y += 0.6;
  };
  const section = (title: string) => {
    ensureSpace(14);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (accent) doc.setTextColor(...accent); else doc.setTextColor(20);
    doc.text(title.toUpperCase(), MARGIN_X, y + lineHeight(11) * 0.8);
    y += lineHeight(11) + 0.6;
    if (accent) doc.setDrawColor(...accent); else doc.setDrawColor(190);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
    y += 2;
  };

  // Header: name, optional headline, one contact line
  write(name, { size: 18, bold: true, gapAfter: 0.5, rgb: accent || undefined });
  if (headline && headline !== "Tailored Position") write(headline, { size: 11, color: 60, gapAfter: 0.5 });
  const contact = [resume.phone, resume.email, resume.linkedin, resume.website, resume.location]
    .map(toPdfSafeText).filter(Boolean).join(" | ");
  if (contact) write(contact, { size: 9.5, color: 60, gapAfter: 1 });

  if (resume.summary?.trim()) {
    section("Summary");
    write(resume.summary, { size: 10, gapAfter: 0.5 });
  }

  const skills = (resume.skills || []).map(toPdfSafeText).filter(Boolean);
  if (skills.length) {
    section("Skills");
    write(skills.join(", "), { size: 10, gapAfter: 0.5 });
  }

  // Recent graduates (or no jobs yet): Education right after Skills; everyone else: after Projects
  const writeEducation = () => {
    const education = educationNewestFirst(resume.education || []).filter(e => e.degree || e.school);
    if (education.length) {
      section("Education");
      education.forEach(e => {
        write(e.degree || e.school, { size: 10.5, bold: true });
        const sub = [e.degree ? e.school : "", e.duration, e.gpa ? `GPA: ${e.gpa}` : ""].filter(Boolean).join(" | ");
        if (sub) write(sub, { size: 10, color: 60, gapAfter: 1 });
      });
    }
  };
  const eduFirst = educationGoesFirst(resume);
  if (eduFirst) writeEducation();

  const jobs = (resume.workExperience || []).filter(j => j.role || j.company || j.description?.length);
  if (jobs.length) {
    section("Experience");
    jobs.forEach((job, i) => {
      // Everything left-aligned on its own line: right-aligned dates get read as a separate
      // column by some ATS parsers and end up detached from the job.
      write(job.role || job.company, { size: 10.5, bold: true });
      const meta = [job.role ? job.company : "", job.duration].filter(Boolean).join(" | ");
      if (meta) write(meta, { size: 10, color: 60, gapAfter: 0.5 });
      (job.description || []).forEach(bullet);
      if (i < jobs.length - 1) y += 2;
    });
  }

  const projects = (resume.projects || []).filter(p => p.name || p.description?.length);
  if (projects.length) {
    section("Projects");
    projects.forEach((p, i) => {
      write(p.name, { size: 10.5, bold: true });
      if (p.duration) write(p.duration, { size: 10, color: 60, gapAfter: 0.5 });
      (p.description || []).forEach(bullet);
      if (i < projects.length - 1) y += 2;
    });
  }

  if (!eduFirst) writeEducation();

  const lists: [string, string[] | undefined][] = [
    ["Certifications", resume.certifications],
    ["Achievements", resume.achievements],
    ["Languages", resume.languages]
  ];
  for (const [title, items] of lists) {
    const clean = (items || []).map(toPdfSafeText).filter(Boolean);
    if (!clean.length) continue;
    section(title);
    if (title === "Languages") write(clean.join(", "), { size: 10 });
    else clean.forEach(bullet);
  }

  return doc;
}
