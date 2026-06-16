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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  X,
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
  FolderOpen,
  Sun,
  Moon,
  Bell,
  Facebook,
  Twitter,
  Linkedin,
  Image
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
  const onboardingFileInputRef = useRef<HTMLInputElement>(null);

  // --------- STATE ---------
  // User Authentication
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_user");
    if (saved) return JSON.parse(saved);
    // Frictionless bypass: greet first-time user directly as Guest on the dashboard
    const guestUser = { email: "guest@fresher.io", name: "Guest Candidate" };
    localStorage.setItem("jd_resume_customizer_user", JSON.stringify(guestUser));
    return guestUser;
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Resume Setup
  const [hasResume, setHasResume] = useState<boolean>(() => {
    return localStorage.getItem("jd_resume_customizer_has_resume") === "true";
  });
  const [showSetupOptions, setShowSetupOptions] = useState(false);

  const [activeResume, setActiveResume] = useState<ResumeStructure>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_active_resume");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed.fullName === "Akshay Anand" &&
        (parsed.workExperience?.length === 0 ||
          parsed.workExperience?.some((w: any) => w.company === "Nexus Digital Agency"))
      ) {
        return DEMO_RESUMES.akshay_anand.data;
      }
      return parsed;
    }
    return DEMO_RESUMES.akshay_anand.data;
  });

  const [originalResume, setOriginalResume] = useState<ResumeStructure>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_original_resume");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed.fullName === "Akshay Anand" &&
        (parsed.workExperience?.length === 0 ||
          parsed.workExperience?.some((w: any) => w.company === "Nexus Digital Agency"))
      ) {
        return DEMO_RESUMES.akshay_anand.data;
      }
      return parsed;
    }
    const savedActive = localStorage.getItem("jd_resume_customizer_active_resume");
    if (savedActive) {
      const parsed = JSON.parse(savedActive);
      if (
        parsed.fullName === "Akshay Anand" &&
        (parsed.workExperience?.length === 0 ||
          parsed.workExperience?.some((w: any) => w.company === "Nexus Digital Agency"))
      ) {
        return DEMO_RESUMES.akshay_anand.data;
      }
      return parsed;
    }
    return DEMO_RESUMES.akshay_anand.data;
  });

  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(() => {
    return localStorage.getItem("jd_resume_customizer_uploaded_pdf_base64");
  });

  // Current Job Description
  const [jdText, setJdText] = useState(() => {
    return localStorage.getItem("jd_resume_customizer_jd") || DEMO_JDS.frontend_eng.text;
  });
  const [targetCompany, setTargetCompany] = useState("Vercel Systems");
  const [targetRole, setTargetRole] = useState("Junior Frontend Engineer");

  // Step Wizard: 'auth' | 'dashboard' | 'resume' | 'jd' | 'tailor' | 'saves'
  const [currentStep, setCurrentStep] = useState<"auth" | "dashboard" | "resume" | "jd" | "tailor" | "saves">(() => {
    const hasRes = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    return hasRes ? "dashboard" : "resume";
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
  const [selectedStyle, setSelectedStyle] = useState<"classic" | "tech" | "executive" | "two-column">("tech");
  const [savedVersions, setSavedVersions] = useState<SavedResumeVersion[]>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_versions");
    return saved ? JSON.parse(saved) : [];
  });
  const isDarkMode = false;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Welcome to Auralis! Ready to tailor your first resume.", time: "Just now", read: false },
    { id: 2, text: "Pro tip: Achieve >85% ATS score to pass corporate screening easily.", time: "1 hour ago", read: true },
    { id: 3, text: "No recruitment files currently tailored. Get started in Voice Lab.", time: "5 hours ago", read: true }
  ]);

  // Mandatory Prerequisite Check for resume creation/uploading to unlock Auralis
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const sessionUnlocked = sessionStorage.getItem("auralis_platform_unlocked") === "true";
    const localUnlocked = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    return sessionUnlocked || localUnlocked;
  });

  // Onboarding choice: null = select pathway, 'yes' = upload path, 'no' = build form path, 'done' = workflow complete
  const [onboardingChoice, setOnboardingChoice] = useState<"yes" | "no" | "done" | null>("done");

  const handleLockedInteraction = (e?: React.MouseEvent | React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (hasResume) {
      setIsUnlocked(true);
      sessionStorage.setItem("auralis_platform_unlocked", "true");
      return;
    }
    setShowNoResumeAlert(true);
  };

  // Notification Banner
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Warning when trying to tailor without having a resume setup
  const [showNoResumeAlert, setShowNoResumeAlert] = useState(false);

  // Tailoring Wizard States
  const [isTailorWizardOpen, setIsTailorWizardOpen] = useState(false);
  const [tailorWizardStep, setTailorWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [tailorCompany, setTailorCompany] = useState("");
  const [tailorRole, setTailorRole] = useState("");
  const [tailorJdText, setTailorJdText] = useState("");
  const [tailorSelectedResumeKey, setTailorSelectedResumeKey] = useState<string>("active");
  const [tailorJdMode, setTailorJdMode] = useState<"paste" | "upload" | null>(null);
  const [tailorJdImages, setTailorJdImages] = useState<string[]>([]);
  const [tailorJdImageNames, setTailorJdImageNames] = useState<string[]>([]);
  const [tailorIsAnalyzing, setTailorIsAnalyzing] = useState(false);
  const [tailorAnalysisResult, setTailorAnalysisResult] = useState<{
    matchedKeywords: string[];
    missingKeywords: string[];
    improvements: string[];
    simplifiedText: string;
  } | null>(null);
  const [tailoredResultResume, setTailoredResultResume] = useState<ResumeStructure | null>(null);
  const [tailoredAtsScore, setTailoredAtsScore] = useState<number | null>(null);

  // Dashboard item preview states
  const [selectedSavedVersion, setSelectedSavedVersion] = useState<SavedResumeVersion | null>(null);
  const [showSavedVersionPreviewModal, setShowSavedVersionPreviewModal] = useState(false);
  const [showDeleteSavedVersionConfirmModal, setShowDeleteSavedVersionConfirmModal] = useState(false);
  const [versionToDeleteId, setVersionToDeleteId] = useState<string | null>(null);

  // User pathway selection inside Resume Setup (Upload or Create)
  const [resumeSelectionMode, setResumeSelectionMode] = useState<"upload" | "create" | null>(null);

  // Resume Quick View & Delete Confirms
  const [showResumePreviewModal, setShowResumePreviewModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [choiceModalPathway, setChoiceModalPathway] = useState<"upload" | "create">("upload");

  // File Upload states for Beginner Resume Setup Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<File | null>(null);
  const [uploadedResumeMeta, setUploadedResumeMeta] = useState<{ name: string; size: number; uploadedAt: string } | null>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_uploaded_resume_meta");
    return saved ? JSON.parse(saved) : null;
  });

  // Resume analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    isResume: boolean;
    confidenceScore: number;
    missingItems: string[];
    actionableImprovements: string[];
    detectedProfile: {
      fullName: string;
      email: string;
      phone: string;
      summary: string;
      skills: string[];
    };
    explanation: string;
  } | null>(null);

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
    localStorage.setItem("jd_resume_customizer_original_resume", JSON.stringify(originalResume));
  }, [originalResume]);

  useEffect(() => {
    if (hasResume && !isUnlocked) {
      setIsUnlocked(true);
      sessionStorage.setItem("auralis_platform_unlocked", "true");
    }
  }, [hasResume, isUnlocked]);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_jd", jdText);
  }, [jdText]);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(savedVersions));
  }, [savedVersions]);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("jd_resume_customizer_theme", "light");
  }, [currentStep]);

  // Resumes that actually exist in Resume Setup
  const existingResumes = [];
  if (hasResume) {
    existingResumes.push({
      key: "active",
      label: uploadedResumeMeta ? uploadedResumeMeta.name : (originalResume.fullName ? `${originalResume.fullName}'s Resume` : "My Resume"),
      data: originalResume
    });
  }

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
    const hasRes = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    setCurrentStep(hasRes ? "dashboard" : "resume");
    showNotification(`Welcome, ${name}! Your resume dashboard is ready.`, "success");
  };

  const handleOAuthSimulate = (provider: "google" | "linkedin" | "facebook") => {
    const name = provider === "google" ? "Alex Rivera (via Google)" : provider === "linkedin" ? "Sophia Vance (via LinkedIn)" : "Social Candidate";
    const email = `${provider.toLowerCase()}@candidate.org`;
    const userObj = { email, name };
    setCurrentUser(userObj);

    // Auto load appropriate presets for demonstration to build prompt satisfaction
    if (provider === "google") {
      loadPresetResume("akshay_anand");
    } else if (provider === "linkedin") {
      loadPresetResume("marketing_grad");
    }

    showNotification(`Signed in with ${provider.charAt(0).toUpperCase() + provider.slice(1)} successfully!`, "success");
    const hasRes = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    setCurrentStep(hasRes ? "dashboard" : "resume");
  };

  const handleOpenTailorWizard = () => {
    setTailorCompany("");
    setTailorRole("");
    setTailorJdText("");
    setTailorJdImages([]);
    setTailorJdImageNames([]);
    setTailorJdMode(null);
    if (existingResumes.length > 0) {
      setTailorSelectedResumeKey(existingResumes[0].key);
    } else {
      setTailorSelectedResumeKey("active");
    }
    setTailorAnalysisResult(null);
    setTailoredResultResume(null);
    setTailoredAtsScore(null);
    setTailorWizardStep(1);
    setIsTailorWizardOpen(true);
  };

  const handleTailorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const currentCount = tailorJdImages.length;
      const selectCount = files.length;
      if (currentCount + selectCount > 10) {
        showNotification("You can upload a maximum of 10 screenshot images.", "error");
        return;
      }

      const promises = Array.from(files).map((file: File) => {
        return new Promise<{ base64: string; name: string }>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ base64: reader.result as string, name: file.name });
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then((results) => {
        const newImages = results.map((r) => r.base64);
        const newNames = results.map((r) => r.name);
        setTailorJdImages((prev) => [...prev, ...newImages]);
        setTailorJdImageNames((prev) => [...prev, ...newNames]);
        showNotification(`${selectCount} screenshot(s) loaded successfully!`, "success");
      }).catch((err) => {
        console.error("Image loading error:", err);
        showNotification("Failed to load screenshots.", "error");
      });
    }
  };

  const handleRemoveTailorImage = (index: number) => {
    setTailorJdImages((prev) => prev.filter((_, i) => i !== index));
    setTailorJdImageNames((prev) => prev.filter((_, i) => i !== index));
  };

  const getResumeToTailor = (): ResumeStructure => {
    const found = existingResumes.find(r => r.key === tailorSelectedResumeKey);
    if (found) {
      return found.data;
    }
    if (DEMO_RESUMES[tailorSelectedResumeKey]) {
      return DEMO_RESUMES[tailorSelectedResumeKey].data;
    }
    return originalResume;
  };

  const handleAnalyzeJD = async () => {
    if (!tailorCompany.trim()) {
      showNotification("Please enter the company name.", "error");
      return;
    }
    if (!tailorJdMode) {
      showNotification("Please select an input method.", "error");
      return;
    }
    if (tailorJdMode === "paste" && !tailorJdText.trim()) {
      showNotification("Please paste a job description.", "error");
      return;
    }
    if (tailorJdMode === "upload" && tailorJdImages.length === 0) {
      showNotification("Please upload at least one screenshot.", "error");
      return;
    }

    setTailorIsAnalyzing(true);
    try {
      // 1. Simplify / Parse JD (handles image OCR + Jargon cleaning)
      const simplifyRes = await fetch("/api/simplify-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdText: tailorJdMode === "paste" ? tailorJdText : "",
          jdImagesBase64: tailorJdMode === "upload" ? tailorJdImages : []
        })
      });

      if (!simplifyRes.ok) {
        const errData = await simplifyRes.json().catch(() => ({}));
        throw new Error(errData.error || `Simplify failed status: ${simplifyRes.status}`);
      }

      const simplifiedJd = await simplifyRes.json();
      
      // Update tailorRole with the extracted job title from AI
      const extractedRole = simplifiedJd.jobTitle || "Tailored Position";
      setTailorRole(extractedRole);

      // 2. Perform initial ATS Audit to get matches, gaps, improvements
      const simplifiedJdText = `Role: ${extractedRole}
Company Pitch: ${simplifiedJd.companyPitch}
Core Skills Required: ${simplifiedJd.requiredSkills.map((s: any) => s.name).join(", ")}
Core Responsibilities: ${simplifiedJd.keyResponsibilities.join("\n")}
Candidate Expectations: ${simplifiedJd.candidateExpectations.join("\n")}
Keywords: ${simplifiedJd.keywordsToTarget.join(", ")}`;

      const selectedResume = getResumeToTailor();

      const auditRes = await fetch("/api/ats-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: selectedResume,
          jdText: simplifiedJdText
        })
      });

      if (!auditRes.ok) {
        const errData = await auditRes.json().catch(() => ({}));
        throw new Error(errData.error || `Audit failed status: ${auditRes.status}`);
      }

      const auditResult = await auditRes.json();

      // 3. Extract matches, missing, improvements
      const matched: string[] = [];
      const missing: string[] = [];
      const improvements: string[] = [];

      const originalSkillsLower = selectedResume.skills.map(s => s.toLowerCase());
      simplifiedJd.keywordsToTarget.forEach((kw: string) => {
        if (originalSkillsLower.some(sk => sk.includes(kw.toLowerCase()) || kw.toLowerCase().includes(sk))) {
          matched.push(kw);
        } else {
          missing.push(kw);
        }
      });

      simplifiedJd.requiredSkills.forEach((skillObj: any) => {
        const skName = skillObj.name;
        if (originalSkillsLower.some(sk => sk.includes(skName.toLowerCase()) || skName.toLowerCase().includes(sk))) {
          if (!matched.includes(skName)) matched.push(skName);
        } else {
          if (!missing.includes(skName)) missing.push(skName);
        }
      });

      (auditResult.criteria || []).forEach((c: any) => {
        if (!c.passed) {
          improvements.push(`${c.name}: ${c.feedback}`);
        }
      });

      if (matched.length === 0) matched.push("General profile keywords");
      if (missing.length === 0) missing.push("No missing critical keywords found");
      if (improvements.length === 0) improvements.push("Format is clean. Add more context to experience descriptions.");

      setTailorAnalysisResult({
        matchedKeywords: matched,
        missingKeywords: missing,
        improvements: improvements,
        simplifiedText: simplifiedJdText
      });

      setTailorWizardStep(3);
      showNotification("Job description analyzed successfully!", "success");
    } catch (err: any) {
      console.error("Analysis error:", err);
      showNotification(err.message || "Failed to analyze Job Description.", "error");
    } finally {
      setTailorIsAnalyzing(false);
    }
  };

  const handleGenerateTailoredResume = async () => {
    if (!tailorAnalysisResult) return;

    setTailorIsAnalyzing(true);
    try {
      const selectedResume = getResumeToTailor();

      // 1. Generate tailored resume details
      const tailorRes = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: selectedResume,
          jdText: tailorAnalysisResult.simplifiedText
        })
      });

      if (!tailorRes.ok) {
        const errData = await tailorRes.json().catch(() => ({}));
        throw new Error(errData.error || `Tailoring failed status: ${tailorRes.status}`);
      }

      const tailoredData = await tailorRes.json();
      const { tailoredResume, suggestions } = tailoredData;

      // 2. Perform ATS audit on the tailored resume
      const auditRes = await fetch("/api/ats-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: tailoredResume,
          jdText: tailorAnalysisResult.simplifiedText
        })
      });

      let newScore = 85;
      if (auditRes.ok) {
        const auditResult = await auditRes.json();
        newScore = auditResult.score || 85;
      }

      // 3. Save tailored resume version
      const newVersion: SavedResumeVersion = {
        id: `ver-${Date.now()}`,
        companyName: tailorCompany,
        jobTitle: tailorRole,
        savedAt: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        resumeData: tailoredResume,
        appliedSuggestionsCount: suggestions?.length || 0
      };

      const updatedVersions = [newVersion, ...savedVersions];
      setSavedVersions(updatedVersions);
      localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(updatedVersions));

      setTailoredResultResume(tailoredResume);
      setTailoredAtsScore(newScore);
      setTailorWizardStep(4);
      showNotification(`Successfully generated resume for ${tailorCompany}!`, "success");
    } catch (err: any) {
      console.error("Tailoring error:", err);
      showNotification(err.message || "Failed to generate tailored resume.", "error");
    } finally {
      setTailorIsAnalyzing(false);
    }
  };

  const handleDownloadTailoredResume = () => {
    if (!tailoredResultResume) return;
    
    let text = `==================================================
${tailoredResultResume.fullName.toUpperCase()}
==================================================
Email: ${tailoredResultResume.email}
Phone: ${tailoredResultResume.phone}
${tailoredResultResume.linkedin ? `LinkedIn: ${tailoredResultResume.linkedin}\n` : ""}${tailoredResultResume.website ? `Website: ${tailoredResultResume.website}\n` : ""}

PROFESSIONAL SUMMARY
--------------------
${tailoredResultResume.summary}

WORK EXPERIENCE
---------------
`;

    tailoredResultResume.workExperience.forEach((exp) => {
      text += `\n${exp.company} | ${exp.role} (${exp.duration})\n`;
      exp.description.forEach((bullet) => {
        text += `- ${bullet}\n`;
      });
    });

    if (tailoredResultResume.education && tailoredResultResume.education.length > 0) {
      text += `\nEDUCATION\n---------\n`;
      tailoredResultResume.education.forEach((edu) => {
        text += `${edu.school} | ${edu.degree} (${edu.duration})${edu.gpa ? ` (GPA: ${edu.gpa})` : ""}\n`;
      });
    }

    text += `\nSKILLS\n------\n${tailoredResultResume.skills.join(", ")}\n`;
    
    if (tailoredResultResume.languages && tailoredResultResume.languages.length > 0) {
      text += `\nLANGUAGES\n---------\n${tailoredResultResume.languages.join(", ")}\n`;
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tailoredResultResume.fullName.replace(/\s+/g, "_")}_${tailorCompany.replace(/\s+/g, "_")}_Resume.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Downloaded tailored resume successfully!", "success");
  };

  const handleDownloadSpecificResume = (version: SavedResumeVersion) => {
    const tailored = version.resumeData;
    let text = `==================================================
${tailored.fullName.toUpperCase()}
==================================================
Email: ${tailored.email}
Phone: ${tailored.phone}
${tailored.linkedin ? `LinkedIn: ${tailored.linkedin}\n` : ""}${tailored.website ? `Website: ${tailored.website}\n` : ""}

PROFESSIONAL SUMMARY
--------------------
${tailored.summary}

WORK EXPERIENCE
---------------
`;

    tailored.workExperience.forEach((exp) => {
      text += `\n${exp.company} | ${exp.role} (${exp.duration})\n`;
      exp.description.forEach((bullet) => {
        text += `- ${bullet}\n`;
      });
    });

    if (tailored.education && tailored.education.length > 0) {
      text += `\nEDUCATION\n---------\n`;
      tailored.education.forEach((edu) => {
        text += `${edu.school} | ${edu.degree} (${edu.duration})${edu.gpa ? ` (GPA: ${edu.gpa})` : ""}\n`;
      });
    }

    text += `\nSKILLS\n------\n${tailored.skills.join(", ")}\n`;
    
    if (tailored.languages && tailored.languages.length > 0) {
      text += `\nLANGUAGES\n---------\n${tailored.languages.join(", ")}\n`;
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tailored.fullName.replace(/\s+/g, "_")}_${version.companyName.replace(/\s+/g, "_")}_Resume.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Downloaded tailored resume successfully!", "success");
  };

  const handleGuestAccess = () => {
    const name = "Guest Candidate";
    const email = "guest@fresher.io";
    const userObj = { email, name };
    setCurrentUser(userObj);
    const hasRes = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    setCurrentStep(hasRes ? "dashboard" : "resume");
    showNotification("Welcome! Running in frictionless Guest Mode.", "success");
  };

  const toggleNotifications = () => {
    setIsNotificationsOpen((prev) => !prev);
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showNotification("All notifications marked as read", "success");
  };

  const handleLoadVersionClick = (ver: SavedResumeVersion) => {
    handleLoadVersion(ver);
    setCurrentStep("tailor");
    showNotification(`Loaded tailoring details for ${ver.companyName}!`, "info");
  };

  // Preset loaders
  const loadPresetResume = (key: "software_grad" | "marketing_grad" | "akshay_anand") => {
    const presetData = DEMO_RESUMES[key].data;
    setActiveResume(presetData);
    setOriginalResume(presetData);
    setIsUnlocked(true);
    sessionStorage.setItem("auralis_platform_unlocked", "true");
    setHasResume(true);
    localStorage.setItem("jd_resume_customizer_has_resume", "true");
    if (!localStorage.getItem("jd_resume_customizer_resume_created_at")) {
      localStorage.setItem("jd_resume_customizer_resume_created_at", new Date().toLocaleDateString());
    }
    showNotification(`Loaded ${DEMO_RESUMES[key].label} Resume Template and unlocked platform!`, "info");
  };

  const handleStartFreshResume = () => {
    setActiveResume({
      fullName: "",
      email: "",
      phone: "",
      linkedin: "",
      website: "",
      summary: "",
      workExperience: [],
      education: [],
      skills: []
    });
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
          setIsUnlocked(true);
          sessionStorage.setItem("auralis_platform_unlocked", "true");
          setOnboardingChoice("done");
          sessionStorage.setItem("auralis_onboarding_dismissed", "true");
          localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
          showNotification("Successfully imported resume! Platform unlocked.", "success");
        } else {
          showNotification("Invalid resume structure. Please ensure name, email, and workExperience list exist.", "error");
        }
      } catch (err) {
        showNotification("Failed to parse JSON file.", "error");
      }
    };
    reader.readAsText(file);
  };

  // Helper to convert File to Base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64 || "");
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Call backend to analyze the resume layout & content
  const triggerResumeAnalysis = async (file: File) => {
    setIsAnalyzing(true);
    setUploadError(null);
    setAnalysisResult(null);

    try {
      const base64Data = await convertFileToBase64(file);
      const res = await fetch("/api/analyze-uploaded-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          base64Data
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error status: ${res.status}`);
      }

      const result = await res.json();
      setAnalysisResult(result);
      if (result.isResume) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          (window as any).__lastUploadedPdfBase64 = base64Data;
        } else {
          (window as any).__lastUploadedPdfBase64 = null;
        }
        showNotification("Resume successfully audited and validated!", "success");
      } else {
        showNotification("maybe you uploaded a wrong file. The scanned uploaded document isnt a resume. please check and retry again", "error");
      }
    } catch (err: any) {
      console.error("Resume analysis error:", err);
      setUploadError(err.message || "Failed to analyze resume. Please try again.");
      showNotification("Error validating resume.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Validate and handle PDF & DOCX files
  const validateAndSetUploadedFile = (file: File) => {
    const name = file.name;
    const extension = name.split('.').pop()?.toLowerCase();
    const isPDF = file.type === "application/pdf" || extension === "pdf";
    const isDOCX = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx";

    if (isPDF || isDOCX) {
      setTempFile(file);
      setUploadError(null);
      // Automatically trigger the verification
      triggerResumeAnalysis(file);
    } else {
      setTempFile(null);
      setUploadError("Invalid format. Please upload PDF or DOCX file only.");
      showNotification("Unsupported file format.", "error");
    }
  };

  const handleDragOverOrEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetUploadedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      validateAndSetUploadedFile(file);
    }
  };

  const handleContinueUpload = () => {
    if (!tempFile) return;

    const meta = {
      name: tempFile.name,
      size: tempFile.size,
      uploadedAt: new Date().toISOString()
    };
    setUploadedResumeMeta(meta);
    localStorage.setItem("jd_resume_customizer_uploaded_resume_meta", JSON.stringify(meta));
    
    if ((window as any).__lastUploadedPdfBase64) {
      setUploadedPdfBase64((window as any).__lastUploadedPdfBase64);
      localStorage.setItem("jd_resume_customizer_uploaded_pdf_base64", (window as any).__lastUploadedPdfBase64);
      (window as any).__lastUploadedPdfBase64 = null;
    } else {
      setUploadedPdfBase64(null);
      localStorage.removeItem("jd_resume_customizer_uploaded_pdf_base64");
    }
    
    setIsUnlocked(true);
    sessionStorage.setItem("auralis_platform_unlocked", "true");
    setOnboardingChoice("done");
    sessionStorage.setItem("auralis_onboarding_dismissed", "true");
    localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
    
    setHasResume(true);
    localStorage.setItem("jd_resume_customizer_has_resume", "true");
    if (!localStorage.getItem("jd_resume_customizer_resume_created_at")) {
      localStorage.setItem("jd_resume_customizer_resume_created_at", new Date().toLocaleDateString());
    }

    // Pre-fill fields if we successfully verified they are a resume
    if (analysisResult && analysisResult.isResume) {
      const { detectedProfile } = analysisResult;
      setActiveResume(prev => {
        const mappedExperience = (detectedProfile.workExperience || []).map((exp: any, idx: number) => ({
          id: exp.id || `exp-${Date.now()}-${idx}`,
          role: exp.role || "",
          company: exp.company || "",
          duration: exp.duration || "",
          description: Array.isArray(exp.description) ? exp.description : [exp.description || ""]
        }));

        const mappedEducation = (detectedProfile.education || []).map((edu: any, idx: number) => ({
          id: edu.id || `edu-${Date.now()}-${idx}`,
          degree: edu.degree || "",
          school: edu.school || "",
          duration: edu.duration || "",
          gpa: edu.gpa || ""
        }));

        const updatedResume = {
          fullName: detectedProfile.fullName || prev.fullName || "Guest Candidate",
          email: detectedProfile.email || prev.email || "guest@fresher.io",
          phone: detectedProfile.phone || prev.phone || "",
          summary: detectedProfile.summary || prev.summary || "",
          skills: detectedProfile.skills && detectedProfile.skills.length > 0 
            ? detectedProfile.skills 
            : prev.skills,
          languages: detectedProfile.languages && detectedProfile.languages.length > 0
            ? detectedProfile.languages
            : [],
          workExperience: mappedExperience,
          education: mappedEducation
        };
        localStorage.setItem("jd_resume_customizer_active_resume", JSON.stringify(updatedResume));
        setOriginalResume(updatedResume);
        return updatedResume;
      });
    }

    showNotification(`Successfully processed "${tempFile.name}"! Ready to proceed.`, "success");
    setIsUploadModalOpen(false);
    setIsChoiceModalOpen(false); // Close choice modal too if open
    setTempFile(null);
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
    <div className="min-h-screen font-sans antialiased overflow-x-hidden selection:bg-neutral-200 selection:text-black pb-12 print:bg-white print:pb-0 bg-white text-black">
      {currentStep === "auth" ? (
        <>
          {/* Top Navigation Bar specifically for Login/Auth page */}
          <nav id="navbar-top" className="fixed top-0 w-full z-50 border-b border-neutral-200 bg-white transition-all shadow-sm print-hide">
            <div className="max-w-[1280px] mx-auto px-6 h-20 flex justify-between items-center">
              <a className="text-xl font-bold tracking-tighter text-black cursor-pointer" href="#" onClick={(e) => e.preventDefault()}>
                Auralis <span className="text-xs font-normal tracking-tight px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700 bg-neutral-100 whitespace-nowrap">Resumes</span>
              </a>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleGuestAccess}
                  className="bg-neutral-950 text-white font-medium text-xs px-5 py-2.5 rounded-full hover:opacity-90 active:scale-95 duration-200 cursor-pointer"
                >
                  Guest Mode
                </button>
              </div>
            </div>
          </nav>

          {/* Toast Notification for Login */}
          {notification && (
            <div
              id="toast-notification"
              className="fixed top-24 right-6 z-50 flex items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-md text-xs font-medium print-hide"
            >
              <Check className="w-4 h-4 text-neutral-900" />
              <span>{notification.message}</span>
            </div>
          )}

          <main className="pt-24 pb-20 max-w-[1280px] mx-auto px-6 print-hide">
        
        {/* Render login landing panel */}
        {true && (
          <div className="space-y-[100px] pt-6 text-black bg-white">
            
            {/* Side-by-Side Content Grid: Info on left, Login Options on right */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start max-w-[1200px] mx-auto px-4">
              
              {/* Left Column: Info about Auralis */}
              <div className="lg:col-span-6 space-y-6 text-left flex flex-col justify-center pt-4 lg:pt-8">
                {/* Feature Pill Tag */}
                <div className="inline-flex items-center space-x-2 bg-neutral-100 px-4 py-2 rounded-full border border-neutral-300 shadow-xs self-start">
                  <span className="bg-black text-white text-[10px] uppercase font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full">New</span>
                  <span className="text-xs font-semibold text-black">Auralis Resumes v2.0 is now live</span>
                  <span className="text-xs text-neutral-400">→</span>
                </div>
   
                {/* Aggressive architecture tight headline (84px text class with Space Grotesk look) */}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-sans font-bold tracking-tighter text-black leading-[0.98] max-w-[540px]">
                  Create AI resumes that look human
                </h1>
   
                <p className="font-sans text-sm md:text-base text-neutral-700 max-w-[500px] leading-relaxed">
                  Precision-engineered resume infrastructure for fresh graduates and entry-level professionals. Autocut corporate jargon, align keyword metrics, and achieve perfect ATS alignment on a beautiful grayscale dashboard.
                </p>
   

              </div>

              {/* Right Column: Login options */}
              <div className="lg:col-span-6 w-full flex justify-center">
                <div id="auth-panel" className="bg-white border-2 border-black rounded-3xl shadow-xl p-6 sm:p-10 relative overflow-hidden w-full max-w-[520px]">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-black" />
                  
                  <div className="space-y-6">
                    <button
                      id="btn-quick-guest"
                      onClick={handleGuestAccess}
                      className="w-full py-3.5 bg-black hover:bg-neutral-800 text-white text-sm font-bold rounded-xl transition duration-150 cursor-pointer shadow-md"
                    >
                      Guest Mode
                    </button>
   
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-neutral-300"></div>
                      <span className="flex-shrink mx-4 text-neutral-500 text-[10px] uppercase font-mono font-bold tracking-widest">or sign in with</span>
                      <div className="flex-grow border-t border-neutral-300"></div>
                    </div>
   
                    {/* Social Sign In Block from Screenshot (Black/White minimal) */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        id="btn-auth-linkedin"
                        onClick={() => handleOAuthSimulate("linkedin")}
                        className="py-2.5 px-4 bg-white hover:bg-neutral-50 border border-neutral-300 text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
                      >
                        <span className="text-black font-bold">LinkedIn</span>
                      </button>
                      <button
                        id="btn-auth-google"
                        onClick={() => handleOAuthSimulate("google")}
                        className="py-2.5 px-4 bg-white hover:bg-neutral-50 border border-neutral-300 text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
                      >
                        <span className="text-black font-bold">Google</span>
                      </button>
                    </div>
   
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-neutral-300"></div>
                      <span className="flex-shrink mx-4 text-neutral-500 text-[10px] uppercase font-mono font-bold tracking-widest">or email access</span>
                      <div className="flex-grow border-t border-neutral-300"></div>
                    </div>
   
                    <form onSubmit={handleAuth} className="space-y-4 text-left">
                      {isSignUp && (
                        <div>
                          <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">Full Name</label>
                          <input
                            id="input-signup-name"
                            type="text"
                            placeholder="Alex Rivera"
                            value={authName}
                            onChange={(e) => setAuthName(e.target.value)}
                            className="w-full pl-3 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                          />
                        </div>
                      )}
   
                      <div>
                        <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">Email Address</label>
                        <input
                          id="input-auth-email"
                          type="email"
                          required
                          placeholder="name@university.edu"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="w-full pl-3 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                        />
                      </div>
   
                      <div>
                        <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">Password</label>
                        <input
                          id="input-auth-password"
                          type="password"
                          required
                          placeholder="••••••••"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className="w-full pl-3 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                        />
                      </div>
   
                      <button
                        id="btn-auth-submit"
                        type="submit"
                        className="w-full py-2.5 bg-black hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition mt-4 cursor-pointer shadow-md"
                      >
                        {isSignUp ? "Create Free Account" : "Access Optimizer Suite"}
                      </button>
   
                      <div className="text-center mt-3">
                        <button
                          id="btn-toggle-auth-mode"
                          type="button"
                          onClick={() => setIsSignUp(!isSignUp)}
                          className="text-xs text-black hover:text-neutral-800 underline font-semibold transition"
                        >
                          {isSignUp ? "Already have an account? Log In" : "Need an account? Sign Up for Free"}
                        </button>
                      </div>
                    </form>
                  </div>
   
                </div>
              </div>

            </section>
  
            {/* Customer reviews component replacing the Trust Strip */}
            <section className="py-16 bg-neutral-50/50 border-t border-neutral-200">
              <div className="max-w-[1100px] mx-auto px-6 text-center">
                <h2 className="text-2xl sm:text-3xl font-sans font-bold text-[#8257e5] tracking-tight mb-2">Customer reviews</h2>
                <p className="text-xs sm:text-sm text-neutral-500 font-medium mb-12">What our customers are saying..</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Card 1: Lance Jarvis */}
                  <div className="bg-white rounded-3xl border border-neutral-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative">
                    <div className="text-left px-8 pt-8">
                      <span className="text-4xl font-serif text-[#1abc9c] font-bold">“</span>
                    </div>
                    <div className="px-8 pb-16 pt-2 text-center flex-grow">
                      <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed italic">
                        "The simplicity of Auralis Resumes is unmatched. I uploaded my rough resume, and the AI tailored it perfectly with the JD. This app helped me land my first Software Engineering job in under two weeks. Unbelievably seamless!"
                      </p>
                    </div>
                    
                    <div className="relative mt-auto">
                      <svg viewBox="0 0 1440 120" className="w-full h-auto block -mb-0.5" preserveAspectRatio="none">
                        <path d="M0,40 C480,100 960,100 1440,40 L1440,120 L0,120 Z" fill="#1abc9c" />
                      </svg>
                      <div className="bg-[#1abc9c] pb-6 pt-1 text-center text-white rounded-b-3xl">
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-4 border-white bg-white overflow-hidden shadow-md">
                          <img 
                            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=faces" 
                            alt="Lance Jarvis" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                        <p className="font-bold text-sm tracking-tight pt-8 text-white">Lance Jarvis</p>
                        <div className="flex justify-center items-center gap-3 mt-2 text-white/80">
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Facebook className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Twitter className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Linkedin className="w-3.5 h-3.5" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Ericka Lynda */}
                  <div className="bg-white rounded-3xl border border-neutral-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative">
                    <div className="text-left px-8 pt-8">
                      <span className="text-4xl font-serif text-[#8e44ad] font-bold">“</span>
                    </div>
                    <div className="px-8 pb-16 pt-2 text-center flex-grow">
                      <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed italic">
                        "I was struggling to tailor my entry-level portfolio until I found this platform. It completely removes the guesswork by tailoring resumes directly to specific corporate JDs. Thanks to this, I secured my Marketing Specialist interview and got the job!"
                      </p>
                    </div>
                    
                    <div className="relative mt-auto">
                      <svg viewBox="0 0 1440 120" className="w-full h-auto block -mb-0.5" preserveAspectRatio="none">
                        <path d="M0,40 C480,100 960,100 1440,40 L1440,120 L0,120 Z" fill="#8e44ad" />
                      </svg>
                      <div className="bg-[#8e44ad] pb-6 pt-1 text-center text-white rounded-b-3xl">
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-4 border-white bg-white overflow-hidden shadow-md">
                          <img 
                            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=faces" 
                            alt="Ericka Lynda" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                        <p className="font-bold text-sm tracking-tight pt-8 text-white">Ericka Lynda</p>
                        <div className="flex justify-center items-center gap-3 mt-2 text-white/80">
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Facebook className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Twitter className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Linkedin className="w-3.5 h-3.5" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Neil Wilford */}
                  <div className="bg-white rounded-3xl border border-neutral-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative">
                    <div className="text-left px-8 pt-8">
                      <span className="text-4xl font-serif text-[#3498db] font-bold">“</span>
                    </div>
                    <div className="px-8 pb-16 pt-2 text-center flex-grow">
                      <p className="text-xs sm:text-sm text-neutral-500 leading-relaxed italic">
                        "As a recent graduate, resume building felt like a nightmare. Auralis made it incredibly straightforward! It customized my skills section perfectly for the roles I targeted, and I finally landed my first official corporate position."
                      </p>
                    </div>
                    
                    <div className="relative mt-auto">
                      <svg viewBox="0 0 1440 120" className="w-full h-auto block -mb-0.5" preserveAspectRatio="none">
                        <path d="M0,40 C480,100 960,100 1440,40 L1440,120 L0,120 Z" fill="#3498db" />
                      </svg>
                      <div className="bg-[#3498db] pb-6 pt-1 text-center text-white rounded-b-3xl">
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-4 border-white bg-white overflow-hidden shadow-md">
                          <img 
                            src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=faces" 
                            alt="Neil Wilford" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                        <p className="font-bold text-sm tracking-tight pt-8 text-white">Neil Wilford</p>
                        <div className="flex justify-center items-center gap-3 mt-2 text-white/80">
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Facebook className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Twitter className="w-3.5 h-3.5" /></a>
                          <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-white transition"><Linkedin className="w-3.5 h-3.5" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  ) : (
    /* -------------------- POST-LOGIN SAAS WORKSPACE (COLLAPSIBLE SIDEBAR + TOP BAR + INNER STAGES) -------------------- */
    <div className="flex h-screen overflow-hidden text-black bg-white">
      
      {/* Collapsible Left Sidebar */}
      <aside 
        id="sidebar-menu"
        className={`flex flex-col justify-between border-r-2 border-black bg-white transition-all duration-300 z-30 h-full relative flex-shrink-0 ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div>
          {/* Logo & Chevron toggle button */}
          <div className="h-20 flex items-center justify-between px-5 border-b-2 border-black">
            {!isSidebarCollapsed ? (
              <span className="text-lg font-black tracking-tighter text-black flex items-center gap-1.5 selection:bg-transparent">
                <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse flex-shrink-0" />
                <span>AURALIS</span>
              </span>
            ) : (
              <Sparkles className="w-6 h-6 text-emerald-600 mx-auto animate-pulse flex-shrink-0" />
            )}
            
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-lg border-2 border-black text-black hover:bg-neutral-100 transition-all cursor-pointer flex-shrink-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? "rotate-0" : "rotate-180"}`} />
            </button>
          </div>

          {/* Navigation Links inside Collapsible Sidebar */}
          <nav className="p-4 space-y-2">
            {[
              { step: "resume", label: "Resume Setup", icon: FileText },
              { step: "dashboard", label: "Tailored Resumes", icon: FolderOpen },
              { step: "jd", label: "Job Analysis", icon: BookOpen },
              { step: "tailor", label: "Tailoring Studio", icon: Sparkles },
              { step: "saves", label: "Saved Copies", icon: Save, badge: savedVersions.length }
            ].map((item) => {
              const IconComponent = item.icon;
              const isActive = currentStep === item.step;
              return (
                <button
                  key={item.step}
                  id={`sidebar-link-${item.step}`}
                  onClick={() => {
                    if (item.step !== "resume" && !isUnlocked && !hasResume) {
                      handleLockedInteraction();
                    } else {
                      if (hasResume && !isUnlocked) {
                        setIsUnlocked(true);
                        sessionStorage.setItem("auralis_platform_unlocked", "true");
                      }
                      setCurrentStep(item.step as any);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-200 cursor-pointer border-2 ${
                    isActive 
                      ? "bg-black border-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.15)]"
                      : "bg-transparent border-transparent hover:border-black text-neutral-600 hover:text-black"
                  }`}
                >
                  <IconComponent className="w-5 h-5 flex-shrink-0 text-current" />
                  {!isSidebarCollapsed && (
                    <div className="flex justify-between items-center w-full min-w-0">
                      <span className="truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-black flex-shrink-0 ml-1 leading-none">{item.badge}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Persona identifier block */}
        <div className="p-4 border-t-2 border-black bg-white">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-black border-2 border-black flex items-center justify-center text-white text-xs font-black flex-shrink-0">
              {currentUser?.name.charAt(0).toUpperCase()}
            </div>
            {!isSidebarCollapsed && (
              <div className="truncate text-left min-w-0">
                <p className="text-xs font-black text-black truncate leading-tight">{currentUser?.name}</p>
                <p className="text-[10px] text-neutral-550 truncate mt-0.5">{currentUser?.email}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Panel Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Menu */}
        <header className="h-20 border-b-2 border-black bg-white/95 backdrop-blur-md flex justify-between items-center px-6 z-20 flex-shrink-0">
          
          {/* Left indicator label or mobile Brand */}
          <div className="flex items-center gap-3 text-left">
            <span className="text-sm font-black tracking-tighter text-black flex items-center gap-1.5 lg:hidden">
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse flex-shrink-0" />
              <span>AURALIS</span>
            </span>
            <span className="hidden lg:inline text-xs font-mono font-bold uppercase tracking-wider text-neutral-550">
              WORKSPACE / {currentStep.toUpperCase()}
            </span>
            {!isUnlocked && (
              <span className="bg-amber-100 text-amber-850 border border-amber-300 text-[10px] font-bold font-mono px-2.5 py-1 rounded-full animate-pulse">
                PROFILES LOCKED
              </span>
            )}
          </div>

          {/* Right Header Navigation Panel controls */}
          <div className="flex items-center gap-4">
            
            {/* Notification alert Bell triggering dropdown menu */}
            <div className="relative">
              <button
                id="btn-notifications-menu"
                onClick={toggleNotifications}
                className="p-2.5 rounded-xl border-2 border-black text-black bg-white hover:bg-neutral-100 transition-all cursor-pointer relative shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                title="Toggle Notifications Alert"
              >
                <Bell className="w-5 h-5 text-black" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 border-2 border-black flex items-center justify-center text-[9px] font-mono font-black text-white shadow-sm animate-bounce">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-50 p-4 text-left animate-fadeIn">
                  <div className="flex justify-between items-center border-b-2 border-black pb-2.5 mb-3">
                    <span className="text-xs font-mono font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Notifications ({notifications.filter(n => !n.read).length})</span>
                    </span>
                    {notifications.some(n => !n.read) && (
                      <button 
                        onClick={markAllNotificationsAsRead} 
                        className="text-[9px] font-mono font-black uppercase text-black hover:bg-neutral-100 border-2 border-black px-2 py-1 rounded-lg transition-all cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-0.5px] hover:translate-y-[-0.5px] hover:shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-neutral-500 font-semibold font-mono">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          className={`p-3 rounded-xl text-xs border-2 transition-all duration-150 ${
                            notif.read 
                              ? "bg-neutral-50 border-neutral-200 text-neutral-600" 
                              : "bg-amber-50 border-black text-neutral-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {!notif.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-bold leading-normal">{notif.text}</p>
                              <span className="text-[9px] text-neutral-550 font-mono mt-1.5 block font-bold">
                                {notif.time}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sign Out Button */}
            <button
              id="btn-sign-out"
              onClick={() => {
                setCurrentUser(null);
                setCurrentStep("auth");
                setIsUnlocked(false);
                setOnboardingChoice(null);
                sessionStorage.removeItem("auralis_platform_unlocked");
                sessionStorage.removeItem("auralis_onboarding_dismissed");
                localStorage.removeItem("jd_resume_customizer_onboarding_done");
                showNotification("Logged out securely.", "info");
              }}
              className="bg-white hover:bg-neutral-50 text-black font-bold text-xs px-4 py-2.5 rounded-xl border-2 border-black transition duration-150 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Scrollable Workspace Container */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          
          {/* Notification Toast within Workspace */}
          {notification && (
            <div
              id="toast-notification-workspace"
              className="fixed top-24 right-6 z-50 flex items-center gap-3 p-4 rounded-xl border-2 border-black dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-950 dark:text-white shadow-xl text-xs font-bold animate-slideIn"
            >
              <Check className="w-4 h-4 text-emerald-500" />
            </div>
          )}

          {/* -------------------- STEP: DASHBOARD SCREEN -------------------- */}
          {currentStep === "dashboard" && (
            <div className={`space-y-6 ${savedVersions.length === 0 ? 'w-full' : 'max-w-5xl mx-auto'}`}>
              {savedVersions.length === 0 ? (
                /* FIRST TIME USER BLANK SCREEN STYLED SIMILAR TO LOGIN CARD WITH THICK BLACK BORDER */
                <div className="relative min-h-[70vh] w-full flex flex-col items-center justify-center animate-fadeIn">
                  <div className="flex flex-col items-center justify-center py-16 px-8 bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center max-w-xl w-full mx-auto my-6 transition-all duration-300">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-400 flex items-center justify-center mb-6">
                      <FolderOpen className="w-8 h-8 text-black" />
                    </div>
                    {/* Shortened empty state text as requested */}
                    <h3 className="text-xl font-black tracking-tight text-black uppercase font-mono">No Resumes Tailored</h3>
                    <p className="text-sm text-neutral-600 mt-3 max-w-sm leading-relaxed font-semibold">
                      To create tailored resumes, use the Left Sidebar menu options!
                    </p>
                  </div>
                  
                  {/* FLOATING ACTION PILL ON BOTTOM RIGHT OF MAIN STAGE: "CREATE NEW" ROYAL BLUE PILLED BUTTON */}
                  <div className="absolute bottom-2 right-2 sm:bottom-0 sm:right-4">
                    <button
                      id="btn-dashboard-float-create-new"
                      onClick={() => {
                        if (!hasResume) {
                          setShowNoResumeAlert(true);
                        } else {
                          if (!isUnlocked) {
                            setIsUnlocked(true);
                            sessionStorage.setItem("auralis_platform_unlocked", "true");
                          }
                          handleOpenTailorWizard();
                        }
                      }}
                      className="px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border border-transparent flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                      <span>Create New</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* EXQUISITE JD CARD LAYOUT REPRESENTING CREATED JDS AS DEPICTED IN THE WIREFRAME */
                <div className="space-y-6 max-w-3xl mr-auto text-left mt-2 animate-fadeIn w-full">
                  {savedVersions.map((version) => (
                    <div
                      key={version.id}
                      id={`jd-item-${version.id}`}
                      onClick={() => {
                        setSelectedSavedVersion(version);
                        setShowSavedVersionPreviewModal(true);
                      }}
                      className="w-full bg-white border-4 border-black rounded-3xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex justify-between items-center text-left"
                    >
                      <div className="space-y-2 min-w-0 flex-1 pr-4">
                        <h3 className="text-xl font-black text-black tracking-tight font-sans truncate">
                          {version.companyName} — <span className="italic text-neutral-800 font-medium">{version.jobTitle}</span>
                        </h3>
                        <p className="text-xs font-mono font-bold text-neutral-550 uppercase tracking-wider">
                          Created: {version.savedAt}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-right flex-shrink-0">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setVersionToDeleteId(version.id);
                            setShowDeleteSavedVersionConfirmModal(true);
                          }}
                          className="text-xs font-black uppercase tracking-widest text-rose-600 hover:text-rose-800 hover:underline transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Floating Action Pill on dashboard when savedVersions exist */}
                  <div className="flex justify-end pt-12">
                    <button
                      id="btn-dashboard-float-create-new-has-items"
                      onClick={() => {
                        if (!hasResume) {
                          setShowNoResumeAlert(true);
                        } else {
                          if (!isUnlocked) {
                            setIsUnlocked(true);
                            sessionStorage.setItem("auralis_platform_unlocked", "true");
                          }
                          handleOpenTailorWizard();
                        }
                      }}
                      className="px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border border-transparent flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                      <span>Create New</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


        {/* -------------------- STEP 1: RESUME SETUP / BUILDER -------------------- */}
        {false && (
          <div className="fixed inset-0 bg-black/55 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto relative animate-scaleIn space-y-6">
              <input
                id="onboarding-ref-file-input"
                type="file"
                ref={onboardingFileInputRef}
                accept=".json"
                onChange={(e) => {
                  handleResumeJsonUpload(e);
                  setOnboardingChoice("done");
                  sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                  localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
                }}
                className="hidden"
              />

              {/* Skip / Close button */}
              <button
                id="btn-onboarding-dismiss"
                onClick={() => {
                  setOnboardingChoice("done");
                  sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                  localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
                }}
                className="absolute top-4 right-4 text-[10px] uppercase font-bold text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
              >
                Dismiss ✕
              </button>

              {!isUnlocked && (
                <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 text-center space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                    🔒 LOCK STATE ACTIVE
                  </span>
                  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mt-1">
                    To unlock Auralis features, please upload an existing resume or create one first.
                  </p>
                </div>
              )}

              {onboardingChoice === null && (
                <div className="text-center space-y-6 py-8">
                  <div className="mx-auto w-14 h-14 rounded-full border border-neutral-300 dark:border-neutral-800 flex items-center justify-center bg-neutral-50 dark:bg-black shadow-xs">
                    <FileText className="w-6 h-6 text-neutral-800 dark:text-neutral-100" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">Do you have a resume?</h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                      Choose to upload your existing resume profile, or let Auralis craft a beautiful, minimalist draft from scratch.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 max-w-lg mx-auto">
                    <button
                      id="onboarding-has-resume"
                      onClick={() => {
                        onboardingFileInputRef.current?.click();
                      }}
                      className="p-6 rounded-xl border border-neutral-300 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-900/50 text-left transition duration-200 group flex flex-col justify-between h-44 cursor-pointer"
                    >
                      <div className="flex justify-between items-center w-full">
                        <Upload className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:scale-105 transition" />
                        <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition" />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-neutral-900 dark:text-white">Yes, upload the resume</span>
                        <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">Configure existing backup schema or load expert samples.</span>
                      </div>
                    </button>

                    <button
                      id="onboarding-no-resume"
                      onClick={() => {
                        handleStartFreshResume();
                        setOnboardingChoice("no");
                      }}
                      className="p-6 rounded-xl border border-neutral-300 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-100 bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-900/50 text-left transition duration-200 group flex flex-col justify-between h-44 cursor-pointer"
                    >
                      <div className="flex justify-between items-center w-full">
                        <Plus className="w-5 h-5 text-neutral-600 dark:text-neutral-400 group-hover:scale-105 transition" />
                        <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition" />
                      </div>
                      <div>
                        <span className="block text-sm font-bold text-neutral-900 dark:text-white">No, let's create your resume</span>
                        <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">We'll prompt you for the necessary fields and build a modern CV.</span>
                      </div>
                    </button>
                  </div>

                  <div className="pt-6 border-t border-neutral-150 dark:border-neutral-900">
                    <button
                      id="onboarding-skip-btn"
                      onClick={() => {
                        setOnboardingChoice("done");
                        sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                        localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
                        showNotification("Loaded demo software resume template.", "info");
                      }}
                      className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition underline cursor-pointer"
                    >
                      Skip onboarding flow & view dashboard
                    </button>
                  </div>
                </div>
              )}

            {onboardingChoice === "no" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setOnboardingChoice(null)}
                    className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition flex items-center gap-1 cursor-pointer"
                  >
                    ← Back to Choice
                  </button>
                  <span className="text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest">Option B</span>
                </div>

                <div className="space-y-1.5 text-center">
                  <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">Let's create your resume</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                    Fill out all necessary fields below to construct a robust ATS-compliant graduate profile.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!activeResume.fullName.trim()) {
                      showNotification("Please provide your full name.", "error");
                      return;
                    }
                    setHasResume(true);
                    localStorage.setItem("jd_resume_customizer_has_resume", "true");
                    setIsUnlocked(true);
                    sessionStorage.setItem("auralis_platform_unlocked", "true");
                    setOnboardingChoice("done");
                    sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                    localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
                    if (!localStorage.getItem("jd_resume_customizer_resume_created_at")) {
                      localStorage.setItem("jd_resume_customizer_resume_created_at", new Date().toLocaleDateString());
                    }
                    setOriginalResume(activeResume);
                    showNotification("Custom resume generated and loaded successfully! Platform unlocked.", "success");
                  }}
                  className="space-y-6 text-left"
                >
                  {/* Contact Block */}
                  <div className="space-y-3 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white font-mono uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1.5">1. Contact & Identity</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Alex Rivera"
                          value={activeResume.fullName}
                          onChange={(e) => handleUpdateContact("fullName", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">Email Address *</label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. alex@rivera.com"
                          value={activeResume.email}
                          onChange={(e) => handleUpdateContact("email", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">Phone Number *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. +1 555-0199"
                          value={activeResume.phone}
                          onChange={(e) => handleUpdateContact("phone", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">LinkedIn URL</label>
                        <input
                          type="text"
                          placeholder="e.g. linkedin.com/in/alex"
                          value={activeResume.linkedin || ""}
                          onChange={(e) => handleUpdateContact("linkedin", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">Portfolio / Website</label>
                        <input
                          type="text"
                          placeholder="e.g. alexrivera.dev"
                          value={activeResume.website || ""}
                          onChange={(e) => handleUpdateContact("website", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary Block */}
                  <div className="space-y-3 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white font-mono uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1.5">2. Professional Pitch</h3>
                    <div>
                      <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-500">Summary Summary *</label>
                      <textarea
                        required
                        rows={3}
                        placeholder="Highly motivated graduate skilled in frontend React architecture and UI engineering. Proven experience delivering responsive designs and analyzing software requirements."
                        value={activeResume.summary}
                        onChange={(e) => handleUpdateContact("summary", e.target.value)}
                        className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Skills Block */}
                  <div className="space-y-3 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white font-mono uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1.5">3. Skill Tag Keywords</h3>
                    <div>
                      <div className="flex flex-wrap gap-1.5 mb-3 bg-white dark:bg-black p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-850 min-h-12 items-center">
                        {activeResume.skills.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-sans"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveSkillTag(tag)}
                              className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-black"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {activeResume.skills.length === 0 && (
                          <span className="text-neutral-400 text-xs italic">No skills listed yet. Add tags below.</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. React.js, TailwindCSS, CSS, JSON"
                          value={newSkill}
                          onChange={(e) => setNewSkill(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkillTag())}
                          className="flex-grow p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddSkillTag}
                          className="px-4 py-2 bg-neutral-950 dark:bg-neutral-100 hover:opacity-95 text-white dark:text-black rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          Add Tag
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Work Experience */}
                  <div className="space-y-3 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white font-mono uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1.5">4. Jobs & Academic Projects</h3>
                    
                    {activeResume.workExperience.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {activeResume.workExperience.map((exp) => (
                          <div key={exp.id} className="p-2.5 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-800 text-xs flex justify-between items-center">
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white">{exp.role}</p>
                              <p className="text-[10px] text-neutral-400">{exp.company} • {exp.duration}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveExperience(exp.id)}
                              className="text-rose-550 hover:opacity-80 font-semibold p-1"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-white dark:bg-black rounded-xl p-3 border border-neutral-200 dark:border-neutral-800 space-y-2.5 text-xs">
                      <p className="text-[9px] font-mono tracking-wider text-neutral-400 font-bold uppercase">Add Experience Entry</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Your Role (e.g. Intern, Developer)"
                          value={draftExp.role}
                          onChange={(e) => setDraftExp(prev => ({ ...prev, role: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Company (e.g. Startup, University Lab)"
                          value={draftExp.company}
                          onChange={(e) => setDraftExp(prev => ({ ...prev, company: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Duration (e.g. Jun 2024 - Sep 2025)"
                          value={draftExp.duration}
                          onChange={(e) => setDraftExp(prev => ({ ...prev, duration: e.target.value }))}
                          className="col-span-2 p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddExperience}
                          className="bg-neutral-950 dark:bg-white text-white dark:text-black font-semibold rounded text-xs cursor-pointer"
                        >
                          Insert Entry
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Bullet Achievement (e.g. Refactored dynamic charts page using React, reducing time-to-render by 30%)"
                        value={draftExp.description[0]}
                        onChange={(e) => setDraftExp(prev => ({ ...prev, description: [e.target.value] }))}
                        className="w-full p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-[11px]"
                      />
                    </div>
                  </div>

                  {/* Education */}
                  <div className="space-y-3 bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white font-mono uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800 pb-1.5">5. Academic Credentials</h3>
                    
                    {activeResume.education.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {activeResume.education.map((edu) => (
                          <div key={edu.id} className="p-2.5 bg-white dark:bg-black rounded-lg border border-neutral-200 dark:border-neutral-805 text-xs flex justify-between items-center">
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white">{edu.degree}</p>
                              <p className="text-[10px] text-neutral-400">{edu.school} • {edu.duration} {edu.gpa ? `• GPA: ${edu.gpa}` : ""}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveEducation(edu.id)}
                              className="text-rose-550 hover:opacity-80 font-semibold p-1"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-white dark:bg-black rounded-xl p-3 border border-neutral-200 dark:border-neutral-800 space-y-2.5 text-xs">
                      <p className="text-[9px] font-mono tracking-wider text-neutral-400 font-bold uppercase">Add Education Degree</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Degree (e.g. B.S. Computer Science)"
                          value={draftEdu.degree}
                          onChange={(e) => setDraftEdu(prev => ({ ...prev, degree: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs"
                        />
                        <input
                          type="text"
                          placeholder="School (e.g. Berkeley University)"
                          value={draftEdu.school}
                          onChange={(e) => setDraftEdu(prev => ({ ...prev, school: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="Graduation Year / Years"
                          value={draftEdu.duration}
                          onChange={(e) => setDraftEdu(prev => ({ ...prev, duration: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs shadow-xs"
                        />
                        <input
                          type="text"
                          placeholder="GPA (e.g. 3.8/4.0)"
                          value={draftEdu.gpa || ""}
                          onChange={(e) => setDraftEdu(prev => ({ ...prev, gpa: e.target.value }))}
                          className="p-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-xs shadow-xs"
                        />
                        <button
                          type="button"
                          onClick={handleAddEducation}
                          className="bg-neutral-950 dark:bg-white text-white dark:text-black font-semibold rounded text-xs cursor-pointer"
                        >
                          Insert Entry
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 text-center">
                    <button
                      type="submit"
                      className="px-8 py-4 bg-neutral-950 dark:bg-neutral-100 hover:opacity-90 text-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-sm cursor-pointer"
                    >
                      Generate & View My Resume
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
              {currentStep === "resume" && (
              <div id="step-resume-panel" className="max-w-5xl mx-auto space-y-6">
                {resumeSelectionMode === "create" ? null : !hasResume ? (
                  <div className="relative min-h-[65vh] flex flex-col items-center justify-center">
                    {/* Center empty state box matching the wireframe precisely */}
                    <div className="flex flex-col items-center justify-center py-16 px-8 bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center max-w-xl w-full mx-auto my-6 transition-all duration-300">
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-400 flex items-center justify-center mb-6">
                        <FolderOpen className="w-8 h-8 text-black" />
                      </div>
                      <h3 className="text-xl font-black tracking-tight text-black uppercase font-mono">No Resumes Tailored</h3>
                      <p className="text-sm text-neutral-650 mt-3 max-w-sm leading-relaxed font-semibold">
                        Please click on 'Create New' to upload or create your resume. Once your resume is ready, you'll unlock all Auralis features.
                      </p>
                    </div>

                    {/* Floating Bottom Right Button styled and positioned precisely as shown in the wireframe */}
                    <div className="absolute bottom-[-32px] right-[-32px] sm:bottom-[-44px] sm:right-[-44px]">
                      <div className="group relative inline-block">
                        <button
                          id="btn-first-time-create-resume"
                          onClick={() => {
                            setChoiceModalPathway("upload");
                            setIsChoiceModalOpen(true);
                          }}
                          className="px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border-2 border-transparent flex items-center gap-2"
                          title="Start here to unlock Auralis."
                        >
                          <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                          <span>Create New</span>
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-black text-white text-[10px] font-bold uppercase tracking-wider py-1 px-2.5 rounded border border-white whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] pointer-events-none z-35 font-sans">
                          Start here to unlock Auralis.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative min-h-[65vh] flex flex-col justify-start items-start text-left p-2 animate-fadeIn">
                    <div className="max-w-3xl mr-auto text-left -mt-2 -ml-2 w-full">
                      <div 
                        onClick={() => setShowResumePreviewModal(true)}
                        className="w-full bg-white border-4 border-black rounded-3xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex justify-between items-center"
                      >
                        <div className="space-y-2">
                          <h3 className="text-xl font-black text-black tracking-tight font-sans">
                            {uploadedResumeMeta ? uploadedResumeMeta.name : (activeResume.fullName ? `${activeResume.fullName}'s Resume` : "My Resume")}
                          </h3>
                          <p className="text-xs font-mono font-bold text-neutral-550 uppercase tracking-wider">
                            Created: {localStorage.getItem("jd_resume_customizer_resume_created_at") || new Date().toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-right">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirmModal(true);
                            }}
                            className="text-xs font-black uppercase tracking-widest text-rose-600 hover:text-rose-800 hover:underline transition-all cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Floating Create New button in bottom right */}
                    <div className="absolute bottom-[-32px] right-[-32px] sm:bottom-[-44px] sm:right-[-44px]">
                      <button
                        id="btn-create-resume-setup-floating"
                        onClick={() => {
                          setChoiceModalPathway("upload");
                          setIsChoiceModalOpen(true);
                        }}
                        className="px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border-2 border-transparent flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                        <span>Create New</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Render Manual Build Form Fields Directly */}
                {resumeSelectionMode === "create" && (
                  <div className="max-w-3xl bg-white border-2 border-black rounded-3xl p-6 sm:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-fadeIn">
                    <div className="mb-6 pb-4 border-b border-neutral-250 text-left flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-black text-neutral-900 tracking-tight">
                          {hasResume ? "Edit your resume" : "Let's create your resume"}
                        </h3>
                        <p className="text-xs text-neutral-550 mt-1 font-medium font-sans">Fill out the fields below to construct a robust, ATS-compliant professional profile.</p>
                      </div>
                      {hasResume && (
                        <button
                          type="button"
                          onClick={() => setResumeSelectionMode(null)}
                          className="px-4 py-2 bg-neutral-150 hover:bg-neutral-200 text-neutral-700 hover:text-black rounded-lg text-xs font-bold transition cursor-pointer border-2 border-black"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!activeResume.fullName.trim()) {
                          showNotification("Please provide your full name.", "error");
                          return;
                        }
                        const wasLocked = !isUnlocked;
                        setHasResume(true);
                        localStorage.setItem("jd_resume_customizer_has_resume", "true");
                        setIsUnlocked(true);
                        sessionStorage.setItem("auralis_platform_unlocked", "true");
                        setOnboardingChoice("done");
                        sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                        localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
                        if (!localStorage.getItem("jd_resume_customizer_resume_created_at")) {
                          localStorage.setItem("jd_resume_customizer_resume_created_at", new Date().toLocaleDateString());
                        }
                        setOriginalResume(activeResume);
                        showNotification("Custom resume generated and loaded successfully! Platform unlocked.", "success");
                        setResumeSelectionMode(null);
                        if (wasLocked) {
                          setCurrentStep("dashboard");
                        }
                      }}
                      className="space-y-6 text-left"
                    >
                      {/* Contact Block */}
                      <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                        <h3 className="text-xs font-bold text-neutral-900 font-mono uppercase tracking-wider border-b border-neutral-200 pb-1.5">1. Contact & Identity</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">Full Name *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Alex Rivera"
                              value={activeResume.fullName}
                              onChange={(e) => handleUpdateContact("fullName", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">Email Address *</label>
                            <input
                              type="email"
                              required
                              placeholder="e.g. alex@rivera.com"
                              value={activeResume.email}
                              onChange={(e) => handleUpdateContact("email", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">Phone Number *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. +1 555-0199"
                              value={activeResume.phone}
                              onChange={(e) => handleUpdateContact("phone", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">LinkedIn URL</label>
                            <input
                              type="text"
                              placeholder="e.g. linkedin.com/in/alex"
                              value={activeResume.linkedin || ""}
                              onChange={(e) => handleUpdateContact("linkedin", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">Portfolio / Website</label>
                            <input
                              type="text"
                              placeholder="e.g. alexrivera.dev"
                              value={activeResume.website || ""}
                              onChange={(e) => handleUpdateContact("website", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Summary Block */}
                      <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                        <h3 className="text-xs font-bold text-neutral-900 font-mono uppercase tracking-wider border-b border-neutral-200 pb-1.5">2. Professional Pitch</h3>
                        <div>
                          <label className="block text-[9px] font-mono font-semibold uppercase text-neutral-550">Professional Summary *</label>
                          <textarea
                            required
                            rows={3}
                            placeholder="Highly motivated graduate skilled in frontend React architecture and UI engineering. Proven experience delivering responsive designs and analyzing software requirements."
                            value={activeResume.summary}
                            onChange={(e) => handleUpdateContact("summary", e.target.value)}
                            className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                          />
                        </div>
                      </div>

                      {/* Skills Block */}
                      <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                        <h3 className="text-xs font-bold text-neutral-900 font-mono uppercase tracking-wider border-b border-neutral-200 pb-1.5">3. Skill Tag Keywords</h3>
                        <div>
                          <div className="flex flex-wrap gap-1.5 mb-3 bg-white p-2.5 rounded-lg border border-neutral-200 min-h-12 items-center">
                            {activeResume.skills.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] bg-neutral-100 border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-sans font-bold"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSkillTag(tag)}
                                  className="text-neutral-400 hover:text-neutral-900 font-black cursor-pointer"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {activeResume.skills.length === 0 && (
                              <span className="text-neutral-400 text-xs italic">No skills listed yet. Add tags below.</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="e.g. React.js, TailwindCSS, CSS, JSON"
                              value={newSkill}
                              onChange={(e) => setNewSkill(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSkillTag())}
                              className="flex-grow p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleAddSkillTag}
                              className="px-4 py-2 bg-neutral-950 hover:opacity-95 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              Add Tag
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Work Experience */}
                      <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                        <h3 className="text-xs font-bold text-neutral-900 font-mono uppercase tracking-wider border-b border-neutral-200 pb-1.5">4. Jobs & Academic Projects</h3>
                        
                        {activeResume.workExperience.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {activeResume.workExperience.map((exp) => (
                              <div key={exp.id} className="p-2.5 bg-white rounded-lg border border-neutral-200 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-neutral-900">{exp.role}</p>
                                  <p className="text-[10px] text-neutral-400 font-bold">{exp.company} • {exp.duration}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExperience(exp.id)}
                                  className="text-rose-600 hover:opacity-80 font-bold p-1 cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-white rounded-xl p-3 border border-neutral-200 space-y-2.5 text-xs">
                          <p className="text-[9px] font-mono tracking-wider text-neutral-400 font-bold uppercase">Add Experience Entry</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Your Role (e.g. Intern, Developer)"
                              value={draftExp.role}
                              onChange={(e) => setDraftExp(prev => ({ ...prev, role: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-200 rounded text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Company (e.g. Startup, University Lab)"
                              value={draftExp.company}
                              onChange={(e) => setDraftExp(prev => ({ ...prev, company: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-200 rounded text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Duration (e.g. Jun 2024 - Sep 2025)"
                              value={draftExp.duration}
                              onChange={(e) => setDraftExp(prev => ({ ...prev, duration: e.target.value }))}
                              className="col-span-2 p-1.5 bg-white border border-neutral-250 rounded text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleAddExperience}
                              className="bg-neutral-950 text-white font-semibold rounded text-xs cursor-pointer py-1.5"
                            >
                              Insert Entry
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Bullet Achievement (e.g. Refactored dynamic charts page using React, reducing time-to-render by 30%)"
                            value={draftExp.description[0]}
                            onChange={(e) => setDraftExp(prev => ({ ...prev, description: [e.target.value] }))}
                            className="w-full p-2 bg-white border border-neutral-205 rounded text-[11px]"
                          />
                        </div>
                      </div>

                      {/* Education */}
                      <div className="space-y-3 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                        <h3 className="text-xs font-bold text-neutral-900 font-mono uppercase tracking-wider border-b border-neutral-200 pb-1.5">5. Academic Credentials</h3>
                        
                        {activeResume.education.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {activeResume.education.map((edu) => (
                              <div key={edu.id} className="p-2.5 bg-white rounded-lg border border-neutral-200 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-neutral-900">{edu.degree}</p>
                                  <p className="text-[10px] text-neutral-450 font-bold">{edu.school} • {edu.duration} {edu.gpa ? `• GPA: ${edu.gpa}` : ""}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEducation(edu.id)}
                                  className="text-rose-600 hover:opacity-80 font-bold p-1 cursor-pointer"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="bg-white rounded-xl p-3 border border-neutral-200 space-y-2.5 text-xs">
                          <p className="text-[9px] font-mono tracking-wider text-neutral-400 font-bold uppercase">Add Education Degree</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Degree (e.g. B.S. Computer Science)"
                              value={draftEdu.degree}
                              onChange={(e) => setDraftEdu(prev => ({ ...prev, degree: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-200 rounded text-xs"
                            />
                            <input
                              type="text"
                              placeholder="School (e.g. Berkeley University)"
                              value={draftEdu.school}
                              onChange={(e) => setDraftEdu(prev => ({ ...prev, school: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-200 rounded text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Graduation Year / Years"
                              value={draftEdu.duration}
                              onChange={(e) => setDraftEdu(prev => ({ ...prev, duration: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-250 rounded text-xs"
                            />
                            <input
                              type="text"
                              placeholder="GPA (e.g. 3.8/4.0)"
                              value={draftEdu.gpa || ""}
                              onChange={(e) => setDraftEdu(prev => ({ ...prev, gpa: e.target.value }))}
                              className="p-1.5 bg-white border border-neutral-250 rounded text-xs"
                            />
                            <button
                              type="button"
                              onClick={handleAddEducation}
                              className="bg-neutral-950 text-white font-semibold rounded text-xs cursor-pointer py-1.5"
                            >
                              Insert Degree
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 text-center">
                        <button
                          type="submit"
                          className="px-8 py-4 bg-neutral-950 hover:bg-neutral-900 text-white font-black text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-md cursor-pointer border-2 border-black"
                        >
                          Generate & Save My Resume
                        </button>
                      </div>
                    </form>
                  </div>
                )}

            {/* Modal Popup Overlay centered in the current workspace */}
            {isUploadModalOpen && (
              <div 
                id="upload-resume-modal-overlay" 
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setTempFile(null);
                  setUploadError(null);
                  setAnalysisResult(null);
                }}
              >
                <div 
                  id="upload-resume-modal" 
                  className="bg-white border-2 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-xl w-full overflow-hidden p-6 sm:p-8 animate-scaleUp text-left space-y-5 relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close button top right */}
                  <button
                    id="btn-close-upload-modal"
                    onClick={() => {
                      setIsUploadModalOpen(false);
                      setTempFile(null);
                      setUploadError(null);
                      setAnalysisResult(null);
                    }}
                    className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Header Titles Based on State */}
                  <div className="space-y-1">
                    <h3 className="text-xl font-black font-sans tracking-tight text-neutral-900 leading-tight">
                      {isAnalyzing 
                        ? "Recruiter AI Verification Scan"
                        : analysisResult
                          ? analysisResult.isResume 
                            ? "Resume Successfully Verified!" 
                            : "Invalid File: Verification Failed"
                          : "Upload your existing resume"
                      }
                    </h3>
                    <p className="text-xs text-neutral-550 font-sans font-medium">
                      {isAnalyzing 
                        ? "Please wait while Gemini performs a deep AST audit on your content..."
                        : analysisResult
                          ? analysisResult.isResume 
                            ? "Our AI detected valid structures and generated optimization metrics."
                            : "The uploaded file does not meet standard resume requirements."
                          : "Select or drop your file to parse and customize it against ATS job queries."
                      }
                    </p>
                  </div>

                  {/* 1. Loader View */}
                  {isAnalyzing && (
                    <div className="border-2 border-black rounded-2xl p-8 flex flex-col items-center justify-center space-y-4 bg-blue-50/10 min-h-[220px]">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute" />
                        <span className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></span>
                      </div>
                      <div className="space-y-1.5 text-center max-w-sm">
                        <p className="text-sm font-black text-neutral-800 font-mono uppercase tracking-wide">Scanning structure...</p>
                        <p className="text-[11px] text-neutral-550 font-sans leading-relaxed font-semibold">
                          We are validating key profile details, scanning contact coordinates, and evaluating ATS keyword readiness.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 2. Normal File Selection Area */}
                  {!isAnalyzing && !analysisResult && (
                    <>
                      {/* Hidden browser file input */}
                      <input
                        id="file-uploader-popup-input"
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx"
                        onChange={handleFileChange}
                      />

                      {/* Drag and Drop Container Zone */}
                      <label
                        htmlFor="file-uploader-popup-input"
                        id="drag-drop-zone-popup"
                        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center space-y-4 relative min-h-[180px] ${
                          dragActive 
                            ? "border-blue-500 bg-blue-50/20 scale-[101%]" 
                            : tempFile 
                              ? "border-emerald-500 bg-emerald-50/10" 
                              : "border-neutral-300 hover:border-neutral-500 bg-neutral-50/30 font-sans"
                        }`}
                        onDragEnter={handleDragOverOrEnter}
                        onDragOver={handleDragOverOrEnter}
                        onDragLeave={handleDragOverOrEnter}
                        onDrop={handleFileDrop}
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center text-blue-500">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-neutral-800 tracking-tight font-sans">
                              Drag and drop file here, or browse files
                            </p>
                            <p className="text-[10px] text-neutral-450 font-mono uppercase tracking-wider font-bold">
                              Supported formats: PDF, DOCX
                            </p>
                          </div>
                        </div>
                      </label>
                    </>
                  )}

                  {/* 3. Analysis Reports View */}
                  {!isAnalyzing && analysisResult && (
                    <div className="space-y-5">
                      {/* Scenario 3A. Is NOT a Resume */}
                      {!analysisResult.isResume ? (
                        <div className="border-2 border-rose-500 bg-rose-50/20 rounded-2xl p-5 space-y-3.5">
                          <div className="flex items-start gap-3">
                            <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-black text-rose-950 uppercase font-mono tracking-wide">Document Rejected</p>
                              <p className="text-[11px] text-neutral-700 font-semibold mt-1 font-sans leading-relaxed">
                                maybe you uploaded a wrong file. The scanned uploaded document isnt a resume. please check and retry again
                              </p>
                            </div>
                          </div>
                          
                          <div className="pt-1.5 flex justify-start">
                            <button
                              type="button"
                              onClick={() => {
                                setTempFile(null);
                                setAnalysisResult(null);
                              }}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
                            >
                              Try Another File
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Scenario 3B. Is a legitimate Resume! */
                        <div className="space-y-4">
                          {/* Success and dynamic audit score meter */}
                          <div className="border-2 border-emerald-500 bg-emerald-50/20 rounded-2xl p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                              <div className="text-left">
                                <span className="text-xs uppercase font-mono font-black text-emerald-800 tracking-wide">Verified Format</span>
                                <p className="text-xs text-neutral-700 font-bold font-sans mt-0.5">
                                  {tempFile?.name || "Uploaded Resume"}
                                </p>
                              </div>
                            </div>

                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500">Completeness</span>
                              <div className="flex items-baseline gap-0.5 mt-0.5">
                                <span className="text-2xl font-black text-emerald-700 font-mono">{analysisResult.confidenceScore}</span>
                                <span className="text-xs font-mono font-black text-neutral-500">/100</span>
                              </div>
                            </div>
                          </div>

                          {/* Horizontal Score Progress Bar */}
                          <div className="w-full bg-neutral-100 rounded-full h-2.5 border border-black overflow-hidden relative">
                            <div 
                              className="bg-emerald-550 h-full rounded-full transition-all duration-500"
                              style={{ width: `${analysisResult.confidenceScore}%` }}
                            />
                          </div>

                          {/* Two column lists: Profile extraction + Missing Checklist */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Detected Info Column */}
                            <div className="border border-neutral-200 rounded-xl p-3.5 space-y-2 bg-neutral-50/50">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500 block">Candidate Profile Found</span>
                              <div className="space-y-1 text-xs">
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium">Name:</span> {analysisResult.detectedProfile.fullName || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium">Email:</span> {analysisResult.detectedProfile.email || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium">Phone:</span> {analysisResult.detectedProfile.phone || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800"><span className="text-neutral-500 font-medium">Skills Identified:</span> <span className="px-1.5 py-0.5 bg-neutral-200 text-neutral-800 rounded font-mono text-[10px] font-black">{analysisResult.detectedProfile.skills?.length || 0} items</span></p>
                              </div>
                            </div>

                            {/* Missing Standard Items Column */}
                            <div className="border border-neutral-200 rounded-xl p-3.5 space-y-2 bg-neutral-50/50">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500 block">Section Checklist</span>
                              <div className="space-y-1.5 scroll-container max-h-32 overflow-y-auto">
                                {analysisResult.missingItems.length === 0 ? (
                                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-black">
                                    <Check className="w-4 h-4" />
                                    <span>All Standard Sections Found</span>
                                  </div>
                                ) : (
                                  analysisResult.missingItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-xs text-neutral-600 font-semibold font-sans">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                      <span>Missing {item}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Recruiter optimization suggestions */}
                          {analysisResult.actionableImprovements?.length > 0 && (
                            <div className="border border-neutral-200 rounded-xl p-4 bg-orange-50/20 space-y-2 text-left">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-600 tracking-wide block">Recruiter Action Plan</span>
                              <ul className="space-y-1.5">
                                {analysisResult.actionableImprovements.slice(0, 3).map((improvement, index) => (
                                  <li key={index} className="text-xs text-neutral-700 font-semibold flex items-start gap-2 font-sans leading-relaxed">
                                    <span className="text-blue-500 font-bold mt-0.5 flex-shrink-0">•</span>
                                    <span>{improvement}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Operational Validation Alert Notification */}
                  {uploadError && !isAnalyzing && (
                    <div className="flex items-center gap-2 p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 text-xs font-bold animate-fadeIn font-sans">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {/* Footer Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-center sm:justify-end gap-3.5 pt-2 font-sans">
                    <button
                      id="btn-cancel-upload-popup"
                      type="button"
                      disabled={isAnalyzing}
                      onClick={() => {
                        setIsUploadModalOpen(false);
                        setTempFile(null);
                        setUploadError(null);
                        setAnalysisResult(null);
                      }}
                      className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition duration-150 cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {analysisResult ? "Dismiss" : "Cancel"}
                    </button>

                    <button
                      id="btn-continue-upload-popup"
                      type="button"
                      disabled={isAnalyzing || !tempFile || (analysisResult !== null && !analysisResult.isResume)}
                      onClick={handleContinueUpload}
                      className={`w-full sm:w-auto px-5 py-3 font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition duration-150 border-2 ${
                        (tempFile && !isAnalyzing && (analysisResult === null || analysisResult.isResume))
                          ? "bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed"
                      }`}
                    >
                      {analysisResult ? "Import & Continue 🚀" : "Continue"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------------------- STEP 2: PASTE JOB DESCRIPTION & JD SIMPLIFIER -------------------- */}
        {currentStep === "jd" && (
          <div id="step-jd-panel" className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm relative">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2 font-display">
                  <BookOpen className="w-4 h-4 text-neutral-800 dark:text-neutral-200" /> Paste Job Description (JD)
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  We'll extract exactly what hiring managers want to hear, translating corporate jargon into plain graduate objectives.
                </p>
              </div>

              {/* Target labels */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] uppercase font-mono text-neutral-500 dark:text-neutral-400 tracking-wider font-semibold">Target Company Name</label>
                  <input
                    id="input-target-company"
                    type="text"
                    required
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    placeholder="e.g. Vercel Systems"
                    className="w-full mt-1.5 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-mono text-neutral-500 dark:text-neutral-400 tracking-wider font-semibold">Target Job Role/Title</label>
                  <input
                    id="input-target-role"
                    type="text"
                    required
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="Junior Frontend Engineer"
                    className="w-full mt-1.5 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Presets load bar */}
              <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <span className="text-[10px] uppercase font-mono text-neutral-400 dark:text-neutral-500 font-semibold">Load Sample Job Template:</span>
                <button
                  id="btn-load-jd-frontend"
                  onClick={() => loadPresetJD("frontend_eng")}
                  className="px-2.5 py-1 text-[11px] bg-white hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-850 text-neutral-750 dark:text-neutral-300 rounded border border-neutral-200 dark:border-neutral-705 transition cursor-pointer"
                >
                  Vercel Systems - Junior Frontend
                </button>
                <button
                  id="btn-load-jd-marketer"
                  onClick={() => loadPresetJD("growth_marketer")}
                  className="px-2.5 py-1 text-[11px] bg-white hover:bg-neutral-100 dark:bg-neutral-800 dark:hover:bg-neutral-850 text-neutral-750 dark:text-neutral-300 rounded border border-neutral-200 dark:border-neutral-705 transition cursor-pointer"
                >
                  ScribeAI - Outreach Specialist
                </button>
              </div>

              {/* Raw Text inputs */}
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-mono text-neutral-500 dark:text-neutral-400 tracking-wider font-semibold">Full Raw Job Post Content</label>
                <textarea
                  id="textarea-jd"
                  rows={8}
                  placeholder="Paste the full job posting text, including responsibilities, prerequisites, background summary..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  className="w-full p-3 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 text-xs rounded-xl focus:border-neutral-800 outline-none text-neutral-850 dark:text-neutral-200 leading-relaxed font-sans"
                />
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  id="btn-back-to-resume-setup"
                  onClick={() => setCurrentStep("resume")}
                  className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300 text-xs font-semibold rounded-lg transition shadow-xs"
                >
                  Back to Resume Setup
                </button>
                <button
                  id="btn-simplify-jd"
                  onClick={triggerJDAnaysis}
                  disabled={isSimplifyingJd || !jdText.trim()}
                  className="px-5 py-2.5 bg-neutral-950 dark:bg-neutral-100 hover:opacity-90 disabled:opacity-50 text-white dark:text-black text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
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
              <div id="simplified-jd-section" className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2 font-display">
                  <CheckCircle2 className="w-5 h-5 text-neutral-900 dark:text-neutral-150" /> Simplified Job Analysis
                </h3>

                {/* Company Pitch */}
                <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 uppercase font-mono tracking-wider mb-1">Company Elevator Pitch (No Jargon)</h4>
                  <p className="text-xs tracking-wide leading-relaxed text-neutral-750 dark:text-neutral-300 font-normal">
                    {simplifiedJd.companyPitch}
                  </p>
                </div>

                {/* Skills mapped out */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-500 uppercase font-mono tracking-wider mb-2">High Priority Required Core Stack</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").map((s, idx) => (
                        <span key={idx} className="bg-neutral-950 dark:bg-white text-white dark:text-black border border-neutral-800 text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-black font-semibold"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").length === 0 && (
                        <span className="text-[10px] text-neutral-450 font-normal">None found.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-neutral-500 uppercase font-mono tracking-wider mb-2">Medium Priority / Preferred Skillsets</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").map((s, idx) => (
                        <span key={idx} className="bg-neutral-105 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").length === 0 && (
                        <span className="text-[10px] text-neutral-450 font-normal">None found.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Responsibilities list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 uppercase font-mono tracking-wider mb-2">What they expect you to do daily</h4>
                    <ul className="list-none space-y-1.5">
                      {simplifiedJd.keyResponsibilities.map((resp, idx) => (
                        <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100 flex-shrink-0 mt-0.5" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 uppercase font-mono tracking-wider mb-2">Graduate Behavioral Expectations</h4>
                    <ul className="list-none space-y-1.5">
                      {simplifiedJd.candidateExpectations.map((exp, idx) => (
                        <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-neutral-900 dark:text-neutral-100 flex-shrink-0 mt-0.5" />
                          <span>{exp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Automation keywords tags */}
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
                  <h4 className="text-xs font-bold text-neutral-500 uppercase font-mono tracking-wider mb-2">Target ATS Keyword Search Terms (Pass Filters)</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {simplifiedJd.keywordsToTarget.map((kw, idx) => (
                      <span key={idx} className="text-[10px] bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-300 px-2.5 py-1 rounded-full font-mono font-semibold">
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
                    className="py-3 px-6 bg-neutral-950 dark:bg-white hover:opacity-90 text-white dark:text-black text-xs font-bold rounded-xl transition active:scale-[98%] flex inline-flex items-center gap-1 justify-center cursor-pointer shadow-xs"
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
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-1.5 font-display">
                    <Sparkles className="w-4 h-4 text-neutral-800 dark:text-neutral-200" /> Resume Personalization
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Comparing resume metrics against <b>{targetCompany || "Employer"}</b> requirements. Click Apply on suggestions.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    id="btn-re-tailor"
                    onClick={triggerResumeTailor}
                    disabled={isTailoring}
                    className="flex-1 py-2 px-3 bg-neutral-950 dark:bg-neutral-100 hover:opacity-90 disabled:opacity-50 text-white dark:text-black text-xs font-bold rounded-lg transition text-center flex items-center justify-center gap-1 cursor-pointer"
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
                      className="px-3 bg-neutral-105 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold border border-neutral-250 dark:border-neutral-800 transition"
                      title="Undo AI changes and restore original details"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Undo AI Changes</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Suggestions Desk List */}
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                    AI Recommendations ({suggestions.filter(s => !s.applied).length} pending)
                  </h4>
                  {suggestions.some(s => !s.applied) && (
                    <button
                      id="btn-apply-all-suggestions"
                      onClick={handleApplyAllSuggestions}
                      className="text-[10px] font-bold text-neutral-805 hover:text-black dark:text-neutral-300 dark:hover:text-white hover:underline flex items-center gap-1"
                    >
                      <span>Apply All ({suggestions.filter(s => !s.applied).length})</span>
                    </button>
                  )}
                </div>

                {isTailoring && (
                  <div className="text-center py-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-[#555] dark:text-white animate-spin mx-auto" />
                    <p className="text-xs text-neutral-500 font-medium">Drafting expert recruiter amendments based on STAR methodology...</p>
                  </div>
                )}

                {!isTailoring && suggestions.length === 0 && (
                  <div className="text-center py-8 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <AlertTriangle className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                    <p className="text-xs text-neutral-500">No suggestions loaded. Click on "Run Optimization Scan" to analyze.</p>
                  </div>
                )}

                {!isTailoring && suggestions.length > 0 && (
                  <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                    {suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed transition ${
                          sug.applied
                            ? "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 opacity-60 text-neutral-500"
                            : "bg-white dark:bg-black border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase font-mono tracking-wider text-neutral-500 dark:text-neutral-400">
                            {sug.section} suggestion • {sug.type} Standard
                          </span>
                          {sug.applied ? (
                            <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1 font-sans">
                              <Check className="w-3 h-3" /> Implemented
                            </span>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                id={`btn-reject-sug-${sug.id}`}
                                onClick={() => handleRejectSuggestion(sug.id)}
                                className="text-[10px] font-bold text-neutral-400 hover:text-neutral-600"
                              >
                                Skip
                              </button>
                              <button
                                id={`btn-accept-sug-${sug.id}`}
                                onClick={() => handleAcceptSuggestion(sug)}
                                className="text-[10px] font-bold text-neutral-900 dark:text-white hover:underline"
                              >
                                Accept & Apply
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Description content */}
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 italic mb-2 font-normal">"{sug.reason}"</p>
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-850 text-[11px] font-sans">
                          {sug.originalText && (
                            <span className="block text-neutral-400 dark:text-neutral-550 line-through mb-1">
                              Was: {sug.originalText}
                            </span>
                          )}
                          <span className="block text-neutral-800 dark:text-neutral-200">
                            Change to: <b>{sug.suggestedText}</b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ATS Checker Compliance Desk */}
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-widest font-mono">
                    ATS Audit Simulator
                  </h4>
                  <button
                    id="btn-run-ats-audit"
                    onClick={triggerATSAudit}
                    disabled={isAuditingATS}
                    className="text-xs text-neutral-850 hover:text-black dark:text-neutral-300 dark:hover:text-white font-bold hover:underline flex items-center gap-1 cursor-pointer"
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
                    <div className="flex items-center gap-4 bg-neutral-50 dark:bg-black p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800">
                      <div className="relative w-14 h-14 flex items-center justify-center rounded-full bg-neutral-950 dark:bg-white border border-neutral-800 dark:border-neutral-200 shadow-xs">
                        <span className="text-sm font-black text-white dark:text-black">
                          {atsResult.score}%
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white">
                          Verdict: {atsResult.passed ? "Strong Candidate (Passed)" : "Optimization Needed"}
                        </p>
                        <p className="text-[10px] text-neutral-500 mt-0.5 font-normal">Automated screening metrics verified against corporate filters</p>
                      </div>
                    </div>

                    {/* Criteria checklist outputs */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {atsResult.criteria.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-850 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-neutral-805 dark:text-neutral-200 text-[11px]">{item.name}</span>
                            <span className={`text-[10px] font-bold ${item.passed ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-450 dark:text-neutral-500"}`}>
                              {item.passed ? "Passed" : "Action Required"}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-500 mb-1 leading-normal font-sans">{item.description}</p>
                          <p className="text-xs text-neutral-700 dark:text-neutral-300 bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 p-2 rounded leading-relaxed">{item.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <p className="text-xs text-neutral-500">Analyze formatting, language density, & keywords score on single screen.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Style customizers, Preview Sheet, Save & Download Options */}
            <div className="lg:col-span-7 space-y-6">
              {/* Style controls and Save drawer */}
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4.5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-2">
                  <button
                    id="save-version-cta"
                    onClick={handleSaveCurrentVersion}
                    className="px-4 py-2 bg-neutral-950 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-[97%] cursor-pointer"
                    title="Store this customized configuration for specific target"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Tailored Version</span>
                  </button>

                  <button
                    id="btn-copy-outline"
                    onClick={handleCopyText}
                    className="px-3 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-850 text-neutral-700 dark:text-neutral-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-neutral-200 dark:border-neutral-800 transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    id="btn-download-json-direct"
                    onClick={handleDownloadJSON}
                    className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-850 border border-neutral-200 dark:border-neutral-800 rounded-xl text-xs text-neutral-700 dark:text-neutral-300 font-semibold cursor-pointer"
                    title="Export backup schema"
                  >
                    Export JSON
                  </button>

                  <button
                    id="btn-print-pdf-direct"
                    onClick={handlePrintDownload}
                    className="px-4 py-2 bg-neutral-950 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-[97%] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save as PDF</span>
                  </button>
                </div>
              </div>

              {/* Template Style Switcher inside preview box */}
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <span className="text-xs text-neutral-500 font-mono">Real-time Designer Canvas:</span>
                <div className="flex gap-1 bg-neutral-50 dark:bg-black p-1 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
                  <button
                    onClick={() => setSelectedStyle("tech")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "tech" ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-bold" : "text-neutral-400 hover:text-neutral-900"}`}
                  >
                    Tech Monospace
                  </button>
                  <button
                    onClick={() => setSelectedStyle("classic")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "classic" ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-bold" : "text-neutral-400 hover:text-neutral-900"}`}
                  >
                    Classic Minimal
                  </button>
                  <button
                    onClick={() => setSelectedStyle("executive")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "executive" ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-bold" : "text-neutral-400 hover:text-neutral-900"}`}
                  >
                    Executive Navy
                  </button>
                  <button
                    onClick={() => setSelectedStyle("two-column")}
                    className={`px-3 py-1 rounded-lg transition ${selectedStyle === "two-column" ? "bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-bold" : "text-neutral-400 hover:text-neutral-900"}`}
                  >
                    Original Two-Column
                  </button>
                </div>
              </div>

              {/* Actual structured preview component */}
              <div className="max-h-[750px] overflow-y-auto rounded-2xl scrollbar-none border border-neutral-250 dark:border-neutral-800 print-container select-all">
                <ResumePreview resume={activeResume} templateStyle={selectedStyle} />
              </div>
            </div>
          </div>
        )}

        {/* -------------------- STEP: SAVED COPIES / VERSIONS LIST -------------------- */}
        {currentStep === "saves" && (
          <div id="step-versions-panel" className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm relative">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2 font-display">
                  <FolderOpen className="w-5 h-5 text-neutral-800 dark:text-neutral-200" /> Saved Resume Versions ({savedVersions.length})
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Manage independent tailored drafts labeled by employer targets and positions on single screen.
                </p>
              </div>

              {savedVersions.length === 0 ? (
                <div className="text-center py-12 bg-neutral-50 dark:bg-black rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  <FileText className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
                  <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300">No versions saved yet</h4>
                  <p className="text-[11px] text-neutral-500 max-w-xs mx-auto mt-1">
                    When optimizing your professional summary, you can click "Save Tailored Version" to capture the draft.
                  </p>
                  <button
                    id="btn-return-tailoring"
                    onClick={() => setCurrentStep("tailor")}
                    className="mt-4 px-4 py-2 bg-neutral-950 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold rounded-lg transition cursor-pointer"
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
                      className="p-4 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-neutral-900 hover:bg-neutral-100/50 dark:hover:bg-neutral-900 cursor-pointer transition relative group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono text-[9px] uppercase font-bold text-neutral-500 bg-white dark:bg-neutral-900 px-2.5 py-1 rounded border border-neutral-200 dark:border-neutral-800">
                            {version.savedAt}
                          </span>
                          <button
                            id={`btn-delete-ver-${version.id}`}
                            onClick={(e) => handleDeleteVersion(version.id, e)}
                            className="text-neutral-400 hover:text-rose-500 p-1 opacity-85 transition"
                            title="Delete this saved copy"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="text-xs font-black text-neutral-900 dark:text-white font-display mt-2">{version.companyName}</h4>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-semibold mt-0.5">{version.jobTitle}</p>
                        <p className="text-[10px] text-neutral-500 mt-2 font-mono">Candidate: {version.resumeData.fullName}</p>
                      </div>

                      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3.5 mt-4 flex items-center justify-between text-[10px] text-neutral-500">
                        <span className="flex items-center gap-1 font-semibold text-neutral-900 dark:text-neutral-100">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {version.appliedSuggestionsCount} items tailored
                        </span>
                        <span className="text-neutral-850 dark:text-neutral-200 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
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
              {/* Footer Design inside workspace */}
              {currentStep !== "resume" && (
                <footer id="app-footer" className="mt-20 border-t border-neutral-205 dark:border-neutral-800 pt-8 pb-12 text-center text-neutral-500 text-xs print-hide">
                  <p className="font-mono text-[9px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest font-semibold">Crafted for Future Professionals</p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1 max-w-sm mx-auto font-normal">
                    Optimizes graduate portfolios against modern recruitment trackers with absolute confidence.
                  </p>
                  <p className="text-[10px] text-neutral-500 mt-4">&copy; {new Date().getFullYear()} JD to Resume Customizer. Open Source Licensing.</p>
                </footer>
              )}
            </main>
          </div>
        </div>
      )}

      {/* Standalone hidden print preview container that activates only for window.print() */}
      <div className="hidden print:block print-container">
        <ResumePreview resume={activeResume} templateStyle={selectedStyle} id="resume-preview-sheet-print" />
      </div>

      {showNoResumeAlert && (
        <div 
          id="custom-no-resume-alert-backdrop"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
        >
          <div 
            id="custom-no-resume-alert-modal"
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn animate-fadeIn"
          >
            <div className="mx-auto w-16 h-16 rounded-full border-2 border-black flex items-center justify-center bg-amber-100 text-black">
              <AlertTriangle className="w-8 h-8 text-amber-600 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Resume Setup Required</h3>
              <p className="text-xs text-neutral-800 leading-relaxed font-bold font-sans">
                Please upload or create your resume first.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
              <button
                id="btn-alert-go-to-resume-setup"
                onClick={() => {
                  setShowNoResumeAlert(false);
                  setCurrentStep("resume");
                }}
                className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Go to Resume Setup
              </button>
              <button
                id="btn-alert-dismiss"
                onClick={() => setShowNoResumeAlert(false)}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume Quick Preview Modal */}
      {showResumePreviewModal && (
        <div 
          id="resume-preview-popup-backdrop"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setShowResumePreviewModal(false)}
        >
          <div 
            id="resume-preview-popup-modal"
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-2xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              id="btn-close-preview-popup"
              onClick={() => setShowResumePreviewModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-4 text-left border-b-2 border-black pb-3">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Original Resume Document</h3>
              <p className="text-xs text-neutral-550 font-medium font-sans">Preview the original un-tailored resume details.</p>
            </div>

            {/* Body: scrollable preview */}
            <div className="flex-1 overflow-y-auto pr-1 border border-neutral-250 rounded-xl mb-6 bg-neutral-50 p-4">
              {uploadedPdfBase64 ? (
                <iframe
                  src={`data:application/pdf;base64,${uploadedPdfBase64}#toolbar=0&navpanes=0`}
                  className="w-full h-[550px] border border-neutral-300 rounded-lg"
                  title="Original Resume PDF"
                />
              ) : (
                <ResumePreview resume={originalResume} templateStyle="two-column" />
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end border-t border-neutral-200 mt-2">
              <button
                id="btn-preview-popup-delete"
                onClick={() => {
                  setShowResumePreviewModal(false);
                  setShowDeleteConfirmModal(true);
                }}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Resume</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div 
          id="delete-resume-confirm-backdrop"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
          onClick={() => setShowDeleteConfirmModal(false)}
        >
          <div 
            id="delete-resume-confirm-modal"
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              id="btn-close-delete-confirm"
              onClick={() => setShowDeleteConfirmModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-16 h-16 rounded-full border-2 border-black flex items-center justify-center bg-rose-100 text-rose-600">
              <Trash2 className="w-8 h-8 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Delete Resume?</h3>
              <p className="text-xs text-neutral-800 leading-relaxed font-bold font-sans">
                Are you sure you want to delete this resume? This will clear your profile and lock all tailored features.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
              <button
                id="btn-confirm-delete-yes"
                onClick={() => {
                  // Reset states
                  setHasResume(false);
                  localStorage.setItem("jd_resume_customizer_has_resume", "false");
                  setIsUnlocked(false);
                  sessionStorage.setItem("auralis_platform_unlocked", "false");
                  
                  // Clear metadata & files
                  setUploadedResumeMeta(null);
                  setUploadedPdfBase64(null);
                  localStorage.removeItem("jd_resume_customizer_uploaded_resume_meta");
                  localStorage.removeItem("jd_resume_customizer_uploaded_pdf_base64");
                  localStorage.removeItem("jd_resume_customizer_resume_created_at");
                  localStorage.removeItem("jd_resume_customizer_onboarding_done");
                  sessionStorage.removeItem("auralis_onboarding_dismissed");
                  
                  // Reset active & original resume objects
                  const emptyResume = {
                    fullName: "",
                    email: "",
                    phone: "",
                    linkedin: "",
                    website: "",
                    summary: "",
                    workExperience: [],
                    education: [],
                    skills: []
                  };
                  setActiveResume(emptyResume);
                  setOriginalResume(emptyResume);
                  localStorage.removeItem("jd_resume_customizer_active_resume");
                  localStorage.removeItem("jd_resume_customizer_original_resume");
                  
                  setShowDeleteConfirmModal(false);
                  showNotification("Resume deleted successfully. Platform locked.", "info");
                }}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Yes, Delete
              </button>
              <button
                id="btn-confirm-delete-cancel"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Choice Selector Modal */}
      {isChoiceModalOpen && (
        <div 
          id="choice-resume-modal-backdrop" 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
          onClick={() => {
            setIsChoiceModalOpen(false);
            setTempFile(null);
            setUploadError(null);
            setAnalysisResult(null);
          }}
        >
          <div 
            id="choice-resume-modal" 
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-xl w-full p-6 sm:p-8 animate-scaleUp text-left space-y-6 relative flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button top right */}
            <button
              id="btn-close-choice-modal"
              onClick={() => {
                setIsChoiceModalOpen(false);
                setTempFile(null);
                setUploadError(null);
                setAnalysisResult(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="space-y-1 text-left">
              <h3 className="text-xl font-black font-sans tracking-tight text-neutral-900 leading-tight">
                Setup your resume
              </h3>
              <p className="text-xs text-neutral-550 font-sans font-medium">
                Choose how you want to add your resume to Auralis to unlock tailored features.
              </p>
            </div>

            {/* Radio selectors (Only if not analyzing and no analysis result yet) */}
            {!isAnalyzing && !analysisResult && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Upload Card */}
                <button
                  type="button"
                  onClick={() => setChoiceModalPathway("upload")}
                  className={`p-4 bg-white border-2 border-black rounded-xl text-left transition-all duration-150 cursor-pointer flex items-center justify-between shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                    choiceModalPathway === "upload" ? "ring-2 ring-blue-500 bg-blue-50/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 border-black flex items-center justify-center bg-white`}>
                      {choiceModalPathway === "upload" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-black text-neutral-800 font-sans">Upload Resume</p>
                      <p className="text-[10px] text-neutral-500 font-medium font-sans">PDF or DOCX file</p>
                    </div>
                  </div>
                </button>

                {/* Create Card (Disabled - Coming Soon) */}
                <button
                  type="button"
                  disabled
                  className="p-4 bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-xl text-left flex items-center justify-between opacity-70 cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-neutral-300 flex items-center justify-center bg-neutral-100">
                      {/* Empty circle since it cannot be selected */}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-black text-neutral-400 font-sans">Create Resume</p>
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-black uppercase tracking-wider font-mono">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-450 font-medium font-sans">Manual form builder will be available in a future release</p>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Scrollable Container for sub-views */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
              {/* PATHWAY 1: UPLOAD RESUME */}
              {choiceModalPathway === "upload" && (
                <div className="space-y-4">
                  {/* Loader */}
                  {isAnalyzing && (
                    <div className="border-2 border-black rounded-2xl p-8 flex flex-col items-center justify-center space-y-4 bg-blue-50/10 min-h-[220px]">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute" />
                        <span className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></span>
                      </div>
                      <div className="space-y-1.5 text-center max-w-sm">
                        <p className="text-sm font-black text-neutral-800 font-mono uppercase tracking-wide">Scanning structure...</p>
                        <p className="text-[11px] text-neutral-550 font-sans leading-relaxed font-semibold">
                          We are validating key profile details, scanning contact coordinates, and evaluating ATS keyword readiness.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Drag and Drop Zone */}
                  {!isAnalyzing && !analysisResult && (
                    <>
                      <input
                        id="choice-file-input"
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx"
                        onChange={handleFileChange}
                      />
                      <label
                        htmlFor="choice-file-input"
                        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center space-y-4 relative min-h-[180px] ${
                          dragActive 
                            ? "border-blue-500 bg-blue-50/20 scale-[101%]" 
                            : tempFile 
                              ? "border-emerald-500 bg-emerald-50/10" 
                              : "border-neutral-300 hover:border-neutral-500 bg-neutral-550/5 font-sans"
                        }`}
                        onDragEnter={handleDragOverOrEnter}
                        onDragOver={handleDragOverOrEnter}
                        onDragLeave={handleDragOverOrEnter}
                        onDrop={handleFileDrop}
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-blue-50 border-2 border-blue-500 flex items-center justify-center text-blue-500">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-neutral-800 tracking-tight font-sans">
                              Drag and drop file here, or browse files
                            </p>
                            <p className="text-[10px] text-neutral-455 font-mono uppercase tracking-wider font-bold">
                              Supported formats: PDF, DOCX
                            </p>
                          </div>
                        </div>
                      </label>
                    </>
                  )}

                  {/* Analysis reports */}
                  {!isAnalyzing && analysisResult && (
                    <div className="space-y-5">
                      {!analysisResult.isResume ? (
                        <div className="border-2 border-rose-500 bg-rose-50/20 rounded-2xl p-5 space-y-3.5">
                          <div className="flex items-start gap-3">
                            <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-black text-rose-950 uppercase font-mono tracking-wide">Document Rejected</p>
                              <p className="text-[11px] text-neutral-750 font-semibold mt-1 font-sans leading-relaxed">
                                maybe you uploaded a wrong file. The scanned uploaded document isnt a resume. please check and retry again
                              </p>
                            </div>
                          </div>
                          <div className="pt-1.5 flex justify-start">
                            <button
                              type="button"
                              onClick={() => {
                                setTempFile(null);
                                setAnalysisResult(null);
                              }}
                              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
                            >
                              Try Another File
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="border-2 border-emerald-500 bg-emerald-50/20 rounded-2xl p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                              <div className="text-left">
                                <span className="text-xs uppercase font-mono font-black text-emerald-800 tracking-wide">Verified Format</span>
                                <p className="text-xs text-neutral-700 font-bold font-sans mt-0.5">
                                  {tempFile?.name || "Uploaded Resume"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500 font-bold">Completeness</span>
                              <div className="flex items-baseline gap-0.5 mt-0.5">
                                <span className="text-2xl font-black text-emerald-700 font-mono">{analysisResult.confidenceScore}</span>
                                <span className="text-xs font-mono font-black text-neutral-550">/100</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-full bg-neutral-100 rounded-full h-2.5 border border-black overflow-hidden relative">
                            <div 
                              className="bg-emerald-550 h-full rounded-full transition-all duration-500"
                              style={{ width: `${analysisResult.confidenceScore}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="border border-neutral-200 rounded-xl p-3.5 space-y-2 bg-neutral-50/50">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500 block">Candidate Profile Found</span>
                              <div className="space-y-1 text-xs">
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium font-sans">Name:</span> {analysisResult.detectedProfile.fullName || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium font-sans">Email:</span> {analysisResult.detectedProfile.email || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800 truncate"><span className="text-neutral-500 font-medium font-sans">Phone:</span> {analysisResult.detectedProfile.phone || "Not Specified"}</p>
                                <p className="font-bold text-neutral-800"><span className="text-neutral-500 font-medium font-sans">Skills:</span> <span className="px-1.5 py-0.5 bg-neutral-200 text-neutral-800 rounded font-mono text-[10px] font-black">{analysisResult.detectedProfile.skills?.length || 0} items</span></p>
                              </div>
                            </div>
                            <div className="border border-neutral-200 rounded-xl p-3.5 space-y-2 bg-neutral-50/50">
                              <span className="text-[10px] uppercase font-mono font-black text-neutral-500 block">Section Checklist</span>
                              <div className="space-y-1.5 scroll-container max-h-32 overflow-y-auto">
                                {analysisResult.missingItems.length === 0 ? (
                                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-black">
                                    <Check className="w-4 h-4" />
                                    <span>All Standard Sections Found</span>
                                  </div>
                                ) : (
                                  analysisResult.missingItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-xs text-neutral-600 font-semibold font-sans">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                      <span>Missing {item}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {uploadError && !isAnalyzing && (
                    <div className="flex items-center gap-2 p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 text-xs font-bold animate-fadeIn font-sans">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* PATHWAY 2: CREATE RESUME */}
              {choiceModalPathway === "create" && (
                <div className="border-2 border-black bg-neutral-50/40 rounded-2xl p-5 space-y-3.5 text-left animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-black text-neutral-900 uppercase font-mono tracking-wide">Manual Form Builder</p>
                      <p className="text-xs text-neutral-650 font-medium font-sans mt-1 leading-relaxed">
                        Start with a fresh template and fill out your professional timeline, skills, and contact credentials inside our guided builder stage.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex flex-col sm:flex-row items-center sm:justify-end gap-3.5 pt-4 border-t border-neutral-100 font-sans">
              <button
                id="btn-choice-modal-cancel"
                type="button"
                disabled={isAnalyzing}
                onClick={() => {
                  setIsChoiceModalOpen(false);
                  setTempFile(null);
                  setUploadError(null);
                  setAnalysisResult(null);
                }}
                className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition duration-150 cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
              >
                Cancel
              </button>

              {choiceModalPathway === "upload" ? (
                <button
                  id="btn-choice-modal-import"
                  type="button"
                  disabled={isAnalyzing || !tempFile || (analysisResult !== null && !analysisResult.isResume)}
                  onClick={handleContinueUpload}
                  className={`w-full sm:w-auto px-5 py-3 font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition duration-150 border-2 ${
                    (tempFile && !isAnalyzing && (analysisResult === null || analysisResult.isResume))
                      ? "bg-[#2563eb] hover:bg-blue-600 text-white cursor-pointer border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-neutral-100 text-neutral-450 border-neutral-200 cursor-not-allowed"
                  }`}
                >
                  {analysisResult ? "Import & Continue 🚀" : "Continue"}
                </button>
              ) : (
                <button
                  id="btn-choice-modal-builder"
                  type="button"
                  onClick={() => {
                    handleStartFreshResume();
                    setResumeSelectionMode("create");
                    setIsChoiceModalOpen(false);
                    showNotification("Manual builder initialized. Fill fields to build profile.", "info");
                  }}
                  className="w-full sm:w-auto px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition duration-150 border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                >
                  Start Fresh Builder 🚀
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- TAILOR WIZARD MODAL -------------------- */}
      {isTailorWizardOpen && (
        <div 
          id="tailor-wizard-modal-backdrop" 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
          onClick={() => {
            if (!tailorIsAnalyzing) {
              setIsTailorWizardOpen(false);
            }
          }}
        >
          <div 
            id="tailor-wizard-modal" 
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-2xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {!tailorIsAnalyzing && (
              <button
                id="btn-close-tailor-wizard"
                onClick={() => setIsTailorWizardOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Header */}
            <div className="mb-4 text-left border-b-2 border-black pb-3">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Tailor Resume for Job</h3>
              <p className="text-xs text-neutral-555 font-medium font-sans">
                {tailorWizardStep === 1 && "Step 1 of 4: Target details"}
                {tailorWizardStep === 2 && "Step 2 of 4: Job Description"}
                {tailorWizardStep === 3 && "Step 3 of 4: Match & Gap Analysis"}
                {tailorWizardStep === 4 && "Step 4 of 4: Results & Download"}
              </p>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 py-2">
              
              {/* Loader */}
              {tailorIsAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 min-h-[300px]">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-sm font-black text-neutral-800 uppercase font-mono tracking-wide">
                    {tailorWizardStep <= 2 ? "Analyzing job description..." : "Generating tailored resume..."}
                  </p>
                  <p className="text-xs text-neutral-555 text-center max-w-md font-semibold">
                    We are querying the language model, evaluating keywords, and writing highly tailored, ATS-optimized descriptions.
                  </p>
                </div>
              )}

              {/* STEP 1: COMPANY NAME & CHOOSE RESUME */}
              {!tailorIsAnalyzing && tailorWizardStep === 1 && (
                <div className="space-y-4 text-left py-2 max-w-md mx-auto w-full">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono">Company Name</label>
                      <input 
                        type="text"
                        placeholder="e.g. Google, Vercel"
                        value={tailorCompany}
                        onChange={(e) => setTailorCompany(e.target.value)}
                        className="w-full bg-white border-2 border-black rounded-xl p-3 text-xs font-semibold focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      />
                    </div>
                    
                    {/* Choose Resume field */}
                    {existingResumes.length === 1 ? (
                      <div className="space-y-1">
                        <label className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono">Choose Resume</label>
                        <div className="w-full bg-neutral-50 border-2 border-dashed border-neutral-350 rounded-xl p-3 text-xs font-semibold text-neutral-600">
                          {existingResumes[0].label}
                        </div>
                      </div>
                    ) : existingResumes.length >= 2 ? (
                      <div className="space-y-1">
                        <label className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono">Choose Resume</label>
                        <select
                          value={tailorSelectedResumeKey}
                          onChange={(e) => setTailorSelectedResumeKey(e.target.value)}
                          className="w-full bg-white border-2 border-black rounded-xl p-3 text-xs font-semibold focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                        >
                          {existingResumes.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* STEP 2: JOB DESCRIPTION INPUT METHOD */}
              {!tailorIsAnalyzing && tailorWizardStep === 2 && (
                <div className="space-y-4 text-left animate-fadeIn">
                  {tailorJdMode === null ? (
                    /* Phase A: Selection Cards */
                    <div className="space-y-4 py-2">
                      <div className="text-center mb-2">
                        <label className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono block">
                          How would you like to provide the Job Description?
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Option 1: Paste JD */}
                        <button
                          type="button"
                          onClick={() => setTailorJdMode("paste")}
                          className="flex flex-col items-center justify-center p-6 bg-white border-2 border-black rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer text-center group"
                        >
                          <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center bg-blue-50 mb-3 group-hover:scale-110 transition-transform">
                            <FileText className="w-6 h-6 text-[#2563eb]" />
                          </div>
                          <span className="text-xs font-black uppercase font-mono text-black">Paste Job Description</span>
                          <span className="text-[10px] text-neutral-500 font-sans font-semibold mt-1">Copy and paste text from the job board</span>
                        </button>

                        {/* Option 2: Upload Screenshots */}
                        <button
                          type="button"
                          onClick={() => setTailorJdMode("upload")}
                          className="flex flex-col items-center justify-center p-6 bg-white border-2 border-black rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer text-center group"
                        >
                          <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center bg-blue-50 mb-3 group-hover:scale-110 transition-transform">
                            <Image className="w-6 h-6 text-[#2563eb]" />
                          </div>
                          <span className="text-xs font-black uppercase font-mono text-black">Upload JD Screenshots</span>
                          <span className="text-[10px] text-neutral-500 font-sans font-semibold mt-1">Upload 1-10 screenshot images of the post</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Phase B: Active Input Area */
                    <div className="space-y-3 animate-fadeIn">
                      {/* Method Header indicator */}
                      <div className="flex justify-between items-center border-b border-neutral-200 pb-2 mb-1">
                        <div className="flex items-center gap-1.5 text-xs font-black uppercase text-neutral-800 font-mono">
                          {tailorJdMode === "paste" ? (
                            <>
                              <FileText className="w-4 h-4 text-[#2563eb]" />
                              <span>Pasting Job Description</span>
                            </>
                          ) : (
                            <>
                              <Image className="w-4 h-4 text-[#2563eb]" />
                              <span>Uploading Screenshots</span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setTailorJdMode(null)}
                          className="text-xs font-black uppercase tracking-wider text-[#2563eb] hover:underline cursor-pointer font-mono"
                        >
                          Change Method
                        </button>
                      </div>

                      {/* Input container */}
                      <div className="border-2 border-black rounded-2xl p-4 bg-neutral-50 space-y-4">
                        {tailorJdMode === "paste" ? (
                          <div className="space-y-1 text-left animate-fadeIn">
                            <textarea
                              placeholder="Paste the full job description text here..."
                              value={tailorJdText}
                              onChange={(e) => setTailorJdText(e.target.value)}
                              className="w-full bg-white border-2 border-black rounded-xl p-3 text-xs font-semibold focus:outline-none h-40 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            />
                          </div>
                        ) : (
                          <div className="space-y-3 text-left animate-fadeIn">
                            <div className="flex items-center gap-3">
                              <label className="px-4 py-2.5 bg-white border-2 border-black hover:bg-neutral-50 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                                Select Screenshots
                                <input 
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={handleTailorImageUpload}
                                />
                              </label>
                              <span className="text-xs text-neutral-550 font-bold font-sans">
                                {tailorJdImages.length === 0 
                                  ? "No screenshots uploaded yet (supports PNG, JPEG, WebP)" 
                                  : `${tailorJdImages.length} / 10 image(s) loaded`}
                              </span>
                            </div>

                            {tailorJdImages.length > 0 && (
                              <div className="border border-neutral-250 rounded-xl bg-white p-3 space-y-2 max-h-40 overflow-y-auto animate-fadeIn">
                                {tailorJdImages.map((img, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-neutral-50 border border-neutral-200">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <img src={img} alt={`Screenshot ${idx + 1}`} className="w-8 h-8 object-cover rounded border border-black" />
                                      <span className="text-xs font-semibold text-neutral-700 truncate">
                                        {tailorJdImageNames[idx] || `Screenshot_${idx + 1}.png`}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTailorImage(idx)}
                                      className="text-xs font-bold text-rose-600 hover:text-rose-800 uppercase tracking-wider hover:underline ml-2"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: DISPLAY ANALYSIS & GAPS */}
              {!tailorIsAnalyzing && tailorWizardStep === 3 && tailorAnalysisResult && (
                <div className="space-y-5 text-left animate-fadeIn">
                  {/* Grid showing Matches and Gaps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Matches */}
                    <div className="border-2 border-emerald-500 bg-emerald-50/10 rounded-2xl p-4 space-y-2.5">
                      <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Matched Skills & Keywords
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {tailorAnalysisResult.matchedKeywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing */}
                    <div className="border-2 border-rose-500 bg-rose-50/10 rounded-2xl p-4 space-y-2.5">
                      <h4 className="text-xs font-black text-rose-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" strokeWidth={2.5} /> Missing Keywords (ATS Gaps)
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {tailorAnalysisResult.missingKeywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Suggested Improvements */}
                  <div className="border-2 border-amber-500 bg-amber-50/10 rounded-2xl p-4 space-y-2.5">
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Actionable Improvements
                    </h4>
                    <ul className="list-disc pl-5 text-xs text-neutral-700 space-y-1 font-semibold leading-relaxed">
                      {tailorAnalysisResult.improvements.map((imp, i) => (
                        <li key={i}>{imp}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* STEP 4: RESULTS (ATS SCORE & DOWNLOAD) */}
              {!tailorIsAnalyzing && tailorWizardStep === 4 && (
                <div className="space-y-6 text-center py-4 animate-fadeIn">
                  {/* Radial/Card Score Display */}
                  <div className="max-w-xs mx-auto border-4 border-black rounded-3xl p-6 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4">
                    <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest font-mono">Tailored ATS Score</span>
                    <div className="flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full border-4 border-black flex items-center justify-center bg-emerald-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                        <span className="text-3xl font-black text-emerald-800 font-mono">{tailoredAtsScore}%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase text-neutral-800 font-mono">ATS Screen Ready 🚀</h4>
                      <p className="text-[10px] text-neutral-500 font-sans font-medium">Your resume now includes all required high-priority keywords and fits corporate screening criteria.</p>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-600 font-sans max-w-md mx-auto leading-relaxed font-semibold">
                    The tailored copy is fully updated and saved as a new card on your **Tailored Resumes** dashboard. You can download the text-format resume immediately below.
                  </p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-neutral-100 mt-4 justify-end font-sans">
              {!tailorIsAnalyzing && (
                <>
                  {tailorWizardStep === 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsTailorWizardOpen(false)}
                        className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!tailorCompany.trim()) {
                            showNotification("Please enter the company name.", "error");
                            return;
                          }
                          setTailorWizardStep(2);
                        }}
                        className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Continue
                      </button>
                    </>
                  )}

                  {tailorWizardStep === 2 && (
                    <>
                      {tailorJdMode === null ? (
                        <button
                          type="button"
                          onClick={() => setTailorWizardStep(1)}
                          className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                        >
                          Back
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setTailorJdMode(null)}
                            className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={handleAnalyzeJD}
                            className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                          >
                            Scan & Analyze JD
                          </button>
                        </>
                      )}
                    </>
                  )}

                  {tailorWizardStep === 3 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setTailorWizardStep(2)}
                        className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateTailoredResume}
                        className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Generate Tailored Resume
                      </button>
                    </>
                  )}

                  {tailorWizardStep === 4 && (
                    <>
                      <button
                        type="button"
                        onClick={handleDownloadTailoredResume}
                        className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Tailored Resume</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsTailorWizardOpen(false)}
                        className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                      >
                        Done
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Saved Version Preview Modal */}
      {showSavedVersionPreviewModal && selectedSavedVersion && (
        <div 
          id="saved-version-preview-modal-backdrop"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
          onClick={() => setShowSavedVersionPreviewModal(false)}
        >
          <div 
            id="saved-version-preview-modal"
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-2xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              id="btn-close-version-preview"
              onClick={() => setShowSavedVersionPreviewModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border-2 border-transparent hover:border-black text-neutral-550 hover:text-black transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-4 text-left border-b-2 border-black pb-3">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Tailored Resume Preview</h3>
              <p className="text-xs text-neutral-550 font-medium font-sans">
                For {selectedSavedVersion.companyName} — {selectedSavedVersion.jobTitle}
              </p>
            </div>

            {/* Body: scrollable preview */}
            <div className="flex-1 overflow-y-auto pr-1 border border-neutral-250 rounded-xl mb-6 bg-neutral-50 p-4">
              <ResumePreview resume={selectedSavedVersion.resumeData} templateStyle="two-column" />
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end border-t border-neutral-200 mt-2 font-sans">
              <button
                type="button"
                onClick={() => {
                  handleDownloadSpecificResume(selectedSavedVersion);
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download TXT</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const prevActive = activeResume;
                  setActiveResume(selectedSavedVersion.resumeData);
                  setTimeout(() => {
                    window.print();
                    setActiveResume(prevActive);
                  }, 100);
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Print / Save PDF
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSavedVersionPreviewModal(false);
                  setVersionToDeleteId(selectedSavedVersion.id);
                  setShowDeleteSavedVersionConfirmModal(true);
                }}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Specific Saved Version Confirmation Modal */}
      {showDeleteSavedVersionConfirmModal && (
        <div 
          id="delete-version-confirm-backdrop"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
        >
          <div 
            id="delete-version-confirm-modal"
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn"
          >
            <div className="mx-auto w-16 h-16 rounded-full border-2 border-black flex items-center justify-center bg-rose-100 text-black">
              <Trash2 className="w-8 h-8 text-rose-600 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black tracking-tight text-black uppercase font-mono">Are you sure?</h3>
              <p className="text-xs text-neutral-800 leading-relaxed font-bold font-sans">
                You are about to delete this tailored resume version. This action is irreversible.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center font-sans">
              <button
                id="btn-confirm-delete-version-yes"
                onClick={() => {
                  if (versionToDeleteId) {
                    setSavedVersions(prev => prev.filter(v => v.id !== versionToDeleteId));
                    showNotification("Tailored resume deleted successfully.", "info");
                  }
                  setShowDeleteSavedVersionConfirmModal(false);
                  setVersionToDeleteId(null);
                }}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Yes, Delete
              </button>
              <button
                id="btn-confirm-delete-version-cancel"
                onClick={() => {
                  setShowDeleteSavedVersionConfirmModal(false);
                  setVersionToDeleteId(null);
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
