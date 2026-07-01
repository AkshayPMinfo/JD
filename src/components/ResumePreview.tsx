import React from "react";
import { ResumeStructure } from "../types";
import { Mail, Phone, Linkedin, Globe } from "lucide-react";

interface ResumePreviewProps {
  resume: ResumeStructure;
  templateStyle: "classic" | "tech" | "executive" | "two-column";
  id?: string;
  originalResume?: ResumeStructure;
}

export default function ResumePreview({ resume, templateStyle, id = "resume-preview-sheet", originalResume }: ResumePreviewProps) {
  const { fullName, email, phone, linkedin, website, summary, workExperience, education, skills } = resume;

  // Custom highlights helper
  const getHighlightStyle = (section: "summary" | "skills" | "experience-bullet" | "project-bullet", value: string): string => {
    if (!originalResume) return "";
    
    if (section === "summary") {
      return originalResume.summary !== resume.summary ? "bg-yellow-100 dark:bg-yellow-950/45 text-yellow-900 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800 px-1.5 py-0.5 rounded print:bg-transparent print:text-black print:border-none print:p-0" : "";
    }
    
    if (section === "skills") {
      const originalSkills = (originalResume.skills || []).map(s => s.toLowerCase());
      return !originalSkills.includes(value.toLowerCase()) ? "bg-blue-100 dark:bg-blue-950/45 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-800 px-2 py-0.5 rounded print:bg-transparent print:text-black print:border-none print:p-0" : "";
    }
    
    if (section === "experience-bullet") {
      const allOriginalBullets = (originalResume.workExperience || []).flatMap(exp => exp.description || []).map(b => b.trim().toLowerCase());
      return !allOriginalBullets.includes(value.trim().toLowerCase()) ? "bg-yellow-100 dark:bg-yellow-950/45 text-yellow-900 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800 px-1.5 py-0.5 rounded print:bg-transparent print:text-black print:border-none print:p-0 block" : "";
    }
    
    if (section === "project-bullet") {
      const allOriginalBullets = (originalResume.projects || []).flatMap(proj => proj.description || []).map(b => b.trim().toLowerCase());
      return !allOriginalBullets.includes(value.trim().toLowerCase()) ? "bg-yellow-100 dark:bg-yellow-950/45 text-yellow-900 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800 px-1.5 py-0.5 rounded print:bg-transparent print:text-black print:border-none print:p-0 block" : "";
    }
    
    return "";
  };

  // Render different styles based on template
  if (templateStyle === "two-column") {
    return (
      <div
        id={id}
        className="bg-white text-gray-900 p-8 max-w-[820px] mx-auto text-sm print:p-0 print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-left">
            <h1 className="text-4xl font-extrabold tracking-tight text-black font-serif">
              {fullName || "Your Name"}
            </h1>
          </div>
          <div className="text-right text-xs text-black font-sans space-y-1 font-bold">
            {phone && <p>{phone}</p>}
            {email && <p className="break-all max-w-[240px]">{email}</p>}
            {linkedin && <p>{linkedin.replace(/https?:\/\/(www\.)?/, "")}</p>}
            {website && <p>{website.replace(/https?:\/\/(www\.)?/, "")}</p>}
          </div>
        </div>

        {/* Content columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-left">
          {/* Left Column - Summary & Experience */}
          <div className="md:col-span-8 space-y-6">
            {summary && (
              <div className={getHighlightStyle("summary", summary)}>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-2 font-sans">
                  Professional Summary
                </h2>
                <p className="text-xs text-neutral-700 leading-relaxed font-serif">{summary}</p>
              </div>
            )}

            {workExperience && workExperience.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Experience
                </h2>
                <div className="space-y-6">
                  {workExperience.map((exp) => (
                    <div key={exp.id} className="font-serif">
                      <h3 className="font-bold text-black text-sm">
                        <span>{exp.company}</span>
                        <span className="text-gray-400 font-normal font-sans mx-1.5">—</span>
                        <span className="italic font-bold text-neutral-800">{exp.role}</span>
                      </h3>
                      <p className="text-[11px] text-neutral-500 font-semibold font-sans mt-0.5">{exp.duration}</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-neutral-700 leading-relaxed font-serif">
                        {exp.description.map((bullet, idx) => (
                          <li key={idx} className={getHighlightStyle("experience-bullet", bullet)}>
                            <span className="text-neutral-700">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resume.projects && resume.projects.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Projects
                </h2>
                <div className="space-y-4">
                  {resume.projects.map((proj) => (
                    <div key={proj.id} className="font-serif">
                      <h3 className="font-bold text-black text-sm">{proj.name}</h3>
                      <ul className="list-disc pl-5 mt-1.5 space-y-1 text-xs text-neutral-700 leading-relaxed font-serif">
                        {proj.description.map((bullet, idx) => (
                          <li key={idx} className={getHighlightStyle("project-bullet", bullet)}>
                            <span className="text-neutral-700">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {education && education.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Education
                </h2>
                <div className="space-y-4">
                  {education.map((edu) => (
                    <div key={edu.id} className="font-serif">
                      <h3 className="font-bold text-black text-sm">{edu.degree}</h3>
                      <p className="text-neutral-700 text-xs mt-0.5">{edu.school}</p>
                      <p className="text-[10px] text-neutral-500 font-semibold font-sans mt-0.5">{edu.duration} {edu.gpa && <span>| GPA: {edu.gpa}</span>}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resume.achievements && resume.achievements.length > 0 && (
              <div className="mt-6">
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Achievements & Awards
                </h2>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-neutral-700 leading-relaxed font-serif">
                  {resume.achievements.map((ach, index) => (
                    <li key={index}>
                      <span>{ach}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right Column - Skills & Languages */}
          <div className="md:col-span-4 space-y-6">
            {skills && skills.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Skills
                </h2>
                <ul className="list-none space-y-2 text-xs text-neutral-700 font-sans font-semibold">
                  {skills.map((skill, index) => (
                    <li key={index} className={getHighlightStyle("skills", skill)}>{skill}</li>
                  ))}
                </ul>
              </div>
            )}

            {resume.certifications && resume.certifications.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Certifications
                </h2>
                <ul className="list-disc pl-5 space-y-2 text-xs text-neutral-700 font-sans font-semibold">
                  {resume.certifications.map((cert, index) => (
                    <li key={index}>{cert}</li>
                  ))}
                </ul>
              </div>
            )}

            {resume.languages && resume.languages.length > 0 && (
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-blue-600 mb-4 font-sans">
                  Languages
                </h2>
                <ul className="list-disc pl-5 space-y-2 text-xs text-neutral-700 font-sans font-semibold">
                  {resume.languages.map((lang, index) => (
                    <li key={index}>{lang}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render different styles based on template
  if (templateStyle === "tech") {
    return (
      <div
        id={id}
        className="bg-[#121214] text-gray-200 p-8 font-mono max-w-[800px] mx-auto border border-[#27272a] shadow-lg rounded-lg text-sm print:bg-white print:text-black print:p-0 print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="border-b-2 border-green-500 pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-green-400 print:text-black">
            {fullName || "Your Name"}
          </h1>
          <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest">
            {workExperience?.[0]?.role || "Resume Profile"}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-400 print:text-gray-700">
            {email && (
              <span className="flex items-center gap-1">
                <span className="text-green-500 font-bold">&#62;</span> {email}
              </span>
            )}
            {phone && (
              <span className="flex items-center gap-1">
                <span className="text-green-500 font-bold">&#62;</span> {phone}
              </span>
            )}
            {linkedin && (
              <span className="flex items-center gap-1">
                <span className="text-green-500 font-bold">&#62;</span> {linkedin.replace(/https?:\/\/(www\.)?/, "")}
              </span>
            )}
            {website && (
              <span className="flex items-center gap-1">
                <span className="text-green-500 font-bold">&#62;</span> {website.replace(/https?:\/\/(www\.)?/, "")}
              </span>
            )}
          </div>
        </div>

        {/* Profile Summary */}
        {summary && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-2 print:text-black">
              // SUMMARY
            </h2>
            <p className={`text-xs leading-relaxed text-gray-300 print:text-gray-800 ${getHighlightStyle("summary", summary)}`}>{summary}</p>
          </div>
        )}

        {/* Skills Console */}
        {skills && skills.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-2 print:text-black">
              // SKILLS
            </h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, index) => (
                <span
                  key={index}
                  className={`bg-[#2a2a2e] text-green-400 px-2 py-0.5 rounded text-xs border border-[#3e3e44] print:bg-gray-100 print:text-black print:border-gray-300 ${getHighlightStyle("skills", skill)}`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Experience Section */}
        {workExperience && workExperience.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // WORK EXPERIENCE
            </h2>
            <div className="space-y-4">
              {workExperience.map((exp) => (
                <div key={exp.id} className="border-l-2 border-[#2a2a2e] pl-4 print:border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline">
                    <h3 className="font-bold text-gray-100 text-sm print:text-black">
                      {exp.role} <span className="text-green-500">@ {exp.company}</span>
                    </h3>
                    <span className="text-xs text-gray-500 print:text-gray-600 font-semibold">{exp.duration}</span>
                  </div>
                  <ul className="list-none space-y-1.5 mt-2">
                    {exp.description.map((bullet, idx) => (
                      <li key={idx} className={`text-xs text-gray-300 leading-relaxed print:text-gray-800 flex items-start gap-1 ${getHighlightStyle("experience-bullet", bullet)}`}>
                        <span className="text-green-500 select-none">-</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects Section */}
        {resume.projects && resume.projects.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // SELECTED PROJECTS
            </h2>
            <div className="space-y-4">
              {resume.projects.map((proj) => (
                <div key={proj.id} className="border-l-2 border-[#2a2a2e] pl-4 print:border-gray-200">
                  <h3 className="font-bold text-gray-100 text-sm print:text-black">
                    {proj.name}
                  </h3>
                  <ul className="list-none space-y-1.5 mt-2">
                    {proj.description.map((bullet, idx) => (
                      <li key={idx} className={`text-xs text-gray-300 leading-relaxed print:text-gray-800 flex items-start gap-1 ${getHighlightStyle("project-bullet", bullet)}`}>
                        <span className="text-green-500 select-none">-</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education Section */}
        {education && education.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // EDUCATION
            </h2>
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id} className="text-xs">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-gray-200 print:text-black">{edu.degree}</h3>
                    <span className="text-gray-500 print:text-gray-600">{edu.duration}</span>
                  </div>
                  <p className="text-gray-400 print:text-gray-700">
                    {edu.school} {edu.gpa && <span className="text-green-500">| GPA: {edu.gpa}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications Section */}
        {resume.certifications && resume.certifications.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // CERTIFICATIONS
            </h2>
            <ul className="list-none space-y-1.5 text-xs text-gray-300 print:text-gray-800">
              {resume.certifications.map((cert, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-green-500 select-none">&#62;</span>
                  <span>{cert}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Languages Section */}
        {resume.languages && resume.languages.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // LANGUAGES
            </h2>
            <ul className="list-none space-y-1.5 text-xs text-gray-300 print:text-gray-800">
              {resume.languages.map((lang, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-green-500 select-none">&#62;</span>
                  <span>{lang}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {resume.achievements && resume.achievements.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-3 print:text-black">
              // ACHIEVEMENTS
            </h2>
            <ul className="list-none space-y-1.5 text-xs text-gray-300 print:text-gray-800">
              {resume.achievements.map((ach, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-green-500 select-none">&#62;</span>
                  <span>{ach}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (templateStyle === "executive") {
    return (
      <div
        id={id}
        className="bg-white text-gray-950 p-8 font-sans max-w-[800px] mx-auto border-t-8 border-[#1e3a8a] shadow-lg rounded-lg print:p-0 print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="text-center pb-6 mb-6 border-b border-gray-200">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1e3a8a] print:text-black">
            {fullName || "Your Name"}
          </h1>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-600 print:text-gray-700">
            {email && (
              <span className="flex items-center gap-1 font-medium">
                <Mail className="w-3.5 h-3.5 text-[#1e3a8a]" /> {email}
              </span>
            )}
            {phone && (
              <span className="flex items-center gap-1 font-medium">
                <Phone className="w-3.5 h-3.5 text-[#1e3a8a]" /> {phone}
              </span>
            )}
            {linkedin && (
              <span className="flex items-center gap-1 font-medium">
                <Linkedin className="w-3.5 h-3.5 text-[#1e3a8a]" /> {linkedin.replace(/https?:\/\/(www\.)?/, "")}
              </span>
            )}
            {website && (
              <span className="flex items-center gap-1 font-medium">
                <Globe className="w-3.5 h-3.5 text-[#1e3a8a]" /> {website.replace(/https?:\/\/(www\.)?/, "")}
              </span>
            )}
          </div>
        </div>

        {/* Profile Summary */}
        {summary && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-2 print:text-black">
              Executive Summary
            </h2>
            <p className={`text-xs leading-relaxed text-gray-700 font-normal ${getHighlightStyle("summary", summary)}`}>{summary}</p>
          </div>
        )}

        {/* Skills Section */}
        {skills && skills.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-2 print:text-black">
              Key Expertise
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill, index) => (
                <span
                  key={index}
                  className={`bg-[#f0f4ff] text-[#1e3a8a] px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black print:border print:border-gray-200 ${getHighlightStyle("skills", skill)}`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Experience Section */}
        {workExperience && workExperience.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Professional Experience
            </h2>
            <div className="space-y-4">
              {workExperience.map((exp) => (
                <div key={exp.id}>
                  <div className="flex justify-between items-baseline font-semibold">
                    <h3 className="text-sm text-[#111827]">
                      {exp.role} <span className="text-gray-500 font-normal">|</span> <span className="text-[#1e3a8a] font-bold">{exp.company}</span>
                    </h3>
                    <span className="text-xs text-gray-500 font-normal">{exp.duration}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed">
                    {exp.description.map((bullet, idx) => (
                      <li key={idx} className={getHighlightStyle("experience-bullet", bullet)}>
                        <span className="text-gray-700">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects Section */}
        {resume.projects && resume.projects.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Key Projects
            </h2>
            <div className="space-y-4">
              {resume.projects.map((proj) => (
                <div key={proj.id}>
                  <h3 className="text-sm font-bold text-[#111827]">{proj.name}</h3>
                  <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed">
                    {proj.description.map((bullet, idx) => (
                      <li key={idx} className={getHighlightStyle("project-bullet", bullet)}>
                        <span className="text-gray-700">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education Section */}
        {education && education.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Education
            </h2>
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id} className="text-xs">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-gray-800 print:text-black">{edu.degree}</h3>
                    <span className="text-gray-500">{edu.duration}</span>
                  </div>
                  <p className="text-gray-600 font-medium">
                    {edu.school} {edu.gpa && <span className="text-[#1e3a8a] font-semibold">| GPA: {edu.gpa}</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications Section */}
        {resume.certifications && resume.certifications.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Certifications
            </h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {resume.certifications.map((cert, index) => (
                <span key={index} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black">
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Languages Section */}
        {resume.languages && resume.languages.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Languages
            </h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {resume.languages.map((lang, index) => (
                <span key={index} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black">
                  {lang}
                </span>
              ))}
            </div>
          </div>
        )}
        {resume.achievements && resume.achievements.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1e3a8a] border-b border-gray-200 pb-1 mb-3 print:text-black">
              Key Achievements
            </h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {resume.achievements.map((ach, index) => (
                <span key={index} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black">
                  {ach}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Classic Minimalist
  return (
    <div
      id={id}
      className="bg-white text-gray-900 p-8 font-serif max-w-[800px] mx-auto border border-gray-200 shadow-md rounded-lg text-sm print:p-0 print:border-none print:shadow-none"
    >
      {/* Header */}
      <div className="text-center pb-5 mb-5 border-b border-gray-200">
        <h1 className="text-3xl font-normal tracking-wide text-gray-900 uppercase">
          {fullName || "Your Name"}
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
      </div>

      {/* Profile Summary */}
      {summary && (
        <div className="mb-6 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            Professional Summary
          </h2>
          <p className={`text-xs leading-relaxed text-gray-700 ${getHighlightStyle("summary", summary)}`}>{summary}</p>
        </div>
      )}

      {/* Experience Section */}
      {workExperience && workExperience.length > 0 && (
        <div className="mb-6 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 border-b border-gray-300 pb-0.5">
            Experience
          </h2>
          <div className="space-y-4">
            {workExperience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline font-medium text-xs">
                  <span className="font-semibold text-gray-900 text-sm">
                    {exp.role} — <span className="italic text-gray-700 font-normal">{exp.company}</span>
                  </span>
                  <span className="text-gray-500 font-normal">{exp.duration}</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed">
                  {exp.description.map((bullet, idx) => (
                    <li key={idx} className={getHighlightStyle("experience-bullet", bullet)}>
                      <span className="text-gray-700 font-normal">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Section */}
      {resume.projects && resume.projects.length > 0 && (
        <div className="mb-6 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 border-b border-gray-300 pb-0.5">
            Projects
          </h2>
          <div className="space-y-4">
            {resume.projects.map((proj) => (
              <div key={proj.id}>
                <div className="font-semibold text-gray-900 text-sm">{proj.name}</div>
                <ul className="list-disc pl-4 space-y-1 mt-2 text-xs text-gray-600 leading-relaxed">
                  {proj.description.map((bullet, idx) => (
                    <li key={idx} className={getHighlightStyle("project-bullet", bullet)}>
                      <span className="text-gray-700 font-normal">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills Section */}
      {skills && skills.length > 0 && (
        <div className="mb-6 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            Skills
          </h2>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-700 leading-relaxed">
            {skills.map((skill, idx) => (
              <span key={idx} className={getHighlightStyle("skills", skill)}>
                {skill}{idx < skills.length - 1 ? "," : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Education Section */}
      {education && education.length > 0 && (
        <div className="mb-6 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-3 border-b border-gray-300 pb-0.5">
            Education
          </h2>
          <div className="space-y-3">
            {education.map((edu) => (
              <div key={edu.id} className="text-xs">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-bold text-gray-800">{edu.degree}</h3>
                  <span className="text-gray-500">{edu.duration}</span>
                </div>
                <p className="text-gray-600">
                  {edu.school} {edu.gpa && <span>| GPA: {edu.gpa}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certifications Section */}
      {resume.certifications && resume.certifications.length > 0 && (
        <div className="mb-4 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            Certifications
          </h2>
          <p className="text-xs text-gray-700 leading-relaxed">
            {resume.certifications.join(", ")}
          </p>
        </div>
      )}

      {/* Languages Section */}
      {resume.languages && resume.languages.length > 0 && (
        <div className="mb-4 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            Languages
          </h2>
          <p className="text-xs text-gray-700 leading-relaxed">
            {resume.languages.join(", ")}
          </p>
        </div>
      )}

      {/* Achievements Section */}
      {resume.achievements && resume.achievements.length > 0 && (
        <div className="mb-4 font-sans">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2 border-b border-gray-300 pb-0.5">
            Key Achievements
          </h2>
          <p className="text-xs text-gray-700 leading-relaxed">
            {resume.achievements.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
