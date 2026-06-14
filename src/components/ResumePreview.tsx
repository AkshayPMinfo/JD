import React from "react";
import { ResumeStructure } from "../types";
import { Mail, Phone, Linkedin, Globe, Award, Briefcase, GraduationCap } from "lucide-react";

interface ResumePreviewProps {
  resume: ResumeStructure;
  templateStyle: "classic" | "tech" | "executive";
  id?: string;
}

export default function ResumePreview({ resume, templateStyle, id = "resume-preview-sheet" }: ResumePreviewProps) {
  const { fullName, email, phone, linkedin, website, summary, workExperience, education, skills } = resume;

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
            {summary ? "Candidate / Profile Optimized" : "Entry Level Graduate Resume"}
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
              // PROFILE SUMMARY
            </h2>
            <p className="text-xs leading-relaxed text-gray-300 print:text-gray-800">{summary}</p>
          </div>
        )}

        {/* Skills Console */}
        {skills && skills.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#00ff66] mb-2 print:text-black">
              // CORE STACK
            </h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, index) => (
                <span
                  key={index}
                  className="bg-[#2a2a2e] text-green-400 px-2 py-0.5 rounded text-xs border border-[#3e3e44] print:bg-gray-100 print:text-black print:border-gray-300"
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
                      <li key={idx} className="text-xs text-gray-300 leading-relaxed print:text-gray-800 flex items-start gap-1">
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
          <div className="mb-4">
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
            <p className="text-xs leading-relaxed text-gray-700 font-normal">{summary}</p>
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
                  className="bg-[#f0f4ff] text-[#1e3a8a] px-2.5 py-1 rounded text-xs font-semibold print:bg-gray-100 print:text-black print:border print:border-gray-200"
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
                      <li key={idx}>
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
          <div className="mb-4">
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
          <p className="text-xs leading-relaxed text-gray-700">{summary}</p>
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
                    <li key={idx}>
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
          <p className="text-xs text-gray-700 leading-relaxed">
            {skills.join(", ")}
          </p>
        </div>
      )}

      {/* Education Section */}
      {education && education.length > 0 && (
        <div className="mb-4 font-sans">
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
    </div>
  );
}
