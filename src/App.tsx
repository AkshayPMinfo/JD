/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Sparkles,
  Upload,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Copy,
  Plus,
  Trash2,
  ChevronRight,
  Edit3,
  ListRestart,
  Save,
  Check,
  RotateCcw,
  Sparkle,
  Briefcase,
  GraduationCap,
  Award,
  Globe,
  Loader2,
  Lock,
  User,
  LogOut,
  FolderOpen
} from "lucide-react";
import {
  ResumeStructure,
  ResumeWorkExperience,
  ResumeEducation,
  SimplifiedJD,
  ResumeSuggestion,
  ATSCheckResult,
  SavedResumeVersion
} from "./types";
import { DEMO_RESUMES, DEMO_JDS } from "./demoData";
import ResumePreview from "./components/ResumePreview";

export default function App() {
  // --------- STATE ---------
  // User Authentication
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Resume Setup
  const [activeResume, setActiveResume] = useState<ResumeStructure>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_active_resume");
    return saved ? JSON.parse(saved) : DEMO_RESUMES.software_grad.data;
  });

  // Current Job Description
  const [jdText, setJdText] = useState(() => {
    return localStorage.getItem("jd_resume_customizer_jd") || DEMO_JDS.frontend_eng.text;
  });
  const [targetCompany, setTargetCompany] = useState("Vercel Systems");
  const [targetRole, setTargetRole] = useState("Junior Frontend Engineer");

  // Step Wizard: 'auth' | 'resume' | 'jd' | 'tailor' | 'saves'
  const [currentStep, setCurrentStep] = useState<"auth" | "resume" | "jd" | "tailor" | "saves">(() => {
    const savedUser = localStorage.getItem("jd_resume_customizer_user");
    return savedUser ? "resume" : "auth";
  });

  // AI Analysis states
  const [isSimplifyingJd, setIsSimplifyingJd] = useState(false);
  const [simplifiedJd, setSimplifiedJd] = useState<SimplifiedJD | null>(null);

  const [isTailoring, setIsTailoring] = useState(false);
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([]);
  const [originalResumeBackup, setOriginalResumeBackup] = useState<ResumeStructure | null>(null);

  const [isAuditingATS, setIsAuditingATS] = useState(false);
  const [atsResult, setAtsResult] = useState<ATSCheckResult | null>(null);

  // UI Customizations
  const [selectedStyle, setSelectedStyle] = useState<"classic" | "tech" | "executive">("tech");
  const [savedVersions, setSavedVersions] = useState<SavedResumeVersion[]>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_versions");
    return saved ? JSON.parse(saved) : [];
  });

  // Notification Banner
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Resume Form Editor states (for manual adjustments)
  const [isEditingForm, setIsEditingForm] = useState(false);

  // Draft Experience/Education for modal insertions
  const [draftExp, setDraftExp] = useState<ResumeWorkExperience>({
    id: "",
    role: "",
    company: "",
    duration: "",
    description: [""]
  });
  const [draftEdu, setDraftEdu] = useState<ResumeEducation>({
    id: "",
    degree: "",
    school: "",
    duration: ""
  });

  // Skill input helper
  const [newSkill, setNewSkill] = useState("");

  // --------- PERSISTENCE HELPERS ---------
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("jd_resume_customizer_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("jd_resume_customizer_user");
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_active_resume", JSON.stringify(activeResume));
  }, [activeResume]);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_jd", jdText);
  }, [jdText]);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(savedVersions));
  }, [savedVersions]);

  // Alert Helper
  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // --------- HANDLERS ---------
  // Auth simulation
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) {
      showNotification("Please provide a valid email address.", "error");
      return;
    }
    const name = authName || authEmail.split("@")[0];
    const userObj = { email: authEmail, name };
    setCurrentUser(userObj);
    showNotification(`Welcome, ${name}! Your resume dashboard is ready.`, "success");
    setCurrentStep("resume");
  };

  const handleOAuthSimulate = (provider: "google" | "linkedin" | "facebook") => {
    const name = provider === "google" ? "Alex Rivera (via Google)" : provider === "linkedin" ? "Sophia Vance (via LinkedIn)" : "Social Candidate";
    const email = `${provider.toLowerCase()}@candidate.org`;
    const userObj = { email, name };
    setCurrentUser(userObj);

    // Auto load appropriate presets for demonstration to build prompt satisfaction
    if (provider === "google") {
      setActiveResume(DEMO_RESUMES.software_grad.data);
    } else if (provider === "linkedin") {
      setActiveResume(DEMO_RESUMES.marketing_grad.data);
    }

    showNotification(`Signed in with ${provider.charAt(0).toUpperCase() + provider.slice(1)} successfully!`, "success");
    setCurrentStep("resume");
  };

  // Preset loaders
  const loadPresetResume = (key: "software_grad" | "marketing_grad") => {
    setActiveResume(DEMO_RESUMES[key].data);
    showNotification(`Loaded ${DEMO_RESUMES[key].label} Resume Template!`, "info");
  };

  const loadPresetJD = (key: "frontend_eng" | "growth_marketer") => {
    const p = DEMO_JDS[key];
    setJdText(p.text);
    setTargetCompany(p.company);
    setTargetRole(p.title);
    showNotification(`Loaded ${p.company} - ${p.title} job posting!`, "info");
  };

  // Custom JSON Upload
  const handleResumeJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.fullName && parsed.email && Array.isArray(parsed.workExperience)) {
          setActiveResume(parsed);
          showNotification("Successfully imported resume!", "success");
        } else {
          showNotification("Invalid resume structure. Please ensure name, email, and workExperience list exist.", "error");
        }
      } catch (err) {
        showNotification("Failed to parse JSON file.", "error");
      }
    };
    reader.readAsText(file);
  };

  // Manual Editor Actions
  const handleUpdateContact = (field: keyof ResumeStructure, value: any) => {
    setActiveResume(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddExperience = () => {
    if (!draftExp.role || !draftExp.company) {
      showNotification("Please set at least role and company.", "error");
      return;
    }
    const newExp: ResumeWorkExperience = {
      ...draftExp,
      id: "w-" + Date.now()
    };
    setActiveResume(prev => ({
      ...prev,
      workExperience: [...prev.workExperience, newExp]
    }));
    setDraftExp({ id: "", role: "", company: "", duration: "", description: [""] });
    showNotification("Work experience entry added!", "success");
  };

  const handleRemoveExperience = (id: string) => {
    setActiveResume(prev => ({
      ...prev,
      workExperience: prev.workExperience.filter(x => x.id !== id)
    }));
  };

  const handleAddEducation = () => {
    if (!draftEdu.degree || !draftEdu.school) {
      showNotification("Please fill in school name and degree.", "error");
      return;
    }
    const newEdu: ResumeEducation = {
      ...draftEdu,
      id: "e-" + Date.now()
    };
    setActiveResume(prev => ({
      ...prev,
      education: [...prev.education, newEdu]
    }));
    setDraftEdu({ id: "", degree: "", school: "", duration: "" });
    showNotification("Education entry added!", "success");
  };

  const handleRemoveEducation = (id: string) => {
    setActiveResume(prev => ({
      ...prev,
      education: prev.education.filter(x => x.id !== id)
    }));
  };

  const handleAddSkillTag = () => {
    if (newSkill.trim() && !activeResume.skills.includes(newSkill.trim())) {
      setActiveResume(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill("");
    }
  };

  const handleRemoveSkillTag = (skillToRemove: string) => {
    setActiveResume(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove)
    }));
  };

  // --------- API CALLS ---------

  // 1. JD Simplification and parsing
  const triggerJDAnaysis = async () => {
    if (!jdText.trim()) {
      showNotification("Please enter a job description to simplify first.", "error");
      return;
    }
    setIsSimplifyingJd(true);
    setSimplifiedJd(null);

    try {
      const response = await fetch("/api/simplify-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText })
      });
      if (!response.ok) {
        throw new Error("Simplify API server error code " + response.status);
      }
      const data = await response.json();
      setSimplifiedJd(data);
      showNotification("Successfully extracted simplified requirements!", "success");
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to simplify JD: ${err.message}`, "error");
    } finally {
      setIsSimplifyingJd(false);
    }
  };

  // 2. Custom Resume Tailor Call
  const triggerResumeTailor = async () => {
    if (!jdText.trim()) {
      showNotification("Please supply a job description on the previous step first.", "error");
      return;
    }
    setIsTailoring(true);
    setSuggestions([]);
    // Back up original in case they reject changes
    setOriginalResumeBackup({ ...activeResume });

    try {
      const response = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: activeResume, jdText })
      });
      if (!response.ok) {
        throw new Error("Tailoring API server error " + response.status);
      }
      const data = await response.json();
      // Wait for output content
      if (data.tailoredResume && data.suggestions) {
        setSuggestions(data.suggestions);
        // Automatically build a state where users can accept/reject suggestions
        // We present suggestions and let them click 'Apply'
        showNotification("Analyzed alignment standard and built tailored candidates!", "success");
      }
    } catch (err: any) {
      console.error(err);
      showNotification(`AI customization failed: ${err.message}`, "error");
    } finally {
      setIsTailoring(false);
    }
  };

  // 3. ATS Audit Integration
  const triggerATSAudit = async () => {
    setIsAuditingATS(true);
    setAtsResult(null);
    try {
      const response = await fetch("/api/ats-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: activeResume, jdText })
      });
      if (!response.ok) {
        throw new Error("ATS scan error code " + response.status);
      }
      const data = await response.json();
      setAtsResult(data);
      showNotification("ATS Compliance check completed successfully!", "success");
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed ATS Scan: ${err.message}`, "error");
    } finally {
      setIsAuditingATS(false);
    }
  };

  // Suggestion Actions: individual accepts/rejects
  const handleAcceptSuggestion = (sug: ResumeSuggestion) => {
    // Determine the section of suggestions and inject
    setActiveResume(prev => {
      const updated = { ...prev };
      if (sug.section === "summary") {
        updated.summary = sug.suggestedText;
      } else if (sug.section === "skills") {
        // Suggested text can be a comma list or single skill
        const splittedSks = sug.suggestedText.split(",").map(si => si.trim()).filter(Boolean);
        const newSet = Array.from(new Set([...updated.skills, ...splittedSks]));
        updated.skills = newSet;
      } else if (sug.section === "experience" && sug.targetId) {
        updated.workExperience = updated.workExperience.map(exp => {
          if (exp.id === sug.targetId) {
            // Replaced bullet points or matching role
            // If suggested text contains paragraphs/bullet tags, we break them up
            const bullets = sug.suggestedText.split("\n")
              .map(line => line.replace(/^-\s*/, "").trim())
              .filter(Boolean);
            return {
              ...exp,
              description: bullets.length > 0 ? bullets : [sug.suggestedText]
            };
          }
          return exp;
        });
      }
      return updated;
    });

    setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, applied: true } : s));
    showNotification("Accepted and applied recommendation!", "success");
  };

  const handleRejectSuggestion = (sugId: string) => {
    // Delete from listed screen suggestions
    setSuggestions(prev => prev.filter(s => s.id !== sugId));
    showNotification("Suggestion skipped.", "info");
  };

  const handleApplyAllSuggestions = () => {
    let count = 0;
    suggestions.forEach(sug => {
      if (!sug.applied) {
        handleAcceptSuggestion(sug);
        count++;
      }
    });
    showNotification(`Applied ${count} professional recommendations to your active format!`, "success");
  };

  // Restore Original Backup
  const handleRestoreBackup = () => {
    if (originalResumeBackup) {
      setActiveResume(originalResumeBackup);
      // Reset applied flag to false
      setSuggestions(prev => prev.map(s => ({ ...s, applied: false })));
      showNotification("Restored pre-tailored original draft.", "info");
    }
  };

  // Save Version and label it by Company and Role
  const handleSaveCurrentVersion = () => {
    if (!targetCompany.trim() || !targetRole.trim()) {
      showNotification("Please set target company and job title labels first.", "error");
      return;
    }
    const newVersion: SavedResumeVersion = {
      id: "v-" + Date.now(),
      companyName: targetCompany,
      jobTitle: targetRole,
      savedAt: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      resumeData: { ...activeResume },
      appliedSuggestionsCount: suggestions.filter(s => s.applied).length
    };
    setSavedVersions(prev => [newVersion, ...prev]);
    showNotification(`Saved version: "${targetCompany} - ${targetRole}" into version management drawer!`, "success");
  };

  const handleLoadVersion = (version: SavedResumeVersion) => {
    setActiveResume(version.resumeData);
    setTargetCompany(version.companyName);
    setTargetRole(version.jobTitle);
    showNotification(`Loaded version saved for ${version.companyName}!`, "info");
  };

  const handleDeleteVersion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedVersions(prev => prev.filter(v => v.id !== id));
    showNotification("Version removed from management.", "info");
  };

  // Exporters
  const handlePrintDownload = () => {
    // Triggers standard print screen with custom pure print target styling
    window.print();
  };

  const handleCopyText = () => {
    // Format customized resume output text
    let text = `${activeResume.fullName}\n${activeResume.email} | ${activeResume.phone}\n`;
    if (activeResume.linkedin) text += `LinkedIn: ${activeResume.linkedin}\n`;
    if (activeResume.website) text += `Portfolio: ${activeResume.website}\n`;
    text += `\n-- PROFESSIONAL SUMMARY --\n${activeResume.summary}\n`;
    text += `\n-- KEY SKILLS --\n${activeResume.skills.join(", ")}\n`;
    text += `\n-- EXPERIENCE --\n`;
    activeResume.workExperience.forEach(exp => {
      text += `\n${exp.role} - ${exp.company} (${exp.duration})\n`;
      exp.description.forEach(b => {
        text += `• ${b}\n`;
      });
    });
    text += `\n-- EDUCATION --\n`;
    activeResume.education.forEach(edu => {
      text += `${edu.degree} - ${edu.school} (${edu.duration})${edu.gpa ? ` | GPA: ${edu.gpa}` : ""}\n`;
    });

    navigator.clipboard.writeText(text);
    showNotification("Copied resume raw plain-text outline to your clipboard!", "success");
  };

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeResume, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${activeResume.fullName.replace(/\s+/g, "_")}_Tailored_${targetCompany.replace(/\s+/g, "_")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification("Downloaded JSON schema format resume!", "success");
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 font-sans antialiased overflow-x-hidden selection:bg-indigo-500 selection:text-white pb-12 print:bg-white print:pb-0">
      {/* Top Professional Header */}
      <nav id="navbar-top" className="border-b border-[#1e293b] bg-[#0f172a]/95 sticky top-0 z-55 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between print-hide">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-5 h-5 text-yellow-300 fill-yellow-300 animate-pulse" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg md:text-xl text-white tracking-tight flex items-center gap-2">
              JD to Resume <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Customizer</span>
            </h1>
            <p className="hidden md:block text-[10px] text-gray-400 font-mono">Tailored for Fresh Graduates & Entry-Level Job Seekers</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-gray-200">{currentUser.name}</span>
                <span className="text-[10px] text-gray-400">{currentUser.email}</span>
              </div>
              <button
                id="btn-sign-out"
                onClick={() => {
                  setCurrentUser(null);
                  setCurrentStep("auth");
                  showNotification("Signed out securely.", "info");
                }}
                className="p-1.5 md:px-3 md:py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition text-xs flex items-center gap-1 bg-slate-900 border border-[#1e293b]"
                title="Log out of customizer session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400 flex items-center gap-1.5 font-semibold bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
              <Lock className="w-3.5 h-3.5 text-indigo-400" /> Guest Session
            </span>
          )}
        </div>
      </nav>

      {/* Notification Banner */}
      {notification && (
        <div
          id="toast-notification"
          className={`fixed top-20 right-4 sm:right-6 z-50 flex items-center gap-3 p-3.5 rounded-xl border shadow-xl max-w-sm animate-bounce text-xs font-medium transition-all ${
            notification.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/30"
              : notification.type === "error"
              ? "bg-rose-950/90 text-rose-300 border-rose-500/30"
              : "bg-indigo-950/90 text-indigo-300 border-indigo-500/30"
          } print-hide`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : notification.type === "error" ? (
            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 print-hide">
        {/* Step Guide bar */}
        {currentUser && (
          <div id="step-wizard-indicator" className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest font-mono">Job Optimizer Flow</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <button
                id="tab-step-resume"
                onClick={() => setCurrentStep("resume")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-display transition ${
                  currentStep === "resume" ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800/80 text-[10px] flex items-center justify-center font-bold">1</span>
                Resume Setup
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-700 hidden sm:block" />
              <button
                id="tab-step-jd"
                onClick={() => setCurrentStep("jd")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-display transition ${
                  currentStep === "jd" ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800/80 text-[10px] flex items-center justify-center font-bold">2</span>
                Job Analysis
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-700 hidden sm:block" />
              <button
                id="tab-step-tailor"
                onClick={() => setCurrentStep("tailor")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-display transition ${
                  currentStep === "tailor" ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800/80 text-[10px] flex items-center justify-center font-bold">3</span>
                Simplify & Tailor
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-700 hidden sm:block" />
              <button
                id="tab-step-saves"
                onClick={() => setCurrentStep("saves")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-display transition ${
                  currentStep === "saves" ? "bg-indigo-600/90 text-white shadow-md shadow-indigo-600/20" : "text-gray-400 hover:text-white"
                }`}
              >
                <Sparkle className="w-3.5 h-3.5 text-yellow-300 animate-pulse fill-yellow-300" />
                Saved Copies ({savedVersions.length})
              </button>
            </div>
          </div>
        )}

        {/* -------------------- STEP: AUTHENTICATION / WELCOME LANDING -------------------- */}
        {currentStep === "auth" && (
          <div id="auth-panel" className="max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-emerald-600/5 rounded-full blur-3xl"></div>

            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 bg-gradient-to-tr from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center mb-4 text-white shadow-xl">
                <Sparkles className="w-6 h-6 text-yellow-300" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight font-display">Let's Land That Dream Offer</h2>
              <p className="text-xs text-slate-400 mt-1">Sign-up to save resume variations, track multiple applications, and boost ATS keyword fit.</p>
            </div>

            {/* Social Authentication Simulator */}
            <div className="space-y-2 mb-6">
              <button
                id="btn-auth-linkedin"
                onClick={() => handleOAuthSimulate("linkedin")}
                className="w-full py-2.5 px-4 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/25 border border-[#0a66c2]/30 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition active:scale-[98%]"
              >
                <svg className="w-4 h-4 fill-[#0a66c2]" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                Sign In with LinkedIn
              </button>

              <button
                id="btn-auth-google"
                onClick={() => handleOAuthSimulate("google")}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition active:scale-[98%]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.418 0-6.198-2.78-6.198-6.198s2.78-6.198 6.198-6.198c1.526 0 2.916.553 4.004 1.48l3.1-3.1C18.8 2.43 15.7 1 12.24 1c-6.075 0-11 4.925-11 11s4.925 11 11 11c5.8 0 10.66-4.14 11-10h-11z" />
                </svg>
                Sign In with Google
              </button>

              <button
                id="btn-auth-facebook"
                onClick={() => handleOAuthSimulate("facebook")}
                className="w-full py-2.5 px-4 bg-[#1877f2]/10 hover:bg-[#1877f2]/25 border border-[#1877f2]/30 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition active:scale-[98%]"
              >
                <svg className="w-4 h-4 fill-[#1877f2]" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Continue with Facebook
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 border-t border-slate-800"></div>
              <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">or sign up with email</span>
              <div className="flex-1 border-t border-slate-800"></div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1 font-semibold tracking-wider">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      id="input-signup-name"
                      type="text"
                      placeholder="Alex Rivera"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 transition font-sans"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1 font-semibold tracking-wider">Email Address</label>
                <input
                  id="input-auth-email"
                  type="email"
                  required
                  placeholder="name@university.edu"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 transition font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono mb-1 font-semibold tracking-wider">Password</label>
                <input
                  id="input-auth-password"
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 transition font-sans"
                />
              </div>

              <button
                id="btn-auth-submit"
                type="submit"
                className="w-full py-2.5 hover:shadow-indigo-600/20 shadow-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition active:scale-[98%] mt-2 flex items-center justify-center gap-1"
              >
                <span>{isSignUp ? "Create Free Account" : "Access Optimizer Suite"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <div className="text-center mt-4">
                <button
                  id="btn-toggle-auth-mode"
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs text-indigo-400 hover:underline hover:text-indigo-300 font-medium"
                >
                  {isSignUp ? "Already have an account? Log In" : "Need an account? Sign Up for Free"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* -------------------- STEP 1: RESUME SETUP / BUILDER -------------------- */}
        {currentStep === "resume" && (
          <div id="step-resume-panel" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left side options Form / Preset Loader */}
            <div className="lg:col-span-5 space-y-6">
              {/* Import / Loader Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-600/5 rounded-full blur-xl"></div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 mb-3 font-display">
                  <FileText className="w-4 h-4 text-indigo-400" /> Pre-load Graduate Template
                </h3>
                <p className="text-xs text-slate-400 mb-4 font-normal">
                  Skip from scratch! Start immediately with one of our realistic entry-level fresher templates to experience instant customization.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    id="btn-preset-software"
                    onClick={() => loadPresetResume("software_grad")}
                    className={`p-3 rounded-xl border text-left transition font-sans cursor-pointer ${
                      activeResume.fullName === DEMO_RESUMES.software_grad.data.fullName
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <span className="block text-xs font-bold font-sans">Software Engineer</span>
                    <span className="block text-[10px] text-slate-400 mt-1">CS, Web Dev, JS, Databases</span>
                  </button>

                  <button
                    id="btn-preset-marketing"
                    onClick={() => loadPresetResume("marketing_grad")}
                    className={`p-3 rounded-xl border text-left transition font-sans cursor-pointer ${
                      activeResume.fullName === DEMO_RESUMES.marketing_grad.data.fullName
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <span className="block text-xs font-bold font-sans">Digital Marketer</span>
                    <span className="block text-[10px] text-slate-400 mt-1">SEO, Social, Writing</span>
                  </button>
                </div>

                {/* Raw JSON Upload option */}
                <div className="border-t border-[#1e293b] pt-4">
                  <label className="block text-xs font-bold text-slate-300 mb-2">Or Upload Existing Resume (.json)</label>
                  <label
                    id="drag-drop-zone"
                    className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-800 hover:border-indigo-600 rounded-xl bg-slate-950 cursor-pointer text-center transition group-hover:transition"
                  >
                    <Upload className="w-5 h-5 text-indigo-400 mb-1.5" />
                    <span className="text-xs font-semibold text-slate-300">Choose resume file</span>
                    <span className="text-[10px] text-slate-500 mt-0.5 font-mono">Custom JSON standard exports</span>
                    <input
                      id="input-file-upload"
                      type="file"
                      accept=".json"
                      onChange={handleResumeJsonUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Guided Manual Editing Form Drawer */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 font-display">
                    <Edit3 className="w-4 h-4 text-emerald-400" /> Create / Fine-tune Resume
                  </h3>
                  <button
                    id="btn-toggle-edit-form"
                    onClick={() => setIsEditingForm(!isEditingForm)}
                    className="px-2.5 py-1 text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 rounded-lg transition font-mono border border-slate-700"
                  >
                    {isEditingForm ? "Lock Form Fields" : "Open Form Editor"}
                  </button>
                </div>

                {isEditingForm ? (
                  <div className="space-y-4">
                    {/* Basic info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Full Name</label>
                        <input
                          id="form-full-name"
                          type="text"
                          value={activeResume.fullName}
                          onChange={(e) => handleUpdateContact("fullName", e.target.value)}
                          className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-sans mt-1"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Email</label>
                        <input
                          id="form-email"
                          type="email"
                          value={activeResume.email}
                          onChange={(e) => handleUpdateContact("email", e.target.value)}
                          className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-sans mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Phone</label>
                        <input
                          id="form-phone"
                          type="text"
                          value={activeResume.phone}
                          onChange={(e) => handleUpdateContact("phone", e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white font-sans mt-1"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">LinkedIn</label>
                        <input
                          id="form-linkedin"
                          type="text"
                          value={activeResume.linkedin || ""}
                          placeholder="linkedin.com/in/"
                          onChange={(e) => handleUpdateContact("linkedin", e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white font-sans mt-1"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Portfolio/Website</label>
                        <input
                          id="form-website"
                          type="text"
                          value={activeResume.website || ""}
                          placeholder="alexrivera.dev"
                          onChange={(e) => handleUpdateContact("website", e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-white font-sans mt-1"
                        />
                      </div>
                    </div>

                    {/* Professional Summary */}
                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Professional Summary</label>
                      <textarea
                        id="form-summary"
                        rows={3}
                        value={activeResume.summary}
                        onChange={(e) => handleUpdateContact("summary", e.target.value)}
                        className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-sans mt-1"
                        placeholder="Write a short recap bio of your graduate achievements..."
                      />
                    </div>

                    {/* Skills Tags Setup */}
                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 tracking-wider font-semibold uppercase">Skill Keywords / Core Stack</label>
                      <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2 max-h-32 overflow-y-auto bg-slate-950 border border-slate-950/50 p-2 rounded-lg">
                        {activeResume.skills.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-slate-850 border border-slate-800 text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1 group"
                          >
                            {tag}
                            <button
                              id={`btn-remove-skill-${tag}`}
                              type="button"
                              onClick={() => handleRemoveSkillTag(tag)}
                              className="text-slate-500 hover:text-red-400 text-[10px]"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          id="input-new-skill"
                          type="text"
                          placeholder="e.g. Next.js, SEO"
                          value={newSkill}
                          onChange={(e) => setNewSkill(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkillTag())}
                          className="flex-1 p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-sans font-normal"
                        />
                        <button
                          id="btn-add-skill-tag"
                          type="button"
                          onClick={handleAddSkillTag}
                          className="px-3 bg-indigo-600/80 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-semibold text-slate-200 transition"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Simple work experience insertion list */}
                    <div className="border-t border-[#1e293b] pt-4">
                      <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> Work Experience List ({activeResume.workExperience.length})
                      </h4>
                      <div className="space-y-2 mb-3">
                        {activeResume.workExperience.map((exp, expIdx) => (
                          <div key={exp.id} className="text-xs bg-slate-950 p-2 rounded-lg border border-slate-850 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-white">{exp.role}</p>
                              <p className="text-[10px] text-slate-400">{exp.company} | {exp.duration}</p>
                            </div>
                            <button
                              id={`btn-remove-exp-${exp.id}`}
                              type="button"
                              onClick={() => handleRemoveExperience(exp.id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="Delete work item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Add new experience input widget */}
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2 text-xs">
                        <p className="font-semibold text-slate-400 text-[10px] uppercase font-mono tracking-wider">Add Experience Item</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            id="exp-role"
                            type="text"
                            placeholder="Role / Title"
                            value={draftExp.role}
                            onChange={(e) => setDraftExp(prev => ({ ...prev, role: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                          <input
                            id="exp-company"
                            type="text"
                            placeholder="Company"
                            value={draftExp.company}
                            onChange={(e) => setDraftExp(prev => ({ ...prev, company: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            id="exp-duration"
                            type="text"
                            placeholder="Duration (e.g., 2024 - 2025)"
                            value={draftExp.duration}
                            onChange={(e) => setDraftExp(prev => ({ ...prev, duration: e.target.value }))}
                            className="col-span-2 p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                          <button
                            id="btn-add-experience"
                            type="button"
                            onClick={handleAddExperience}
                            className="bg-emerald-600/80 hover:bg-emerald-600 text-white rounded text-xs font-semibold"
                          >
                            Insert
                          </button>
                        </div>
                        <input
                          id="exp-bullet"
                          type="text"
                          placeholder="Accomplished X, measured by Y, by doing Z (Bullet point)"
                          value={draftExp.description[0]}
                          onChange={(e) => setDraftExp(prev => ({ ...prev, description: [e.target.value] }))}
                          className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white placeholder-slate-500"
                        />
                      </div>
                    </div>

                    {/* Simple education block */}
                    <div className="border-t border-[#1e293b] pt-4">
                      <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5 text-indigo-400" /> Education History ({activeResume.education.length})
                      </h4>
                      <div className="space-y-2 mb-3">
                        {activeResume.education.map((edu) => (
                          <div key={edu.id} className="text-xs bg-slate-950 p-2 rounded-lg border border-slate-850 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-white">{edu.degree}</p>
                              <p className="text-[10px] text-slate-400">{edu.school} | {edu.duration} {edu.gpa ? `| GPA: ${edu.gpa}` : ""}</p>
                            </div>
                            <button
                              id={`btn-remove-edu-${edu.id}`}
                              type="button"
                              onClick={() => handleRemoveEducation(edu.id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2 text-xs">
                        <p className="font-semibold text-slate-400 text-[10px] uppercase font-mono tracking-wider">Add Education Entry</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            id="edu-degree"
                            type="text"
                            placeholder="B.S. Computer Science"
                            value={draftEdu.degree}
                            onChange={(e) => setDraftEdu(prev => ({ ...prev, degree: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                          <input
                            id="edu-school"
                            type="text"
                            placeholder="College Name"
                            value={draftEdu.school}
                            onChange={(e) => setDraftEdu(prev => ({ ...prev, school: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            id="edu-duration"
                            type="text"
                            placeholder="Years (e.g., 2021-2025)"
                            value={draftEdu.duration}
                            onChange={(e) => setDraftEdu(prev => ({ ...prev, duration: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                          <input
                            id="edu-gpa"
                            type="text"
                            placeholder="GPA (e.g. 3.8/4.0)"
                            value={draftEdu.gpa || ""}
                            onChange={(e) => setDraftEdu(prev => ({ ...prev, gpa: e.target.value }))}
                            className="p-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                          <button
                            id="btn-add-education"
                            type="button"
                            onClick={handleAddEducation}
                            className="bg-emerald-600/80 hover:bg-emerald-600 text-white rounded text-xs font-semibold"
                          >
                            Insert
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-xs text-slate-400">Lock mode active. You can customize details inside the interactive forms.</p>
                    <button
                      id="btn-start-form-editor"
                      onClick={() => setIsEditingForm(true)}
                      className="mt-3 px-4 py-2 bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold rounded-xl transition"
                    >
                      Unlock Detailed Form Editor
                    </button>
                  </div>
                )}
              </div>

              {/* Progress CTA button */}
              <div className="pt-2 text-right">
                <button
                  id="btn-to-step-jd"
                  onClick={() => setCurrentStep("jd")}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition hover:shadow-lg hover:shadow-indigo-600/20 active:scale-[98%] flex items-center justify-center gap-1"
                >
                  <span>Lock Resume & Paste Job Poster</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right side live rendering */}
            <div className="lg:col-span-7">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
                  <span className="text-xs text-slate-400 font-mono">Live Document Preview</span>
                </div>
                {/* Visual template selector */}
                <div className="flex gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    id="theme-btn-tech"
                    onClick={() => setSelectedStyle("tech")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "tech" ? "bg-slate-800 text-white font-bold" : "text-gray-500 hover:text-white"}`}
                  >
                    Tech Monospace
                  </button>
                  <button
                    id="theme-btn-classic"
                    onClick={() => setSelectedStyle("classic")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "classic" ? "bg-slate-800 text-white font-bold" : "text-gray-500 hover:text-white"}`}
                  >
                    Classic Minimal
                  </button>
                  <button
                    id="theme-btn-executive"
                    onClick={() => setSelectedStyle("executive")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "executive" ? "bg-slate-800 text-white font-bold" : "text-gray-500 hover:text-white"}`}
                  >
                    Executive Navy
                  </button>
                </div>
              </div>

              {/* Styled Resume box container */}
              <div className="max-h-[750px] overflow-y-auto rounded-2xl scrollbar-none border border-slate-800 select-all">
                <ResumePreview resume={activeResume} templateStyle={selectedStyle} />
              </div>
            </div>
          </div>
        )}

        {/* -------------------- STEP 2: PASTE JOB DESCRIPTION & JD SIMPLIFIER -------------------- */}
        {currentStep === "jd" && (
          <div id="step-jd-panel" className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 rounded-full blur-2xl"></div>

              <div className="mb-4">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 font-display">
                  <BookOpen className="w-4 h-4 text-indigo-400 animate-bounce" /> Paste Job Description (JD)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  We'll extract exactly what hiring managers want to hear, translating corporate jargon into plain graduate objectives.
                </p>
              </div>

              {/* Target labels */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] uppercase font-mono text-slate-400 tracking-wider font-semibold">Target Company Name</label>
                  <input
                    id="input-target-company"
                    type="text"
                    required
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    placeholder="e.g. Vercel Systems"
                    className="w-full mt-1.5 p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-mono text-slate-400 tracking-wider font-semibold">Target Job Role/Title</label>
                  <input
                    id="input-target-role"
                    type="text"
                    required
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="Junior Frontend Engineer"
                    className="w-full mt-1.5 p-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-white"
                  />
                </div>
              </div>

              {/* Presets load bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-slate-950 rounded-xl border border-slate-850">
                <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold">Load Sample Job Template:</span>
                <button
                  id="btn-load-jd-frontend"
                  onClick={() => loadPresetJD("frontend_eng")}
                  className="px-2.5 py-1 text-[11px] bg-slate-900 border border-slate-800 text-slate-300 rounded hover:border-slate-750 hover:text-white transition cursor-pointer"
                >
                  Vercel Systems - Junior Frontend
                </button>
                <button
                  id="btn-load-jd-marketer"
                  onClick={() => loadPresetJD("growth_marketer")}
                  className="px-2.5 py-1 text-[11px] bg-slate-900 border border-slate-800 text-slate-300 rounded hover:border-slate-750 hover:text-white transition cursor-pointer"
                >
                  ScribeAI - Outreach Specialist
                </button>
              </div>

              {/* Raw Text inputs */}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-mono text-slate-400 tracking-wider font-semibold">Full Raw Job Post Content</label>
                <textarea
                  id="textarea-jd"
                  rows={8}
                  placeholder="Paste the full job posting text, including responsibilities, prerequisites, background summary..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 text-xs rounded-xl focus:border-indigo-500 outline-none text-slate-200 leading-relaxed font-sans"
                />
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  id="btn-back-to-resume-setup"
                  onClick={() => setCurrentStep("resume")}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                >
                  Back to Resume Setup
                </button>
                <button
                  id="btn-simplify-jd"
                  onClick={triggerJDAnaysis}
                  disabled={isSimplifyingJd || !jdText.trim()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 hover:shadow-lg hover:shadow-emerald-600/15"
                >
                  {isSimplifyingJd ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Simplifying and De-jargoning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Simplify Job Description</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Simplification Result Box */}
            {simplifiedJd && (
              <div id="simplified-jd-section" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 animate-pulse-once">
                <h3 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400 tracking-tight flex items-center gap-2 font-display">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Simplified Job Analysis
                </h3>

                {/* Company Pitch */}
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/10">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase font-mono tracking-wider mb-1">Company Elevator Pitch (No Jargon)</h4>
                  <p className="text-xs tracking-wide leading-relaxed text-slate-300 font-normal">
                    {simplifiedJd.companyPitch}
                  </p>
                </div>

                {/* Skills mapped out */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase font-mono tracking-wider mb-2">High Priority Required Core Stack</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").map((s, idx) => (
                        <span key={idx} className="bg-rose-950/40 border border-rose-500/20 text-rose-300 text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").length === 0 && (
                        <span className="text-[10px] text-slate-500 font-normal">None found.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase font-mono tracking-wider mb-2">Medium Priority / Preferred Skillsets</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").map((s, idx) => (
                        <span key={idx} className="bg-amber-950/40 border border-amber-500/20 text-amber-300 text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").length === 0 && (
                        <span className="text-[10px] text-slate-500 font-normal">None found.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Responsibilities list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase font-mono tracking-wider mb-2">What they expect you to do daily</h4>
                    <ul className="list-none space-y-1.5">
                      {simplifiedJd.keyResponsibilities.map((resp, idx) => (
                        <li key={idx} className="text-xs text-slate-350 leading-relaxed flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-indigo-400 uppercase font-mono tracking-wider mb-2">Graduate Behavioral Expectations</h4>
                    <ul className="list-none space-y-1.5">
                      {simplifiedJd.candidateExpectations.map((exp, idx) => (
                        <li key={idx} className="text-xs text-slate-350 leading-relaxed flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{exp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Automation keywords tags */}
                <div className="border-t border-[#1e293b] pt-4">
                  <h4 className="text-xs font-bold text-blue-400 uppercase font-mono tracking-wider mb-2">Target ATS Keyword Search Terms (Pass Filters)</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {simplifiedJd.keywordsToTarget.map((kw, idx) => (
                      <span key={idx} className="text-[10px] bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full font-mono">
                        # {kw}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Progress Tailor CTA */}
                <div className="pt-2 text-right">
                  <button
                    id="btn-tailwind-go-step-tailor"
                    onClick={() => {
                      setCurrentStep("tailor");
                      triggerResumeTailor();
                    }}
                    className="py-3 px-6 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/15 transition active:scale-[98%] flex inline-flex items-center gap-1 justify-center"
                  >
                    <span>Proceed to Custom Tailoring Engine</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------------------- STEP 3: RESUME TAILORING INTERFACE -------------------- */}
        {currentStep === "tailor" && (
          <div id="step-tailor-panel" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Interactive Suggestion list & ATS Auditing tool */}
            <div className="lg:col-span-5 space-y-6">
              {/* Main Tailoring Trigger / Status Widget */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-600/5 rounded-full blur-2xl"></div>

                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 font-display">
                    <Sparkles className="w-4 h-4 text-indigo-400" /> Resume Personalization
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Comparing resume metrics against <b>{targetCompany || "Employer"}</b> requirements. Click Apply on suggestions.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    id="btn-re-tailor"
                    onClick={triggerResumeTailor}
                    disabled={isTailoring}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition text-center flex items-center justify-center gap-1 shadow"
                  >
                    {isTailoring ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying STAR optimization...</span>
                      </>
                    ) : (
                      <>
                        <ListRestart className="w-3.5 h-3.5" />
                        <span>Run Optimization Scan</span>
                      </>
                    )}
                  </button>

                  {originalResumeBackup && (
                    <button
                      id="btn-restore-resume"
                      onClick={handleRestoreBackup}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1 border border-slate-700"
                      title="Undo AI changes and restore original details"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Undo AI Changes</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Suggestions Desk List */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white font-display uppercase tracking-widest text-[#00ff66]">
                    AI Recommendations ({suggestions.filter(s => !s.applied).length} pending)
                  </h4>
                  {suggestions.some(s => !s.applied) && (
                    <button
                      id="btn-apply-all-suggestions"
                      onClick={handleApplyAllSuggestions}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                    >
                      <span>Apply All ({suggestions.filter(s => !s.applied).length})</span>
                    </button>
                  )}
                </div>

                {isTailoring && (
                  <div className="text-center py-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">Drafting expert recruiter amendments based on STAR methodology...</p>
                  </div>
                )}

                {!isTailoring && suggestions.length === 0 && (
                  <div className="text-center py-8 bg-slate-950 rounded-xl border border-slate-850">
                    <AlertTriangle className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No suggestions loaded. Click on "Run Optimization Scan" to analyze.</p>
                  </div>
                )}

                {!isTailoring && suggestions.length > 0 && (
                  <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                    {suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed transition ${
                          sug.applied
                            ? "bg-slate-950/50 border-emerald-500/20 opacity-60 text-slate-450"
                            : "bg-slate-950 border-slate-800 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase font-mono tracking-wider text-indigo-400">
                            {sug.section} suggestion • {sug.type} Standard
                          </span>
                          {sug.applied ? (
                            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 font-sans">
                              <Check className="w-3 h-3" /> Implemented
                            </span>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                id={`btn-reject-sug-${sug.id}`}
                                onClick={() => handleRejectSuggestion(sug.id)}
                                className="text-[10px] font-bold text-gray-500 hover:text-rose-400"
                              >
                                Skip
                              </button>
                              <button
                                id={`btn-accept-sug-${sug.id}`}
                                onClick={() => handleAcceptSuggestion(sug)}
                                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 hover:underline"
                              >
                                Accept & Apply
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Description content */}
                        <p className="text-xs text-slate-350 italic mb-2 font-normal">"{sug.reason}"</p>
                        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] font-sans">
                          {sug.originalText && (
                            <span className="block text-slate-500 line-through mb-1">
                              Was: {sug.originalText}
                            </span>
                          )}
                          <span className="block text-gray-200">
                            Change to: <b>{sug.suggestedText}</b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ATS Checker Compliance Desk */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-widest font-mono">
                    ATS Audit Simulator
                  </h4>
                  <button
                    id="btn-run-ats-audit"
                    onClick={triggerATSAudit}
                    disabled={isAuditingATS}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold hover:underline flex items-center gap-1"
                  >
                    {isAuditingATS ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Simulating Scan...</span>
                      </>
                    ) : (
                      <span>Run Free Scan</span>
                    )}
                  </button>
                </div>

                {atsResult ? (
                  <div id="ats-scan-feedback" className="space-y-4 animate-pulse-once">
                    {/* Score speed dial */}
                    <div className="flex items-center gap-4 bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                      <div className="relative w-14 h-14 flex items-center justify-center rounded-full bg-slate-900 border border-slate-800">
                        <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-tr from-indigo-400 to-emerald-400">
                          {atsResult.score}%
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          Verdict: {atsResult.passed ? "Strong Candidate (Passed)" : "Optimization Needed"}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Automated screening metrics verified against corporate filters</p>
                      </div>
                    </div>

                    {/* Criteria checklist outputs */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {atsResult.criteria.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-950 rounded-xl border border-slate-850 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-white text-[11px]">{item.name}</span>
                            <span className={`text-[10px] font-bold ${item.passed ? "text-emerald-400" : "text-rose-400"}`}>
                              {item.passed ? "Passed" : "Action Required"}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mb-1 leading-normal font-sans">{item.description}</p>
                          <p className="text-xs text-slate-300 bg-slate-900 border border-slate-850 p-2 rounded leading-relaxed">{item.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 bg-slate-950 rounded-xl border border-slate-850">
                    <p className="text-xs text-slate-400">Analyze formatting, language density, & keywords score on single screen.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Style customizers, Preview Sheet, Save & Download Options */}
            <div className="lg:col-span-7 space-y-6">
              {/* Style controls and Save drawer */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-2">
                  <button
                    id="save-version-cta"
                    onClick={handleSaveCurrentVersion}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-[97%]"
                    title="Store this customized configuration for specific target"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Tailored Version</span>
                  </button>

                  <button
                    id="btn-copy-outline"
                    onClick={handleCopyText}
                    className="px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-800 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    id="btn-download-json-direct"
                    onClick={handleDownloadJSON}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs text-slate-300 font-semibold"
                    title="Export backup schema"
                  >
                    Export JSON
                  </button>

                  <button
                    id="btn-print-pdf-direct"
                    onClick={handlePrintDownload}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-[97%]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save as PDF</span>
                  </button>
                </div>
              </div>

              {/* Template Style Switcher inside preview box */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">Real-time Designer Canvas:</span>
                <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs text-gray-400">
                  <button
                    onClick={() => setSelectedStyle("tech")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "tech" ? "bg-slate-800 text-white font-bold" : "hover:text-white"}`}
                  >
                    Tech Monospace
                  </button>
                  <button
                    onClick={() => setSelectedStyle("classic")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "classic" ? "bg-slate-800 text-white font-bold" : "hover:text-white"}`}
                  >
                    Classic Minimal
                  </button>
                  <button
                    onClick={() => setSelectedStyle("executive")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "executive" ? "bg-slate-800 text-white font-bold" : "hover:text-white"}`}
                  >
                    Executive Navy
                  </button>
                </div>
              </div>

              {/* Actual structured preview component */}
              <div className="max-h-[750px] overflow-y-auto rounded-2xl scrollbar-none border border-slate-800 print-container select-all">
                <ResumePreview resume={activeResume} templateStyle={selectedStyle} />
              </div>
            </div>
          </div>
        )}

        {/* -------------------- STEP: SAVED COPIES / VERSIONS LIST -------------------- */}
        {currentStep === "saves" && (
          <div id="step-versions-panel" className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 rounded-full blur-2xl"></div>

              <div className="mb-6">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2 font-display">
                  <FolderOpen className="w-5 h-5 text-indigo-400" /> Saved Resume Versions ({savedVersions.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Manage independent tailored drafts labeled by employer targets and positions on single screen.
                </p>
              </div>

              {savedVersions.length === 0 ? (
                <div className="text-center py-12 bg-slate-950 rounded-2xl border border-slate-850">
                  <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-xs font-bold text-slate-300">No versions saved yet</h4>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1">
                    When optimizing your professional summary, you can click "Save Tailored Version" to capture the draft.
                  </p>
                  <button
                    id="btn-return-tailoring"
                    onClick={() => setCurrentStep("tailor")}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                  >
                    Access Customizer Workspace
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedVersions.map((version) => (
                    <div
                      key={version.id}
                      onClick={() => handleLoadVersion(version)}
                      className="p-4 bg-slate-950 border border-slate-850 rounded-xl hover:border-indigo-600/40 hover:bg-slate-900 cursor-pointer transition relative group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono text-[9px] uppercase font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-850">
                            {version.savedAt}
                          </span>
                          <button
                            id={`btn-delete-ver-${version.id}`}
                            onClick={(e) => handleDeleteVersion(version.id, e)}
                            className="text-slate-500 hover:text-rose-450 p-1 opacity-80"
                            title="Delete this saved copy"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="text-xs font-black text-white font-display mt-2">{version.companyName}</h4>
                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{version.jobTitle}</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-mono">Candidate: {version.resumeData.fullName}</p>
                      </div>

                      <div className="border-t border-[#1e293b] pt-3.5 mt-4 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {version.appliedSuggestionsCount} items tailored
                        </span>
                        <span className="text-indigo-400 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                          Load Details <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Standalone hidden print preview container that activates only for window.print() */}
      <div className="hidden print:block print-container">
        <ResumePreview resume={activeResume} templateStyle={selectedStyle} id="resume-preview-sheet-print" />
      </div>

      {/* Footer Design */}
      <footer id="app-footer" className="mt-20 border-t border-[#1e293b] pt-8 text-center text-slate-500 text-xs print-hide">
        <p className="font-mono text-[9px] text-slate-500 uppercase tracking-widest font-semibold">Crafted for Future Professionals</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto font-normal">
          Optimizes graduate portfolios against modern recruitment trackers with absolute confidence.
        </p>
        <p className="text-[10px] text-slate-500 mt-4">&copy; {new Date().getFullYear()} JD to Resume Customizer. Open Source Licensing.</p>
      </footer>
    </div>
  );
}
