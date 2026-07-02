import React from "react";
import { Resume, ResumeStructure, Block, Item, TailoredResume } from "../types";
import { Mail, Phone, Linkedin, Globe } from "lucide-react";
import { resumeStructureToResume } from "../utils/resumeConverter";
import { findBestMatch } from "../utils/diffUtils";
import { diffWords } from "diff";

interface ResumePreviewProps {
  resume: Resume | ResumeStructure;
  templateStyle: "classic" | "tech" | "executive" | "two-column";
  id?: string;
  tailored?: TailoredResume;
  originalResume?: Resume | ResumeStructure;
  showHighlights?: boolean;
}

export default function ResumePreview({
  resume,
  templateStyle,
  id = "resume-preview-sheet",
  tailored,
  originalResume,
  showHighlights = true
}: ResumePreviewProps) {
  // Convert current resume to spec-compliant Resume type if needed
  const normResume: Resume = "blocks" in resume
    ? resume
    : resumeStructureToResume(resume);

  // Extract header info from blocks
  const headerBlock = normResume.blocks.find(b => b.kind === "header") as Extract<Block, { kind: "header" }> | undefined;
  const fullName = headerBlock?.name || "Your Name";
  const contact = headerBlock?.contact || [];

  const email = contact.find(c => c.includes("@")) || "";
  const phone = contact.find(c => /^[+\d\s()-]{7,20}$/.test(c.replace(/[^\d+]/g, ""))) || (contact.length > 0 ? contact[0] : "");
  const linkedin = contact.find(c => c.toLowerCase().includes("linkedin.com")) || "";
  const website = contact.find(c => !c.includes("@") && c !== phone && c !== linkedin) || "";

  // Prepare fallback diff lists if originalResume is provided directly
  const normOriginal = originalResume
    ? ("blocks" in originalResume ? originalResume : resumeStructureToResume(originalResume))
    : undefined;

  const originalBullets: string[] = [];
  const originalSkills: string[] = [];
  let originalSummary = "";

  if (normOriginal) {
    normOriginal.blocks.forEach(b => {
      if (b.kind === "text" && (b.label?.toLowerCase().includes("summary") || b.label?.toLowerCase().includes("profile"))) {
        originalSummary = b.body;
      }
      if (b.kind === "section") {
        const labelLower = b.label.toLowerCase();
        if (labelLower === "experience" || labelLower === "projects") {
          b.items.forEach(it => {
            if (it.kind === "job") {
              originalBullets.push(...(it.bullets || []));
            }
          });
        }
        if (labelLower === "skills") {
          b.items.forEach(it => {
            if (it.kind === "skill") {
              originalSkills.push(it.name.toLowerCase());
            }
          });
        }
      }
    });
  }

  /**
   * Renders a string with on-the-fly diffing against original candidates (fallback mode)
   */
  const renderInlineDiff = (value: string, originalCandidates: string[], highlightsEnabled: boolean) => {
    if (!highlightsEnabled) {
      return <>{value}</>;
    }
    if (!originalCandidates || originalCandidates.length === 0) {
      return <span className="add-line">{value}</span>;
    }

    const { match, similarity } = findBestMatch(value, originalCandidates);
    if (similarity < 0.15 || !match) {
      return <span className="add-line">{value}</span>;
    }
    if (similarity >= 0.99) {
      return <>{value}</>;
    }

    const changes = diffWords(match, value);
    return (
      <>
        {changes.map((part, index) => {
          if (part.removed) return null;
          if (part.added) {
            const hasMetric = /[\d%$\b\w]+/.test(part.value) && /[\d%$\/]+/.test(part.value);
            const cls = hasMetric ? "add-both" : "add-kw";
            return (
              <span key={index} className={cls}>
                {part.value}
              </span>
            );
          }
          return <span key={index}>{part.value}</span>;
        })}
      </>
    );
  };

  /**
   * Renders a string with inline diff additions.
   * NEVER touches original base characters.
   */
  const renderBullet = (
    text: string,
    additions: Array<{ insertAfter: number; text: string; cls: "add-kw" | "add-mx" | "add-both" }> | undefined,
    highlightsEnabled: boolean,
    bulletKey: string,
    candidates: string[]
  ): React.ReactNode => {
    // If we have direct tailored additions, use them
    if (tailored) {
      if (!additions || additions.length === 0) {
        return text;
      }
      const sortedAdditions = [...additions].sort((a, b) => a.insertAfter - b.insertAfter);
      const elements: React.ReactNode[] = [];
      let currentPos = 0;

      sortedAdditions.forEach((add, idx) => {
        if (add.insertAfter > currentPos) {
          elements.push(<span key={`text-${idx}`}>{text.slice(currentPos, add.insertAfter)}</span>);
          currentPos = add.insertAfter;
        }
        const highlightCls = highlightsEnabled ? add.cls : "";
        elements.push(
          <span key={`add-${idx}`} className={highlightCls}>
            {add.text}
          </span>
        );
      });

      if (currentPos < text.length) {
        elements.push(<span key="text-end">{text.slice(currentPos)}</span>);
      }
      return <>{elements}</>;
    }

    // Otherwise, fallback to on-the-fly diffing if originalResume is passed
    if (normOriginal) {
      return renderInlineDiff(text, candidates, highlightsEnabled);
    }

    // Default: render plain text
    return text;
  };

  /**
   * Renders an item inside a section block
   */
  const renderItem = (item: Item, blockIdx: number, itemIdx: number) => {
    const jobKey = `${blockIdx}.${itemIdx}`;

    if (item.kind === "job") {
      if (templateStyle === "two-column") {
        return (
          <div key={jobKey} className="font-serif">
            <h3 className="font-bold text-black text-sm">
              <span>{item.company}</span>
              {item.title && (
                <>
                  <span className="text-gray-400 font-normal font-sans mx-1.5">—</span>
                  <span className="italic font-bold text-neutral-800">{item.title}</span>
                </>
              )}
            </h3>
            <p className="text-[11px] text-neutral-500 font-semibold font-sans mt-0.5">{item.dates}</p>
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-neutral-700 leading-relaxed font-serif">
              {item.bullets.map((bullet, bulletIdx) => {
                const bulletKey = `${jobKey}.${bulletIdx}`;
                const adds = tailored?.inlineAdditions?.[bulletKey];
                return (
                  <li key={bulletIdx}>
                    {renderBullet(bullet, adds, showHighlights, bulletKey, originalBullets)}
                  </li>
                );
              })}
              {/* Kind B: New Bullets */}
              {tailored?.newBullets?.[jobKey]?.map((nb, idx) => (
                <li key={`nb-${idx}`} className={showHighlights ? "add-line" : ""}>
                  {nb.text}
                </li>
              ))}
            </ul>
          </div>
        );
      }

      if (templateStyle === "tech") {
        return (
          <div key={jobKey} className="border-l-2 border-[#2a2a2e] pl-4 print:border-gray-200">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
              <h3 className="font-bold text-gray-100 text-sm print:text-black font-mono">
                {item.title ? `${item.title} ` : ""}
                <span className="text-green-400">@ {item.company}</span>
              </h3>
              <span className="text-xs text-gray-500 print:text-gray-600 font-semibold font-mono">{item.dates}</span>
            </div>
            <ul className="list-none space-y-1.5 mt-2 font-mono">
              {item.bullets.map((bullet, bulletIdx) => {
                const bulletKey = `${jobKey}.${bulletIdx}`;
                const adds = tailored?.inlineAdditions?.[bulletKey];
                return (
                  <li key={bulletIdx} className="text-xs text-gray-300 leading-relaxed print:text-gray-800 flex items-start gap-1">
                    <span className="text-green-500 select-none">-</span>
                    <span>{renderBullet(bullet, adds, showHighlights, bulletKey, originalBullets)}</span>
                  </li>
                );
              })}
              {/* Kind B: New Bullets */}
              {tailored?.newBullets?.[jobKey]?.map((nb, idx) => (
                <li key={`nb-${idx}`} className={showHighlights ? "add-line text-xs flex items-start gap-1" : "text-xs text-gray-300 leading-relaxed print:text-gray-800 flex items-start gap-1"}>
                  <span className="text-green-500 select-none">-</span>
                  <span>{nb.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }

      if (templateStyle === "executive") {
        return (
          <div key={jobKey}>
            <div className="flex justify-between items-baseline font-semibold font-sans">
              <h3 className="text-sm text-[#111827]">
                {item.title ? (
                  <>
                    {item.title} <span className="text-gray-500 font-normal">|</span>{" "}
                  </>
                ) : null}
                <span className="text-[#1e3a8a] font-bold">{item.company}</span>
              </h3>
              <span className="text-xs text-gray-500 font-normal">{item.dates}</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed font-sans">
              {item.bullets.map((bullet, bulletIdx) => {
                const bulletKey = `${jobKey}.${bulletIdx}`;
                const adds = tailored?.inlineAdditions?.[bulletKey];
                return (
                  <li key={bulletIdx}>
                    <span className="text-gray-700">{renderBullet(bullet, adds, showHighlights, bulletKey, originalBullets)}</span>
                  </li>
                );
              })}
              {/* Kind B: New Bullets */}
              {tailored?.newBullets?.[jobKey]?.map((nb, idx) => (
                <li key={`nb-${idx}`} className={showHighlights ? "add-line" : ""}>
                  <span className="text-gray-700">{nb.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }

      // Default/Classic style
      return (
        <div key={jobKey}>
          <div className="flex justify-between items-baseline font-medium text-xs font-serif">
            <span className="font-semibold text-gray-900 text-sm">
              {item.title ? `${item.title} — ` : ""}
              <span className="italic text-gray-700 font-normal">{item.company}</span>
            </span>
            <span className="text-gray-500 font-normal">{item.dates}</span>
          </div>
          <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed font-serif">
            {item.bullets.map((bullet, bulletIdx) => {
              const bulletKey = `${jobKey}.${bulletIdx}`;
              const adds = tailored?.inlineAdditions?.[bulletKey];
              return (
                <li key={bulletIdx}>
                  <span className="text-gray-700 font-normal">{renderBullet(bullet, adds, showHighlights, bulletKey, originalBullets)}</span>
                </li>
              );
            })}
            {/* Kind B: New Bullets */}
            {tailored?.newBullets?.[jobKey]?.map((nb, idx) => (
              <li key={`nb-${idx}`} className={showHighlights ? "add-line" : ""}>
                <span className="text-gray-700 font-normal">{nb.text}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (item.kind === "edu") {
      return (
        <div key={jobKey} className="text-xs">
          <div className="flex justify-between items-baseline font-semibold">
            <h3 className="font-bold text-gray-900 print:text-black text-sm">{item.degree}</h3>
            <span className="text-gray-500 font-normal">{item.dates}</span>
          </div>
          <p className="text-gray-600 font-medium">{item.school}</p>
        </div>
      );
    }

    return null;
  };

  /**
   * Renders a full block
   */
  const renderBlock = (block: Block, blockIdx: number) => {
    if (block.kind === "header") return null;

    if (block.kind === "text") {
      const isSummary = block.label?.toLowerCase().includes("summary") || block.label?.toLowerCase().includes("profile");
      const adds = isSummary ? tailored?.inlineAdditions?.[`${blockIdx}.summary`] : undefined;

      if (templateStyle === "two-column") {
        return (
          <div key={blockIdx}>
            <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-2 font-sans">
              {block.label || "Profile"}
            </h2>
            <p className="text-xs text-neutral-700 leading-relaxed font-serif">
              {renderBullet(block.body, adds, showHighlights, `${blockIdx}.summary`, originalSummary ? [originalSummary] : [])}
            </p>
          </div>
        );
      }

      if (templateStyle === "tech") {
        return (
          <div key={blockIdx} className="mb-6 font-mono">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-2 print:text-black">
              // {block.label?.toUpperCase() || "SUMMARY"}
            </h2>
            <p className="text-xs leading-relaxed text-gray-300 print:text-gray-800 font-mono">
              {renderBullet(block.body, adds, showHighlights, `${blockIdx}.summary`, originalSummary ? [originalSummary] : [])}
            </p>
          </div>
        );
      }

      if (templateStyle === "executive") {
        return (
          <div key={blockIdx} className="mb-6 font-sans">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-2 print:text-black">
              {block.label || "Executive Summary"}
            </h2>
            <p className="text-xs leading-relaxed text-gray-700 font-normal">
              {renderBullet(block.body, adds, showHighlights, `${blockIdx}.summary`, originalSummary ? [originalSummary] : [])}
            </p>
          </div>
        );
      }

      return (
        <div key={blockIdx} className="mb-6 font-serif">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            {block.label || "Professional Summary"}
          </h2>
          <p className="text-xs leading-relaxed text-gray-750 font-serif">
            {renderBullet(block.body, adds, showHighlights, `${blockIdx}.summary`, originalSummary ? [originalSummary] : [])}
          </p>
        </div>
      );
    }

    if (block.kind === "section") {
      const isSkills = block.label.toLowerCase() === "skills";
      const isCertifications = block.label.toLowerCase() === "certifications";
      const isLanguages = block.label.toLowerCase() === "languages";

      if (isSkills) {
        const checkSkillHighlight = (sk: string): string => {
          if (!showHighlights || !normOriginal) return "";
          if (originalSkills.includes(sk.toLowerCase())) return "";
          return "add-skill";
        };

        if (templateStyle === "two-column") {
          return (
            <div key={blockIdx}>
              <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                {block.label}
              </h2>
              <ul className="list-none space-y-2.5 text-xs text-neutral-700 font-sans font-semibold">
                {block.items.map((skill, idx) => {
                  const name = skill.kind === "skill" ? skill.name : "";
                  const highlightCls = checkSkillHighlight(name);
                  return (
                    <li key={idx} className={highlightCls}>
                      {name}
                    </li>
                  );
                })}
                {/* Kind C: New Skills */}
                {tailored?.newSkills?.map((skill, idx) => (
                  <li key={`ns-${idx}`} className={showHighlights ? "add-skill" : ""}>
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (templateStyle === "tech") {
          return (
            <div key={blockIdx} className="mb-6 font-mono">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-2 print:text-black">
                // SKILLS
              </h2>
              <div className="flex flex-wrap gap-2">
                {block.items.map((skill, idx) => {
                  const name = skill.kind === "skill" ? skill.name : "";
                  const highlightCls = checkSkillHighlight(name);
                  const isNew = highlightCls === "add-skill";
                  return (
                    <span
                      key={idx}
                      className={isNew
                        ? "add-skill bg-[#e6efff] text-[#1f6feb] px-2 py-0.5 rounded text-xs border border-[#1f6feb] font-semibold"
                        : "bg-[#2a2a2e] text-green-400 px-2 py-0.5 rounded text-xs border border-[#3e3e44] print:bg-gray-100 print:text-black print:border-gray-300"
                      }
                    >
                      {name}
                    </span>
                  );
                })}
                {/* Kind C: New Skills */}
                {tailored?.newSkills?.map((skill, idx) => (
                  <span
                    key={`ns-${idx}`}
                    className={showHighlights 
                      ? "add-skill bg-[#e6efff] text-[#1f6feb] px-2 py-0.5 rounded text-xs border border-[#1f6feb] font-semibold"
                      : "bg-[#2a2a2e] text-green-400 px-2 py-0.5 rounded text-xs border border-[#3e3e44] print:bg-gray-100 print:text-black print:border-gray-300"
                    }
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        if (templateStyle === "executive") {
          return (
            <div key={blockIdx} className="mb-6 font-sans">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-2 print:text-black">
                Key Expertise
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {block.items.map((skill, idx) => {
                  const name = skill.kind === "skill" ? skill.name : "";
                  const highlightCls = checkSkillHighlight(name);
                  const isNew = highlightCls === "add-skill";
                  return (
                    <span
                      key={idx}
                      className={isNew
                        ? "add-skill bg-[#e6efff] text-[#1f6feb] px-2.5 py-1 rounded text-xs font-bold border border-[#1f6feb]"
                        : "bg-[#f0f4ff] text-[#1e3a8a] px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black print:border print:border-gray-200"
                      }
                    >
                      {name}
                    </span>
                  );
                })}
                {/* Kind C: New Skills */}
                {tailored?.newSkills?.map((skill, idx) => (
                  <span
                    key={`ns-${idx}`}
                    className={showHighlights
                      ? "add-skill bg-[#e6efff] text-[#1f6feb] px-2.5 py-1 rounded text-xs font-bold border border-[#1f6feb]"
                      : "bg-[#f0f4ff] text-[#1e3a8a] px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black print:border print:border-gray-200"
                    }
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        // Classic/Default skills
        return (
          <div key={blockIdx} className="mb-6 font-sans">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5 font-sans">
              Skills
            </h2>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-700 leading-relaxed">
              {block.items.map((skill, idx) => {
                const name = skill.kind === "skill" ? skill.name : "";
                const highlightCls = checkSkillHighlight(name);
                const isNew = highlightCls === "add-skill";
                return (
                  <span key={idx} className={isNew ? "add-skill text-[#1f6feb] font-bold" : ""}>
                    {name}{idx < block.items.length - 1 ? "," : ""}
                  </span>
                );
              })}
              {tailored?.newSkills?.map((skill, idx) => (
                <span key={`ns-${idx}`} className={showHighlights ? "add-skill text-[#1f6feb] font-bold" : ""}>
                  , {skill}
                </span>
              ))}
            </div>
          </div>
        );
      }

      if (isCertifications || isLanguages) {
        const title = block.label;
        return (
          <div key={blockIdx} className="mb-4">
            <h2 className={templateStyle === "two-column" 
              ? "text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans"
              : templateStyle === "tech"
              ? "text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black font-mono"
              : templateStyle === "executive"
              ? "text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black font-sans"
              : "text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5 font-sans"
            }>
              {templateStyle === "tech" ? `// ${title.toUpperCase()}` : title}
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-700">
              {block.items.map((it, idx) => (
                <li key={idx} className={templateStyle === "tech" ? "list-none text-gray-300 font-mono" : "text-gray-700"}>
                  {templateStyle === "tech" && <span className="text-green-500 select-none mr-2 font-mono">&#62;</span>}
                  {it.kind === "line" ? it.text : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      }

      // Experience, Education, Projects
      return (
        <div key={blockIdx} className="space-y-4 mb-6">
          <h2 className={templateStyle === "two-column"
            ? "text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans"
            : templateStyle === "tech"
            ? "text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black font-mono"
            : templateStyle === "executive"
            ? "text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black font-sans"
            : "text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 border-b border-gray-300 pb-0.5 font-sans"
          }>
            {templateStyle === "tech" ? `// ${block.label.toUpperCase()}` : block.label}
          </h2>
          <div className="space-y-6">
            {block.items.map((item, itemIdx) => renderItem(item, blockIdx, itemIdx))}
          </div>
        </div>
      );
    }

    return null;
  };

  // ── TWO-COLUMN GRID ASSEMBLY ──────────────────────────────────────────────
  if (templateStyle === "two-column") {
    const leftBlocks = normResume.blocks.filter(b =>
      b.kind === "text" ||
      (b.kind === "section" && ["experience", "education", "projects", "achievements", "key achievements"].includes(b.label.toLowerCase()))
    );

    const rightBlocks = normResume.blocks.filter(b =>
      b.kind === "section" && ["skills", "certifications", "languages"].includes(b.label.toLowerCase())
    );

    return (
      <div
        id={id}
        className="bg-white text-gray-900 p-8 max-w-[820px] mx-auto text-sm print:p-0 print:border-none print:shadow-none font-serif"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-left">
            <h1 className="text-4xl font-extrabold tracking-tight text-black font-serif">
              {fullName}
            </h1>
          </div>
          <div className="text-left text-xs text-black font-sans space-y-1.5 font-bold">
            {phone && (
              <div className="flex items-center gap-2 justify-end">
                <Phone size={14} className="text-black shrink-0" />
                <span>{phone}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2 justify-end">
                <Mail size={14} className="text-black shrink-0" />
                <span className="break-all">{email}</span>
              </div>
            )}
            {linkedin && (
              <div className="flex items-center gap-2 justify-end">
                <Linkedin size={14} className="text-black shrink-0" />
                <span>{linkedin.replace(/https?:\/\/(www\.)?/, "")}</span>
              </div>
            )}
            {website && (
              <div className="flex items-center gap-2 justify-end">
                <Globe size={14} className="text-black shrink-0" />
                <span>{website.replace(/https?:\/\/(www\.)?/, "")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-left">
          {/* Left Column */}
          <div className="md:col-span-8 space-y-6">
            {leftBlocks.map((block) => renderBlock(block, normResume.blocks.indexOf(block)))}
          </div>

          {/* Right Column */}
          <div className="md:col-span-4 space-y-6">
            {rightBlocks.map((block) => renderBlock(block, normResume.blocks.indexOf(block)))}
          </div>
        </div>

        {/* Kind D: Appended New Sections */}
        {tailored?.newSections?.map((sec, secIdx) => {
          const sectionCls = showHighlights ? "add-block text-left mt-8" : "text-left mt-8";
          return (
            <section key={`new-sec-${secIdx}`} className={sectionCls}>
              <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                {sec.label}
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-700 font-serif">
                {sec.items.map((it, itIdx) => (
                  <li key={itIdx}>{it.kind === "line" ? it.text : ""}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  // ── SINGLE COLUMN ASSEMBLY ────────────────────────────────────────────────
  const containerClass = templateStyle === "tech"
    ? "bg-[#121214] text-gray-200 p-8 font-mono max-w-[800px] mx-auto border border-[#27272a] shadow-lg rounded-lg text-sm print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
    : templateStyle === "executive"
    ? "bg-white text-gray-950 p-8 font-sans max-w-[800px] mx-auto border-t-8 border-[#1e3a8a] shadow-lg rounded-lg text-sm print:p-0 print:border-none print:shadow-none"
    : "bg-white text-gray-900 p-8 font-serif max-w-[800px] mx-auto border border-gray-200 shadow-md rounded-lg text-sm print:p-0 print:border-none print:shadow-none";

  const headerClass = templateStyle === "tech"
    ? "border-b-2 border-green-500 pb-4 mb-6 text-left"
    : templateStyle === "executive"
    ? "text-center pb-6 mb-6 border-b border-gray-200"
    : "text-center pb-5 mb-5 border-b border-gray-200";

  return (
    <div id={id} className={containerClass}>
      <div className={headerClass}>
        {templateStyle === "tech" ? (
          <>
            <h1 className="text-2xl font-bold uppercase tracking-wider text-green-400 print:text-black font-mono">
              {fullName}
            </h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400 print:text-gray-700 font-mono">
              {email && <span><span className="text-green-500 font-bold">&#62;</span> {email}</span>}
              {phone && <span><span className="text-green-500 font-bold">&#62;</span> {phone}</span>}
              {linkedin && <span><span className="text-green-500 font-bold">&#62;</span> {linkedin.replace(/https?:\/\/(www\.)?/, "")}</span>}
              {website && <span><span className="text-green-500 font-bold">&#62;</span> {website.replace(/https?:\/\/(www\.)?/, "")}</span>}
            </div>
          </>
        ) : templateStyle === "executive" ? (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1e3a8a] print:text-black font-sans">
              {fullName}
            </h1>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-600 print:text-gray-700 font-sans">
              {email && <span className="flex items-center gap-1 font-medium"><Mail className="w-3.5 h-3.5 text-[#1e3a8a]" /> {email}</span>}
              {phone && <span className="flex items-center gap-1 font-medium"><Phone className="w-3.5 h-3.5 text-[#1e3a8a]" /> {phone}</span>}
              {linkedin && <span className="flex items-center gap-1 font-medium"><Linkedin className="w-3.5 h-3.5 text-[#1e3a8a]" /> {linkedin.replace(/https?:\/\/(www\.)?/, "")}</span>}
              {website && <span className="flex items-center gap-1 font-medium"><Globe className="w-3.5 h-3.5 text-[#1e3a8a]" /> {website.replace(/https?:\/\/(www\.)?/, "")}</span>}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-normal tracking-wide text-gray-900 uppercase font-serif">
              {fullName}
            </h1>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2.5 text-xs text-gray-500 font-sans">
              {email && <span>{email}</span>}
              {email && (phone || linkedin || website) && <span className="text-gray-300">|</span>}
              {phone && <span>{phone}</span>}
              {phone && (linkedin || website) && <span className="text-gray-300">|</span>}
              {linkedin && <span>{linkedin.replace(/https?:\/\/(www\.)?/, "")}</span>}
              {linkedin && website && <span className="text-gray-300">|</span>}
              {website && <span>{website.replace(/https?:\/\/(www\.)?/, "")}</span>}
            </div>
          </>
        )}
      </div>

      <div className="text-left space-y-6">
        {normResume.blocks.map((block, idx) => renderBlock(block, idx))}
      </div>

      {/* Kind D: Appended New Sections */}
      {tailored?.newSections?.map((sec, secIdx) => {
        const sectionCls = showHighlights ? "add-block text-left mt-6" : "text-left mt-6";
        return (
          <section key={`new-sec-${secIdx}`} className={sectionCls}>
            <h2 className={templateStyle === "tech"
              ? "text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black font-mono"
              : templateStyle === "executive"
              ? "text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black font-sans"
              : "text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5 font-sans"
            }>
              {templateStyle === "tech" ? `// ${sec.label.toUpperCase()}` : sec.label}
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-xs text-neutral-700">
              {sec.items.map((it, itIdx) => (
                <li key={itIdx} className={templateStyle === "tech" ? "list-none text-gray-300 font-mono" : "text-gray-700 font-sans"}>
                  {templateStyle === "tech" && <span className="text-green-500 select-none mr-2">&#62;</span>}
                  {it.kind === "line" ? it.text : ""}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
