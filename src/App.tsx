/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
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
  Image,
  Eye,
  EyeOff
} from "lucide-react";
import {
  ResumeStructure,
  ResumeWorkExperience,
  ResumeEducation,
  SimplifiedJD,
  ResumeSuggestion,
  ATSCheckResult,
  SavedResumeVersion,
  SavedResume,
  TailoredResume
} from "./types";
import { resumeStructureToResume, mergeResumeWithAdditions } from "./utils/resumeConverter";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { DEMO_RESUMES, DEMO_JDS } from "./demoData";
import ResumePreview from "./components/ResumePreview";
import { supabaseAuth, supabaseData } from "./lib/supabase";

const SUPABASE_SESSION_STORAGE_KEY = "jd_resume_customizer_supabase_session";
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

export default function App() {
  const onboardingFileInputRef = useRef<HTMLInputElement>(null);
  type AppUser = { email: string; name: string; isGuest?: boolean };

  // --------- STATE ---------
  // User Authentication
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const guest = sessionStorage.getItem("jd_resume_customizer_guest_user");
    if (guest) {
      try { return JSON.parse(guest); } catch { sessionStorage.removeItem("jd_resume_customizer_guest_user"); }
    }
    const saved = localStorage.getItem("jd_resume_customizer_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.isGuest || parsed?.email === "guest@fresher.io") {
          localStorage.removeItem("jd_resume_customizer_user");
          return null;
        }
        return parsed;
      } catch {
        localStorage.removeItem("jd_resume_customizer_user");
      }
    }
    // Try to restore from Supabase session if user is not set
    const storedSession = localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY || "jd_resume_customizer_supabase_session");
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        if (session?.user?.email) {
          const email = session.user.email;
          const name = email.split("@")[0];
          return { email, name };
        }
      } catch {}
    }
    return null;
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [resetAccessToken, setResetAccessToken] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);

  useEffect(() => {
    if (isSignUp) {
      setAuthEmail("");
      setAuthPassword("");
      setAuthConfirmPassword("");
    }
  }, [isSignUp]);

  const [showSetupOptions, setShowSetupOptions] = useState(false);

  const [activeResume, setActiveResume] = useState<ResumeStructure>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_active_resume");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEMO_RESUMES.software_grad.data;
      }
    }
    return DEMO_RESUMES.software_grad.data;
  });

  const [originalResume, setOriginalResume] = useState<ResumeStructure>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_original_resume");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    const savedActive = localStorage.getItem("jd_resume_customizer_active_resume");
    if (savedActive) {
      try {
        return JSON.parse(savedActive);
      } catch {}
    }
    return DEMO_RESUMES.software_grad.data;
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

  // MVP Step Wizard: 'auth' | 'dashboard' | 'resume'
  const [currentStep, setCurrentStep] = useState<"auth" | "dashboard" | "resume">(() => {
    const savedUser = localStorage.getItem("jd_resume_customizer_user");
    const guestUser = sessionStorage.getItem("jd_resume_customizer_guest_user");
    if (!savedUser && !guestUser) return "auth";
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.isGuest || parsed?.email === "guest@fresher.io") {
          localStorage.removeItem("jd_resume_customizer_user");
          return "auth";
        }
      } catch {
        localStorage.removeItem("jd_resume_customizer_user");
        return "auth";
      }
    }
    const savedStep = localStorage.getItem("jd_resume_customizer_current_step") as "resume" | "dashboard" | null;
    if (savedStep && (savedStep === "resume" || savedStep === "dashboard")) {
      return savedStep;
    }
    const hasRes = localStorage.getItem("jd_resume_customizer_has_resume") === "true";
    return hasRes ? "dashboard" : "resume";
  });

  // AI Analysis states
  const [isSimplifyingJd, setIsSimplifyingJd] = useState(false);
  const [simplifiedJd, setSimplifiedJd] = useState<SimplifiedJD | null>(null);
  const [diffTab, setDiffTab] = useState<"added" | "modified" | "unchanged">("added");

  const [isTailoring, setIsTailoring] = useState(false);
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([]);
  const [originalResumeBackup, setOriginalResumeBackup] = useState<ResumeStructure | null>(null);

  const [isAuditingATS, setIsAuditingATS] = useState(false);
  const [atsResult, setAtsResult] = useState<ATSCheckResult | null>(null);

  // UI Customizations
  const [selectedStyle, setSelectedStyle] = useState<"classic" | "tech" | "executive" | "two-column">("two-column");
  const [savedVersions, setSavedVersions] = useState<SavedResumeVersion[]>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_versions");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const isDarkMode = false;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Welcome to Auralis! Ready to tailor your first resume.", time: "Just now", read: false },
    { id: 2, text: "Pro tip: Achieve >85% ATS score to pass corporate screening easily.", time: "1 hour ago", read: true },
    { id: 3, text: "No recruitment files currently tailored. Start from Tailored Resumes.", time: "5 hours ago", read: true }
  ]);

  // Mandatory Prerequisite Check for resume creation/uploading to unlock Auralis
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    const sessionUnlocked = sessionStorage.getItem("auralis_platform_unlocked") === "true";
    const localSaved = localStorage.getItem("jd_resume_customizer_saved_resumes");
    let hasSaved = false;
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        hasSaved = Array.isArray(parsed) && parsed.length > 0;
      } catch {}
    }
    return sessionUnlocked || hasSaved || localStorage.getItem("jd_resume_customizer_has_resume") === "true";
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

  // Multi-resume library — persisted to localStorage
  const [savedUserResumes, setSavedUserResumes] = useState<SavedResume[]>(() => {
    const saved = localStorage.getItem("jd_resume_customizer_saved_resumes");
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const hasResume = savedUserResumes.length > 0;

  const isDuplicateResume = (fileBase64?: string, extractedText?: string, data?: ResumeStructure): boolean => {
    return savedUserResumes.some(r => {
      const existingBase64 = r.fileBase64 || r.pdfBase64;
      if (fileBase64 && existingBase64 && fileBase64 === existingBase64) {
        return true;
      }
      if (extractedText && r.extractedText && extractedText.trim() === r.extractedText.trim()) {
        return true;
      }
      if (data && r.data) {
        const nameMatch = (r.data.fullName || "").trim().toLowerCase() === (data.fullName || "").trim().toLowerCase();
        const emailMatch = (r.data.email || "").trim().toLowerCase() === (data.email || "").trim().toLowerCase();
        const expMatch = JSON.stringify(r.data.workExperience || []) === JSON.stringify(data.workExperience || []);
        if (nameMatch && emailMatch && expMatch) {
          return true;
        }
      }
      return false;
    });
  };

  const generateUniqueResumeName = (fullName: string): string => {
    const baseName = (fullName || "Candidate").trim();
    const existingCount = savedUserResumes.filter(r => {
      const n = (r.name || "").trim();
      return n === baseName || n.startsWith(`${baseName} `);
    }).length;
    
    if (existingCount === 0) {
      return baseName;
    } else {
      return `${baseName} ${existingCount}`;
    }
  };

  const isStoredUploadedResumeObviouslyInvalid = (resume: SavedResume): boolean => {
    const isUploadedDocument = resume.fileType === "pdf" || resume.fileType === "docx" || !!resume.fileBase64 || !!resume.pdfBase64;
    // Only inspect uploaded documents that have extracted text. If no extracted text, keep the resume.
    if (!isUploadedDocument || !resume.extractedText) return false;

    const text = resume.extractedText.toLowerCase();

    // Hard reject: clear non-resume content types (invoices, bank statements, meeting notes, etc.)
    const isObviouslyNonResume = /\b(invoice|receipt|bank statement|statement of account|transaction history|amount due|payment due|vendor invoice|balance sheet|profit and loss|chapter \d|session agenda|session kickoff|lecture notes|minutes of meeting)\b/i.test(text);

    // Count resume section indicators
    const indicators = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text) || /\+?\(?[0-9]{1,4}\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/.test(text),
      /\b(education|university|college|school|degree|bachelor|master|phd|gpa|coursework|academic)\b/i.test(text),
      /\b(experience|work history|employment|internship|responsibilities|achievements|professional experience|worked at|working at)\b/i.test(text),
      /\b(skills|technical skills|technologies|tools|competencies|expertise|programming|languages)\b/i.test(text),
      /\b(projects|portfolio|personal projects|academic projects|repositories|github|open.?source)\b/i.test(text),
      /\b(certifications?|licenses?|awards?|credentials?|honors?|publications?)\b/i.test(text),
    ].filter(Boolean).length;

    // Only reject if: it matches a clearly non-resume pattern AND has zero resume indicators.
    // If Gemini already validated it as a resume (it was uploaded successfully), trust it.
    // This prevents valid uploaded resumes from being evicted on next page load.
    return isObviouslyNonResume && indicators === 0;
  };

  const formatFriendlyError = (errMessage: string | null): string => {
    if (!errMessage) return "";
    const trimmed = errMessage.trim();
    
    try {
      if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed);
        if (parsed.error && parsed.error.message) {
          return parsed.error.message;
        }
        if (parsed.message) {
          return parsed.message;
        }
      }
    } catch (e) {
      // Ignore JSON parsing
    }

    if (
      trimmed.includes("experiencing high demand") || 
      trimmed.includes("UNAVAILABLE") || 
      trimmed.includes("503") ||
      trimmed.includes("Resource has been exhausted") ||
      trimmed.includes("429")
    ) {
      return "The AI model is currently experiencing high demand. Please try again in a few moments.";
    }

    if (trimmed.includes("API key not valid") || trimmed.includes("API_KEY_INVALID") || trimmed.includes("403")) {
      return "The AI API key configuration is invalid. Please contact support or check settings.";
    }

    if (trimmed.includes("safety") || trimmed.includes("blocked by safety")) {
      return "The request was flagged by the AI safety filters. Please review the content.";
    }

    return errMessage;
  };

  const formatResumeCreatedDate = (dateValue: string): string => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).replace(",", "");
  };

  const isLikelyResumeHolderName = (value?: string): boolean => {
    const name = value?.trim();
    if (!name) return false;
    if (name.length < 2 || name.length > 70) return false;
    if (/\b(customer|needs|summary|experience|education|skills|projects|resume|invoice|statement|chapter|agenda|session|introduction|professional|academic|various|portfolio|high school|diploma|degree)\b/i.test(name)) return false;
    if (/[0-9]/.test(name)) return false;

    const words = name.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 5) return false;

    return true;
  };

  const cleanResumeFileNameForCard = (value?: string): string => {
    return (value || "")
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b(resume|cv|curriculum vitae|profile)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const getResumeCardDisplayName = (resume: SavedResume): string => {
    const holderName = resume.data?.fullName?.trim();
    if (isLikelyResumeHolderName(holderName)) return holderName;

    const originalFileName = cleanResumeFileNameForCard(resume.originalFileName);
    if (originalFileName) return originalFileName;

    const savedName = resume.name?.trim();
    const cleanSavedName = cleanResumeFileNameForCard(savedName);
    if (cleanSavedName && savedName !== holderName && !/[.!?]/.test(cleanSavedName)) return cleanSavedName;

    return "Uploaded Resume";
  };

  const [activeResumeId, setActiveResumeId] = useState<string | null>(() => {
    return localStorage.getItem("jd_resume_customizer_active_resume_id");
  });
  // Which resume to show in the delete confirmation dialog
  const [resumeToDeleteId, setResumeToDeleteId] = useState<string | null>(null);

  // Tailoring Wizard States
  const [isTailorWizardOpen, setIsTailorWizardOpen] = useState(false);
  const [tailorWizardStep, setTailorWizardStep] = useState<1 | 2 | 3>(1);
  const [tailorCompany, setTailorCompany] = useState("");
  const [tailorRole, setTailorRole] = useState("");
  const [tailorJdText, setTailorJdText] = useState("");
  const [tailorSelectedResumeKey, setTailorSelectedResumeKey] = useState<string>("active");
  const [tailorJdMode, setTailorJdMode] = useState<"paste" | "upload" | null>(null);
  const [tailorJdImages, setTailorJdImages] = useState<string[]>([]);
  const [tailorJdImageNames, setTailorJdImageNames] = useState<string[]>([]);
  const [tailorJdFileBase64, setTailorJdFileBase64] = useState<string | null>(null);
  const [tailorJdFileName, setTailorJdFileName] = useState<string | null>(null);
  const [tailorJdFileType, setTailorJdFileType] = useState<string | null>(null);
  const [tailorIsAnalyzing, setTailorIsAnalyzing] = useState(false);
  const [tailorProgress, setTailorProgress] = useState(0);
  const [tailorProcessingStage, setTailorProcessingStage] = useState("Reading Resume");
  const tailorProgressTimerRef = useRef<number | null>(null);
  const [tailorAnalysisError, setTailorAnalysisError] = useState<string | null>(null);
  const [tailorAnalysisResult, setTailorAnalysisResult] = useState<{
    matchedKeywords: string[];
    missingKeywords: string[];
    missingQualifications: string[];
    improvements: string[];
    simplifiedText: string;
    originalAtsScore: number;
    originalMatchPct: number;
    simplifiedJdObject: SimplifiedJD;
  } | null>(null);
  const [tailoredResultResume, setTailoredResultResume] = useState<ResumeStructure | null>(null);
  const [tailoredResultVersion, setTailoredResultVersion] = useState<SavedResumeVersion | null>(null);
  const [tailoredResult, setTailoredResult] = useState<TailoredResume | null>(null);
  const [printTailoredResult, setPrintTailoredResult] = useState<TailoredResume | null>(null);
  const [tailoredAtsScore, setTailoredAtsScore] = useState<number | null>(null);
  const [showHighlights, setShowHighlights] = useState(true);

  // Dashboard item preview states
  const [selectedSavedVersion, setSelectedSavedVersion] = useState<SavedResumeVersion | null>(null);
  const [showSavedVersionPreviewModal, setShowSavedVersionPreviewModal] = useState(false);
  const [showDeleteSavedVersionConfirmModal, setShowDeleteSavedVersionConfirmModal] = useState(false);
  const [versionToDeleteId, setVersionToDeleteId] = useState<string | null>(null);
  const [printResume, setPrintResume] = useState<ResumeStructure | null>(null);
  const [printOriginalResume, setPrintOriginalResume] = useState<ResumeStructure | undefined>(undefined);

  // User pathway selection inside Resume Setup (Upload or Create)
  const [resumeSelectionMode, setResumeSelectionMode] = useState<"upload" | "create" | null>(null);

  // Resume Quick View & Delete Confirms
  const [showResumePreviewModal, setShowResumePreviewModal] = useState(false);
  const [previewResumeId, setPreviewResumeId] = useState<string | null>(null);
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
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  });

  // Resume upload/validation states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ isResume: boolean } | null>(null);
  const showInvalidResumeCard = !isAnalyzing && analysisResult && !analysisResult.isResume;

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
    if (currentUser?.isGuest) {
      sessionStorage.setItem("jd_resume_customizer_guest_user", JSON.stringify(currentUser));
      localStorage.removeItem("jd_resume_customizer_user");
    } else if (currentUser) {
      localStorage.setItem("jd_resume_customizer_user", JSON.stringify(currentUser));
      sessionStorage.removeItem("jd_resume_customizer_guest_user");
    } else {
      localStorage.removeItem("jd_resume_customizer_user");
      sessionStorage.removeItem("jd_resume_customizer_guest_user");
    }
  }, [currentUser]);

  useEffect(() => {
    const handleRecoveryLink = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const error = hashParams.get("error_description") || queryParams.get("error_description") || hashParams.get("error") || queryParams.get("error");
      const type = hashParams.get("type") || queryParams.get("type");
      const accessToken = hashParams.get("access_token") || queryParams.get("access_token");

      if (error) {
        setCurrentStep("auth");
        setIsSignUp(false);
        setIsForgotPassword(true);
        setIsResetPassword(false);
        setResetAccessToken(null);
        setAuthMessage({ type: "error", message: "This reset link is invalid or expired. Please request a new password reset link." });
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      if (type === "recovery" && accessToken) {
        setCurrentStep("auth");
        setCurrentUser(null);
        setIsSignUp(false);
        setIsForgotPassword(false);
        setIsResetPassword(true);
        setResetAccessToken(accessToken);
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage({ type: "info", message: "Enter a new password to finish resetting your account." });
        localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleRecoveryLink();
    window.addEventListener("hashchange", handleRecoveryLink);
    return () => window.removeEventListener("hashchange", handleRecoveryLink);
  }, []);

  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_active_resume", JSON.stringify(activeResume));
  }, [activeResume]);

  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResetCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetCooldownSeconds]);

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
    const session = getStoredSupabaseSession();
    if (!session?.accessToken || !session.user?.id || !currentUser || currentUser.isGuest) return;
    savedVersions.forEach((version) => {
      supabaseData.upsertTailoredResume(session.accessToken, {
        id: version.id,
        user_id: session.user.id,
        companyName: version.companyName,
        jobTitle: version.jobTitle,
        savedAt: version.savedAt,
        resumeData: version.resumeData,
        originalResumeData: version.originalResumeData,
        originalJobDescription: version.originalJobDescription,
        appliedSuggestionsCount: version.appliedSuggestionsCount,
        atsScore: version.atsScore,
        matchPercentage: version.matchPercentage,
        improvements: version.improvements,
        missingRequirements: version.missingRequirements,
        missingQualifications: version.missingQualifications,
        diffAdded: version.diffAdded,
        diffModified: version.diffModified,
        diffUnchanged: version.diffUnchanged,
      }).catch((error) => console.warn("Supabase tailored resume save failed:", error));
    });
  }, [savedVersions]);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("jd_resume_customizer_theme", "light");
    if (currentStep !== "auth") {
      localStorage.setItem("jd_resume_customizer_current_step", currentStep);
    }
  }, [currentStep]);

  useEffect(() => {
    return () => {
      if (tailorProgressTimerRef.current) {
        window.clearInterval(tailorProgressTimerRef.current);
      }
    };
  }, []);

  // Remove stale uploaded non-resume cards that were saved before strict validation existed.
  useEffect(() => {
    setSavedUserResumes(prev => {
      const filtered = prev.filter(resume => !isStoredUploadedResumeObviouslyInvalid(resume));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, []);

  // Persist savedUserResumes whenever it changes
  useEffect(() => {
    localStorage.setItem("jd_resume_customizer_saved_resumes", JSON.stringify(savedUserResumes));
    const session = getStoredSupabaseSession();
    if (session?.accessToken && session.user?.id && currentUser && !currentUser.isGuest) {
      savedUserResumes.forEach((resume) => {
        supabaseData.upsertResume(session.accessToken, {
          id: resume.id,
          user_id: session.user.id,
          name: resume.name,
          data: resume.data,
          fileBase64: resume.fileBase64 || resume.pdfBase64,
          originalFileName: resume.originalFileName,
          fileType: resume.fileType,
          extractedText: resume.extractedText,
          uploadedAt: resume.uploadedAt,
        }).catch((error) => console.warn("Supabase resume save failed:", error));
      });
    }
    localStorage.setItem("jd_resume_customizer_has_resume", String(savedUserResumes.length > 0));
  }, [savedUserResumes]);

  // Persist activeResumeId
  useEffect(() => {
    if (activeResumeId) {
      localStorage.setItem("jd_resume_customizer_active_resume_id", activeResumeId);
    } else {
      localStorage.removeItem("jd_resume_customizer_active_resume_id");
    }
  }, [activeResumeId]);

  // Sync activeResume from savedUserResumes whenever activeResumeId or the list changes
  useEffect(() => {
    if (savedUserResumes.length === 0) return;
    const found = savedUserResumes.find(r => r.id === activeResumeId);
    if (found) {
      setActiveResume(found.data);
      setOriginalResume(found.data);
    } else {
      // Fall back to first resume
      const first = savedUserResumes[0];
      setActiveResumeId(first.id);
      setActiveResume(first.data);
      setOriginalResume(first.data);
    }
  }, [activeResumeId, savedUserResumes]);

  // Helper: update the active resume's data in the library whenever activeResume changes via manual editor
  const syncActiveResumeToLibrary = (updatedData: ResumeStructure) => {
    if (!activeResumeId) return;
    setSavedUserResumes(prev =>
      prev.map(r => r.id === activeResumeId ? { ...r, data: updatedData } : r)
    );
  };

  // Helper: delete a resume by id from the library
  const handleDeleteResumeById = (id: string) => {
    const session = getStoredSupabaseSession();
    if (session?.accessToken && currentUser && !currentUser.isGuest) {
      supabaseData.deleteResume(session.accessToken, id)
        .catch((error) => console.warn("Supabase resume delete failed:", error));
    }
    setSavedUserResumes(prev => {
      const remaining = prev.filter(r => r.id !== id);
      if (remaining.length === 0) {
        // No resumes left — reset everything
        setActiveResumeId(null);
        setIsUnlocked(false);
        sessionStorage.setItem("auralis_platform_unlocked", "false");
        localStorage.removeItem("jd_resume_customizer_active_resume_id");
      } else if (activeResumeId === id) {
        // Deleted the active one — switch to first remaining
        setActiveResumeId(remaining[0].id);
      }
      return remaining;
    });
    setResumeToDeleteId(null);
    setShowDeleteConfirmModal(false);
    showNotification("Resume deleted successfully.", "info");
  };

  // Resumes that actually exist in Resume Setup (for tailor wizard dropdown)
  const existingResumes = savedUserResumes.map(r => ({
    key: r.id,
    label: r.name,
    data: r.data
  }));

  // Alert Helper
  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // --------- HANDLERS ---------
  // Auth simulation
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthSubmitting) return;
    setAuthMessage(null);
    const email = authEmail.trim();
    if (isResetPassword) {
      if (!resetAccessToken) {
        setAuthMessage({ type: "error", message: "This reset link is invalid or expired. Please request a new password reset link." });
        return;
      }
      if (!authPassword.trim()) {
        setAuthMessage({ type: "error", message: "Password cannot be empty." });
        return;
      }
      if (authPassword.length < PASSWORD_MIN_LENGTH) {
        setAuthMessage({ type: "error", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthMessage({ type: "error", message: "Passwords do not match." });
        return;
      }
      setIsAuthSubmitting(true);
      try {
        await supabaseAuth.updatePassword(resetAccessToken, authPassword);
        setIsResetPassword(false);
        setIsForgotPassword(false);
        setIsSignUp(false);
        setResetAccessToken(null);
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage({ type: "success", message: "Password updated successfully. Please sign in." });
        showNotification("Password updated successfully. Please sign in.", "success");
      } catch (error: any) {
        setAuthMessage({ type: "error", message: error.message || "Could not update password. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
      }
      return;
    }
    if (!email) {
      setAuthMessage({ type: "error", message: "Email address cannot be empty." });
      showNotification("Email address cannot be empty.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessage({ type: "error", message: "Please provide a valid email address." });
      showNotification("Please provide a valid email address.", "error");
      return;
    }
    if (isForgotPassword) {
      if (resetCooldownSeconds > 0) {
        setAuthMessage({ type: "info", message: `You can request another reset email in ${resetCooldownSeconds} seconds.` });
        return;
      }
      setIsAuthSubmitting(true);
      try {
        const resetUrl = `${window.location.origin}${window.location.pathname}`;
        const diagnostic = await supabaseAuth.sendPasswordReset(email, resetUrl);
        console.info("Password reset request accepted by Supabase", {
          email,
          status: diagnostic.status,
          requestId: diagnostic.requestId,
        });
        setResetCooldownSeconds(PASSWORD_RESET_COOLDOWN_SECONDS);
        setAuthMessage({ type: "success", message: "Password reset link sent. Please check your inbox and spam folder." });
        showNotification("Password reset link sent. Please check your inbox and spam folder.", "success");
      } catch (error: any) {
        console.error("Password reset request failed", {
          email,
          message: error.message,
        });
        setAuthMessage({ type: "error", message: error.message || "Could not send reset link. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
      }
      return;
    }
    if (!authPassword.trim()) {
      setAuthMessage({ type: "error", message: "Password cannot be empty." });
      showNotification("Password cannot be empty.", "error");
      return;
    }
    if (isSignUp && authPassword.length < PASSWORD_MIN_LENGTH) {
      setAuthMessage({ type: "error", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
      showNotification(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`, "error");
      return;
    }
    if (isSignUp && authPassword !== authConfirmPassword) {
      setAuthMessage({ type: "error", message: "Passwords do not match." });
      showNotification("Passwords do not match.", "error");
      return;
    }
    setIsAuthSubmitting(true);
    try {
      const session = isSignUp
        ? await supabaseAuth.signUp(email, authPassword)
        : await supabaseAuth.signIn(email, authPassword);
      const name = session.user.email.split("@")[0];
      const userObj = { email: session.user.email, name };
      localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
      await supabaseData.upsertUser(session.accessToken, {
        id: session.user.id,
        email: session.user.email,
      });
      await supabaseData.upsertProfile(session.accessToken, {
        id: session.user.id,
        full_name: name,
      });
      await loadPersistedSupabaseData(session);
      setCurrentUser(userObj);
      // Always land on Resume Setup first after login
      setCurrentStep("resume");
      setAuthMessage(null);
      showNotification(isSignUp ? "Account created successfully." : `Welcome, ${name}! Your resume dashboard is ready.`, "success");
    } catch (error: any) {
      if (String(error.message || "").startsWith("Account created.")) {
        setIsSignUp(false);
        setAuthConfirmPassword("");
        setAuthMessage({ type: "info", message: error.message });
        showNotification(error.message, "info");
        return;
      }
      setAuthMessage({ type: "error", message: error.message || "Authentication failed. Please try again." });
      showNotification(error.message || "Authentication failed. Please try again.", "error");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const getStoredSupabaseSession = () => {
    const storedSession = localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
    if (!storedSession) return null;
    try {
      return JSON.parse(storedSession) as { accessToken: string; user: { id: string; email: string } };
    } catch {
      return null;
    }
  };

  async function loadPersistedSupabaseData(session: { accessToken: string; user: { id: string; email: string } }) {
    try {
      const [resumeRows, tailoredRows] = await Promise.all([
        supabaseData.listResumes(session.accessToken).catch((error) => {
          console.warn("Supabase resume load failed:", error);
          return null; // null = network/auth failure, distinct from [] (no records)
        }),
        supabaseData.listTailoredResumes(session.accessToken).catch((error) => {
          console.warn("Supabase tailored resume load failed:", error);
          return [];
        }),
      ]);

      // resumeRows===null means Supabase call failed. Keep whatever is in localStorage.
      // resumeRows===[] means Supabase is reachable but user has no records there yet.
      if (resumeRows !== null) {
        const supabaseResumes: SavedResume[] = (resumeRows || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          data: row.resume_data,
          fileBase64: row.file_base64 || undefined,
          originalFileName: row.original_file_name || undefined,
          fileType: row.file_type || undefined,
          extractedText: row.extracted_text || undefined,
          uploadedAt: row.uploaded_at || row.created_at,
        }));

        if (supabaseResumes.length > 0) {
          // Supabase has records — use as authoritative source
          setSavedUserResumes(supabaseResumes);
          const nextActiveId = (() => {
            // Check if activeResumeId (restored from localStorage) still exists in the fetched list
            const stillExists = supabaseResumes.some(r => r.id === activeResumeId);
            return stillExists ? activeResumeId : supabaseResumes[0].id;
          })();
          setActiveResumeId(nextActiveId);
          const found = supabaseResumes.find(r => r.id === nextActiveId) || supabaseResumes[0];
          if (found) {
            setActiveResume(found.data);
            setOriginalResume(found.data);
          }
          setIsUnlocked(true);
          sessionStorage.setItem("auralis_platform_unlocked", "true");
          localStorage.setItem("jd_resume_customizer_has_resume", "true");
        } else {
          // Supabase returned 0. Check localStorage before wiping state.
          const localRaw = localStorage.getItem("jd_resume_customizer_saved_resumes");
          let localResumes: SavedResume[] = [];
          try { localResumes = localRaw ? JSON.parse(localRaw) : []; } catch { localResumes = []; }

          if (localResumes.length > 0) {
            // localStorage has resumes that never synced to Supabase — keep and sync them now
            console.info("[Persistence] Supabase empty, but localStorage has resumes — keeping and re-syncing to Supabase.");
            setSavedUserResumes(localResumes);
            const nextActiveId = (() => {
              const stillExists = localResumes.some(r => r.id === activeResumeId);
              return stillExists ? activeResumeId : localResumes[0].id;
            })();
            setActiveResumeId(nextActiveId);
            const found = localResumes.find(r => r.id === nextActiveId) || localResumes[0];
            if (found) {
              setActiveResume(found.data);
              setOriginalResume(found.data);
            }
            setIsUnlocked(true);
            sessionStorage.setItem("auralis_platform_unlocked", "true");
            localStorage.setItem("jd_resume_customizer_has_resume", "true");
            // Re-sync each localStorage resume to Supabase
            localResumes.forEach((resume) => {
              supabaseData.upsertResume(session.accessToken, {
                id: resume.id,
                user_id: session.user.id,
                name: resume.name,
                data: resume.data,
                fileBase64: resume.fileBase64 || resume.pdfBase64,
                originalFileName: resume.originalFileName,
                fileType: resume.fileType,
                extractedText: resume.extractedText,
                uploadedAt: resume.uploadedAt || new Date().toISOString(),
              }).catch((err) => console.warn("Supabase re-sync failed:", err));
            });
          } else {
            // Both Supabase and localStorage are empty — truly no resumes
            setSavedUserResumes([]);
            localStorage.setItem("jd_resume_customizer_has_resume", "false");
          }
        }
      }
      // If resumeRows===null (Supabase failed), localStorage-initialized state is preserved

      const versions: SavedResumeVersion[] = (tailoredRows || []).map((row: any) => ({
        id: row.id,
        companyName: row.company_name,
        jobTitle: row.job_title,
        savedAt: row.saved_at,
        resumeData: row.resume_data,
        originalResumeData: row.original_resume_data || undefined,
        originalJobDescription: row.original_job_description || undefined,
        appliedSuggestionsCount: row.applied_suggestions_count || 0,
        atsScore: row.ats_score ?? undefined,
        matchPercentage: row.match_percentage ?? undefined,
        improvements: row.improvements || [],
        missingRequirements: row.missing_requirements || [],
        missingQualifications: row.missing_qualifications || [],
        diffAdded: row.diff_added || [],
        diffModified: row.diff_modified || [],
        diffUnchanged: row.diff_unchanged || [],
      }));
      if (versions.length > 0) {
        setSavedVersions(versions);
      }
    } catch (error) {
      console.warn("Supabase data restore failed:", error);
      // On complete failure, localStorage-initialized state is preserved
    }
  }


  useEffect(() => {
    if (!currentUser || currentUser.isGuest) return;
    const session = getStoredSupabaseSession();
    if (!session?.accessToken || !session.user?.id) return;
    loadPersistedSupabaseData(session);
  }, [currentUser?.email]);

  const handleOpenTailorWizard = () => {
    setTailorCompany("");
    setTailorRole("");
    setTailorJdText("");
    setTailorJdImages([]);
    setTailorJdImageNames([]);
    setTailorJdMode(null);
    setTailorJdFileBase64(null);
    setTailorJdFileName(null);
    setTailorJdFileType(null);
    const activeExists = existingResumes.some(r => r.key === activeResumeId);
    if (activeExists && activeResumeId) {
      setTailorSelectedResumeKey(activeResumeId);
    } else if (existingResumes.length > 0) {
      setTailorSelectedResumeKey(existingResumes[0].key);
    } else {
      setTailorSelectedResumeKey("active");
    }
    setTailorAnalysisResult(null);
    setTailorAnalysisError(null);
    setTailoredResultResume(null);
    setTailoredResultVersion(null);
    setTailoredAtsScore(null);
    setShowHighlights(true);
    setTailorWizardStep(1);
    setIsTailorWizardOpen(true);
  };

  const handleTailorFileUpload = (file: File) => {
    const name = file.name;
    const extension = name.split('.').pop()?.toLowerCase();
    
    if (['png', 'jpg', 'jpeg'].includes(extension || "")) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setTailorJdImages(prev => [...prev, base64]);
        setTailorJdImageNames(prev => [...prev, name]);
      };
      reader.readAsDataURL(file);
    } else if (['pdf', 'docx'].includes(extension || "")) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setTailorJdFileBase64(base64 || "");
        setTailorJdFileName(name);
        setTailorJdFileType(file.type);
      };
      reader.readAsDataURL(file);
    } else {
      showNotification("Unsupported file format. Please upload PDF, DOCX, or PNG/JPG images.", "error");
    }
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

  const processingStages = [
    { label: "Reading Resume", at: 0 },
    { label: "Analyzing Job Description", at: 20 },
    { label: "Comparing Resume vs JD", at: 45 },
    { label: "Generating Tailored Resume", at: 65 },
    { label: "Preparing Download Files", at: 88 },
  ];

  const JD_MIN_WORDS = 50;
  const JD_RECOMMENDED_MIN_WORDS = 100;
  const JD_RECOMMENDED_MAX_WORDS = 1000;
  const JD_MAX_WORDS = 5000;
  const INVALID_JD_MESSAGE = "This does not appear to be a valid Job Description. Please enter or paste a proper Job Description.";
  const ANALYSIS_WARNING_MS = 30000;
  const ANALYSIS_HARD_TIMEOUT_MS = 60000;

  const logTailorAnalysis = (message: string, details?: unknown) => {
    if (details !== undefined) {
      console.info(`[Tailored Resume Analysis] ${message}`, details);
    } else {
      console.info(`[Tailored Resume Analysis] ${message}`);
    }
  };

  const validateJobDescriptionText = (jdText: string) => {
    console.info("[JD Validation] JD Validation Started");
    const normalizedText = jdText
      .replace(/\s+/g, " ")
      .trim();
    const words = normalizedText.match(/\b[\w'+.-]+\b/g) || [];
    const lowerText = normalizedText.toLowerCase();

    const indicatorChecks = [
      { name: "Responsibilities", matched: /\b(responsibilities|responsibility|duties|what you'?ll do|day[-\s]?to[-\s]?day|key tasks|deliverables)\b/i.test(normalizedText) },
      { name: "Requirements", matched: /\b(requirements|required|must have|minimum qualifications|basic qualifications|candidate should|you should have)\b/i.test(normalizedText) },
      { name: "Qualifications", matched: /\b(qualifications|qualified|eligibility|background|degree|bachelor|master|mba|education)\b/i.test(normalizedText) },
      { name: "Skills", matched: /\b(skills|competencies|proficiency|expertise|tools|technologies|tech stack|knowledge of)\b/i.test(normalizedText) },
      { name: "Experience", matched: /\b(experience|years of experience|professional experience|worked with|track record)\b/i.test(normalizedText) },
      { name: "Role Description", matched: /\b(role description|about the role|job description|position overview|the role|job summary|we are looking for|we're looking for)\b/i.test(normalizedText) },
      { name: "Preferred Skills", matched: /\b(preferred|nice to have|good to have|bonus|plus|preferred qualifications)\b/i.test(normalizedText) },
      { name: "Education Requirements", matched: /\b(education requirements|degree required|bachelor'?s degree|master'?s degree|educational background)\b/i.test(normalizedText) },
    ];

    const foundIndicators = indicatorChecks
      .filter(indicator => indicator.matched)
      .map(indicator => indicator.name);
    const isLoremIpsum = /\blorem ipsum\b|\bdolor sit amet\b|\bconsectetur adipiscing\b/i.test(lowerText);
    const isCoverLetter = /\b(dear hiring manager|dear recruiter|dear sir|dear madam|writing to apply|express my interest|my attached resume|my resume|sincerely)\b/i.test(lowerText);
    const isResume = /\b(work experience|education|skills|certifications|summary of qualifications|projects|professional experience)\b/i.test(lowerText) && 
      (/\b(gpa|bachelor of|master of|phd|school|university|contact details|email|phone)\b/i.test(lowerText) || /^\+?[0-9]{1,4}[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}$/m.test(lowerText));

    const isValid =
      words.length >= JD_MIN_WORDS &&
      words.length <= JD_MAX_WORDS &&
      foundIndicators.length >= 2 &&
      !isLoremIpsum &&
      !isCoverLetter &&
      !isResume;

    console.info("[JD Validation] JD Indicators Found", foundIndicators);
    console.info("[JD Validation] Word Count", words.length);
    console.info(`[JD Validation] Validation ${isValid ? "Passed" : "Failed"}`, {
      wordCount: words.length,
      indicatorCount: foundIndicators.length,
      recommendedRange: `${JD_RECOMMENDED_MIN_WORDS}-${JD_RECOMMENDED_MAX_WORDS} words`,
      maxWords: JD_MAX_WORDS,
      isLoremIpsum
    });

    return {
      isValid,
      wordCount: words.length,
      foundIndicators,
      isTooLong: words.length > JD_MAX_WORDS,
      isTooShort: words.length < JD_MIN_WORDS,
      isLoremIpsum
    };
  };

  const startTailorProgress = (initialStage = "Reading Resume") => {
    if (tailorProgressTimerRef.current) {
      window.clearInterval(tailorProgressTimerRef.current);
    }
    setTailorProcessingStage(initialStage);
    setTailorProgress(4);
    const startedAt = Date.now();
    tailorProgressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(98, 4 + Math.floor((elapsed / ANALYSIS_HARD_TIMEOUT_MS) * 94));
      setTailorProgress(nextProgress);
      const activeStage = [...processingStages].reverse().find(stage => nextProgress >= stage.at);
      if (activeStage) setTailorProcessingStage(activeStage.label);
    }, 300);
  };

  const stopTailorProgress = (complete = false) => {
    if (tailorProgressTimerRef.current) {
      window.clearInterval(tailorProgressTimerRef.current);
      tailorProgressTimerRef.current = null;
    }
    if (complete) {
      setTailorProcessingStage("Preparing Download Files");
      setTailorProgress(100);
    }
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

  const extractJDHeuristically = (jdText: string, companyName: string) => {
    const jdTextLower = jdText.toLowerCase();
    const lines = jdText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let jobTitle = "Tailored Position";
    
    const commonTitles = [
      "software engineer", "frontend developer", "backend developer", "fullstack developer",
      "web developer", "product manager", "project manager", "data scientist", "data analyst",
      "qa engineer", "system administrator", "devops engineer", "ui/ux designer"
    ];
    
    for (const title of commonTitles) {
      if (jdTextLower.includes(title)) {
        jobTitle = title.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        break;
      }
    }
    if (jobTitle === "Tailored Position" && lines.length > 0) {
      const firstLine = lines[0];
      if (firstLine.length < 50 && !firstLine.toLowerCase().includes("job") && !firstLine.toLowerCase().includes("about")) {
        jobTitle = firstLine;
      }
    }

    const companyPitch = `Opportunity to join the team at ${companyName || "the target company"} and contribute to designing and developing core products.`;

    const skillsDict = [
      "React", "TypeScript", "JavaScript", "Python", "Java", "C++", "C#", "Go", "Rust",
      "HTML", "CSS", "SQL", "Node.js", "Express", "Docker", "AWS", "Git", "Next.js",
      "TailwindCSS", "Redux", "GraphQL", "REST API", "NoSQL", "MongoDB", "PostgreSQL",
      "Firebase", "Kubernetes", "Linux", "Scrum", "Agile"
    ];
    const requiredSkills: { name: string; priority: "high" | "medium" }[] = [];
    skillsDict.forEach(skill => {
      if (jdTextLower.includes(skill.toLowerCase())) {
        requiredSkills.push({
          name: skill,
          priority: Math.random() > 0.4 ? "high" : "medium"
        });
      }
    });
    if (requiredSkills.length === 0) {
      requiredSkills.push({ name: "JavaScript", priority: "high" });
      requiredSkills.push({ name: "Web Development", priority: "high" });
      requiredSkills.push({ name: "Git", priority: "medium" });
    }

    const keyResponsibilities: string[] = [];
    lines.forEach(line => {
      if ((line.startsWith("-") || line.startsWith("*") || line.startsWith("•")) && line.length > 15 && keyResponsibilities.length < 5) {
        keyResponsibilities.push(line.replace(/^[-*•]\s*/, ""));
      }
    });
    if (keyResponsibilities.length === 0) {
      keyResponsibilities.push("Design, develop, and maintain clean and efficient code.");
      keyResponsibilities.push("Collaborate with cross-functional teams to define and build new features.");
      keyResponsibilities.push("Write unit tests and perform debugging to ensure software quality.");
    }

    const candidateExpectations = [
      "Strong analytical and problem-solving skills.",
      "Excellent communication and collaboration abilities.",
      "Eagerness to learn new technical stacks and tools."
    ];

    const keywordsToTarget = requiredSkills.map(s => s.name).concat(["API Integration", "Version Control", "Agile Workflow"]);

    return {
      jobTitle,
      companyPitch,
      requiredSkills,
      keyResponsibilities,
      candidateExpectations,
      keywordsToTarget
    };
  };

  const calculateRealisticAtsScore = (resume: ResumeStructure, jd: SimplifiedJD) => {
    const requiredSkills = (jd.requiredSkills || []).map((s: any) => s?.name || s || "");
    const keywordsToTarget = jd.keywordsToTarget || [];
    const allKeywords = [...new Set([...requiredSkills, ...keywordsToTarget])].filter(Boolean);
    
    // Lowercase items for lookup
    const skillsLower = (resume.skills || []).map(s => String(s || "").toLowerCase());
    const summaryLower = String(resume.summary || "").toLowerCase();
    const expTextLower = (resume.workExperience || [])
      .map(exp => [exp.role, exp.company, ...(exp.description || [])].join(" "))
      .join(" ")
      .toLowerCase();
    const projTextLower = (resume.projects || [])
      .map(proj => [proj.name, ...(proj.description || [])].join(" "))
      .join(" ")
      .toLowerCase();
    const allTextLower = `${skillsLower.join(" ")} ${summaryLower} ${expTextLower} ${projTextLower}`;

    let matchCount = 0;
    const matched: string[] = [];
    const missing: string[] = [];

    allKeywords.forEach(kw => {
      const kwLower = kw.toLowerCase();
      // Match if present in skills list, or using word boundary search in general text
      const isMatched = skillsLower.some(s => s === kwLower) || 
                        allTextLower.includes(` ${kwLower} `) || 
                        allTextLower.includes(`,${kwLower}`) || 
                        allTextLower.includes(`${kwLower},`) || 
                        allTextLower.startsWith(kwLower) || 
                        allTextLower.endsWith(kwLower) ||
                        new RegExp(`\\b${kwLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(allTextLower);
      if (isMatched) {
        matchCount++;
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    });

    const matchPct = allKeywords.length > 0 ? Math.round((matchCount / allKeywords.length) * 100) : 50;

    // Structure score out of 40 points
    let structureScore = 0;
    if (resume.email && resume.phone) structureScore += 10;
    if ((resume.workExperience || []).length > 0) structureScore += 10;
    if ((resume.education || []).length > 0) structureScore += 10;
    if ((resume.skills || []).length > 0) structureScore += 10;

    // Content Match score out of 60 points
    const contentScore = Math.round((matchPct / 100) * 60);

    const overallScore = Math.min(100, Math.max(10, structureScore + contentScore));

    const criteria = [
      {
        name: "Keyword Match Density",
        passed: matchCount >= Math.min(3, Math.ceil(allKeywords.length * 0.3)),
        feedback: matchCount >= Math.min(3, Math.ceil(allKeywords.length * 0.3))
          ? `Your resume contains ${matchCount} target keywords matching the JD. Good alignment.`
          : `Only ${matchCount} keyword matches found. Try incorporating more skills like: ${allKeywords.slice(0, 3).join(", ")}.`
      },
      {
        name: "Contact Details Validation",
        passed: !!(resume.email && resume.phone),
        feedback: (resume.email && resume.phone)
          ? "Resume header contains complete email and telephone contact information."
          : "Please ensure your resume includes both phone and email contact details."
      },
      {
        name: "Structure & Layout Review",
        passed: structureScore >= 30,
        feedback: structureScore >= 30
          ? "Document structure has clear section headings (Experience, Education, Skills)."
          : "Please ensure you have completed all key sections of your resume (Experiences, Skills, Education)."
      }
    ];

    return {
      score: overallScore,
      matchPercentage: matchPct,
      matchedKeywords: matched,
      missingKeywords: missing,
      criteria
    };
  };

  const sanitizeResume = (tailored: ResumeStructure, original: ResumeStructure): ResumeStructure => {
    const sanitized = { ...tailored };

    // 1. Preserve identity/contact exactly. AI is never allowed to rewrite these.
    sanitized.fullName = original.fullName;
    sanitized.email = original.email;
    sanitized.phone = original.phone;
    sanitized.linkedin = original.linkedin || "";
    sanitized.website = original.website || "";
    sanitized.location = original.location || "";
    sanitized.summary = sanitized.summary?.trim() && !/unknown|undefined/i.test(sanitized.summary) ? sanitized.summary : original.summary;

    // 2. Sanitize experience while preserving all original job entries, company names, roles, and dates exactly.
    const originalExp = original.workExperience || [];
    sanitized.workExperience = originalExp.map((orig, idx) => {
      const exp = (sanitized.workExperience || []).find(e => e.id === orig.id) || (sanitized.workExperience || [])[idx];
      const rewrittenBullets = (exp?.description || []).filter(Boolean).map(desc => desc.trim()).filter(d => !/unknown|undefined/i.test(d));
      
      const finalBullets = [...rewrittenBullets];
      if (finalBullets.length < orig.description.length) {
        const extra = orig.description.slice(finalBullets.length);
        finalBullets.push(...extra);
      }
      
      return {
        id: orig.id || `exp-${idx}`,
        role: orig.role,
        company: orig.company,
        duration: orig.duration,
        description: finalBullets.length > 0 ? finalBullets : orig.description
      };
    });

    // 3. Preserve education exactly. Do not invent or rewrite institutions, degrees, or years.
    const originalEdu = original.education || [];
    sanitized.education = originalEdu.map((edu, idx) => ({ ...edu, id: edu.id || `edu-${idx}` }));

    // 4. Preserve project names/count exactly; only project bullets may be improved.
    const originalProj = original.projects || [];
    sanitized.projects = originalProj.map((orig, idx) => {
      const proj = (sanitized.projects || []).find(p => p.id === orig.id) || (sanitized.projects || [])[idx];
      const rewrittenBullets = (proj?.description || []).filter(Boolean).map(desc => desc.trim()).filter(d => !/unknown|undefined/i.test(d));
      
      const finalBullets = [...rewrittenBullets];
      if (finalBullets.length < orig.description.length) {
        const extra = orig.description.slice(finalBullets.length);
        finalBullets.push(...extra);
      }
      
      return {
        ...orig,
        id: orig.id || `proj-${idx}`,
        description: finalBullets.length > 0 ? finalBullets : orig.description
      };
    });

    // 5. Preserve certifications, languages, and achievements exactly.
    sanitized.certifications = original.certifications || [];
    sanitized.languages = original.languages || [];
    sanitized.achievements = original.achievements || [];

    return sanitized;
  };

  const generateResumeDiff = (original: ResumeStructure, tailored: ResumeStructure) => {
    const added: string[] = [];
    const modified: string[] = [];
    const unchanged: string[] = [];

    // 1. Compare skills
    const origSkills = original.skills || [];
    const tailSkills = tailored.skills || [];
    
    tailSkills.forEach(s => {
      if (!origSkills.includes(s)) {
        added.push(`Added skill tag: "${s}"`);
      } else {
        unchanged.push(`Retained skill tag: "${s}"`);
      }
    });
    origSkills.forEach(s => {
      if (!tailSkills.includes(s)) {
        modified.push(`Removed skill tag: "${s}"`);
      }
    });

    // 2. Compare summary
    if (original.summary !== tailored.summary) {
      modified.push(`Professional Summary tailored for the role.`);
    } else {
      unchanged.push(`Professional Summary remains unchanged.`);
    }

    // 3. Compare Work Experience bullet points
    (tailored.workExperience || []).forEach((exp, idx) => {
      const orig = original.workExperience?.[idx] || original.workExperience?.find(e => e.id === exp.id);
      if (!orig) {
        added.push(`Added entire Work Experience entry for ${exp.company}.`);
        return;
      }

      if (orig.role !== exp.role || orig.company !== exp.company) {
        modified.push(`Modified role details at ${exp.company}.`);
      }

      const origBullets = orig.description || [];
      const tailBullets = exp.description || [];

      tailBullets.forEach((bullet) => {
        if (!origBullets.includes(bullet)) {
          modified.push(`Optimized accomplishment bullet under ${exp.company}: "${bullet}"`);
        } else {
          unchanged.push(`Retained bullet under ${exp.company}: "${bullet.substring(0, 40)}..."`);
        }
      });
    });

    // 4. Compare projects
    (tailored.projects || []).forEach((proj, idx) => {
      const orig = original.projects?.[idx] || original.projects?.find(p => p.id === proj.id);
      if (!orig) {
        added.push(`Added entire project: ${proj.name}.`);
        return;
      }

      const origBullets = orig.description || [];
      const tailBullets = proj.description || [];

      tailBullets.forEach((bullet) => {
        if (!origBullets.includes(bullet)) {
          modified.push(`Optimized project bullet under ${proj.name}: "${bullet}"`);
        } else {
          unchanged.push(`Retained project bullet under ${proj.name}: "${bullet.substring(0, 40)}..."`);
        }
      });
    });

    // 5. Compare Education
    (tailored.education || []).forEach((edu, idx) => {
      const orig = original.education?.[idx] || original.education?.find(e => e.id === edu.id);
      if (orig && (orig.degree !== edu.degree || orig.school !== edu.school)) {
        modified.push(`Modified education record: ${edu.degree} at ${edu.school}.`);
      } else {
        unchanged.push(`Factual education record at ${edu.school} preserved.`);
      }
    });

    return {
      added: added.slice(0, 15),
      modified: modified.slice(0, 15),
      unchanged: unchanged.slice(0, 15)
    };
  };

  const handleAnalyzeAndGenerate = async () => {
    setTailorAnalysisError(null);
    const companyVal = tailorCompany || "";
    const jdTextVal = tailorJdText || "";

    if (!companyVal.trim()) {
      showNotification("Please enter the company name.", "error");
      return;
    }
    if (!jdTextVal.trim()) {
      showNotification("Please paste a job description.", "error");
      return;
    }
    const jdValidation = validateJobDescriptionText(jdTextVal);
    if (jdValidation.isTooLong) {
      showNotification(`Job description is too long. Please keep it under 1500 words.`, "error");
      return;
    }
    if (!jdValidation.isValid) {
      showNotification(INVALID_JD_MESSAGE, "error");
      return;
    }

    setTailorIsAnalyzing(true);
    startTailorProgress("Analyzing & Tailoring Resume...");
    
    try {
      const selectedResume = getResumeToTailor();
      if (!selectedResume) throw new Error("No resume selected");

      // 1. Simplify JD
      let simplifyRes = await fetch("/api/simplify-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText: jdTextVal })
      }).catch(e => null);
      
      let simplifiedJd;
      if (simplifyRes && simplifyRes.ok) {
        simplifiedJd = await simplifyRes.json();
      } else {
        simplifiedJd = extractJDHeuristically(jdTextVal, companyVal);
      }
      
      const extractedRole = simplifiedJd.jobTitle || "Tailored Position";
      setTailorRole(extractedRole);
      
      const simplifiedJdText = `Role: ${extractedRole}\nCompany Pitch: ${simplifiedJd.companyPitch || ""}\nKeywords: ${(simplifiedJd.keywordsToTarget || []).join(", ")}`;

      // 2. Generate Tailored
      setTailorProcessingStage("Applying AI Improvements");
      // 2. Generate Tailored
      setTailorProcessingStage("Applying AI Improvements");
      const specResume = resumeStructureToResume(selectedResume);
      console.log("[Tailor] Sending resume blocks to /api/tailor-resume:", {
        resumeName: selectedResume.fullName,
        blocksCount: specResume.blocks.length,
        jdTextLength: simplifiedJdText.length
      });
      
      let tailorRes;
      try {
        tailorRes = await fetch("/api/tailor-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume: specResume,
            jdText: simplifiedJdText
          })
        });
      } catch (networkErr: any) {
        console.error("[Tailor] Network error calling /api/tailor-resume:", networkErr);
        throw new Error(`Network error: Could not reach the server. ${networkErr.message || ""}`);
      }
      
      if (!tailorRes.ok) {
        let serverError = `Server returned ${tailorRes.status}`;
        try {
          const errorBody = await tailorRes.json();
          serverError = errorBody.error || errorBody.message || serverError;
          console.error("[Tailor] Server error response:", errorBody);
        } catch {
          try {
            const errorText = await tailorRes.text();
            console.error("[Tailor] Server error text:", errorText);
            if (errorText) serverError = errorText.slice(0, 200);
          } catch {}
        }
        throw new Error(serverError);
      }
      const result: TailoredResume = await tailorRes.json();
      
      // Store the spec-compliant TailoredResume result
      setTailoredResult(result);

      // Merge additions into clean ResumeStructure for backwards compatibility and export
      const mergedTailoredResume = mergeResumeWithAdditions(selectedResume, result);
      
      if (mergedTailoredResume) {
        setTailorProcessingStage("Comparing Resume vs JD");
        const tailoredAtsEvaluation = calculateRealisticAtsScore(mergedTailoredResume, simplifiedJd);
        const diffResult = generateResumeDiff(selectedResume, mergedTailoredResume);

        const newVersion: SavedResumeVersion = {
          id: `ver-${Date.now()}`,
          companyName: companyVal,
          jobTitle: extractedRole,
          savedAt: formatResumeCreatedDate(new Date().toISOString()),
          resumeData: mergedTailoredResume,
          originalResumeData: selectedResume,
          originalJobDescription: jdTextVal,
          appliedSuggestionsCount: (result.newSkills?.length || 0) + (result.newSections?.length || 0),
          atsScore: tailoredAtsEvaluation.score,
          matchPercentage: tailoredAtsEvaluation.matchPercentage,
          improvements: result.missingKeywords.slice(0, 5),
          missingRequirements: tailoredAtsEvaluation.missingKeywords,
          missingQualifications: [],
          diffAdded: diffResult.added,
          diffModified: diffResult.modified,
          diffUnchanged: diffResult.unchanged
        };

        setTailoredResultResume(mergedTailoredResume);
        setTailoredResultVersion(newVersion);
        setTailoredAtsScore(result.score || tailoredAtsEvaluation.score);

        // Update locally saved versions
        setSavedVersions(prev => {
          const updated = [newVersion, ...prev];
          localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(updated));
          return updated;
        });

        setTailorWizardStep(3);
      }
    } catch (err: any) {
      console.error(err);
      setTailorAnalysisError(err.message || "Failed to process.");
    } finally {
      stopTailorProgress(false);
      setTailorIsAnalyzing(false);
    }
  };

  const getTailoredResultInsights = (original: ResumeStructure | null, tailored: ResumeStructure | null, version: SavedResumeVersion | null) => {
    const originalSkills = new Set((original?.skills || []).map(skill => skill.toLowerCase()));
    const skillsAdded = (tailored?.skills || []).filter(skill => !originalSkills.has(skill.toLowerCase()));
    const targetKeywords = tailorAnalysisResult?.simplifiedJdObject?.keywordsToTarget || [];
    const originalText = JSON.stringify(original || {}).toLowerCase();
    const tailoredText = JSON.stringify(tailored || {}).toLowerCase();
    const keywordsAdded = targetKeywords.filter(keyword =>
      keyword && !originalText.includes(String(keyword).toLowerCase()) && tailoredText.includes(String(keyword).toLowerCase())
    );
    const sectionsImproved = [
      original?.summary !== tailored?.summary ? "Professional Summary" : null,
      JSON.stringify(original?.workExperience || []) !== JSON.stringify(tailored?.workExperience || []) ? "Experience" : null,
      JSON.stringify(original?.projects || []) !== JSON.stringify(tailored?.projects || []) ? "Projects" : null,
      skillsAdded.length > 0 ? "Skills" : null,
      JSON.stringify(original?.education || []) !== JSON.stringify(tailored?.education || []) ? "Education" : null,
    ].filter(Boolean) as string[];

    const originalMissing = tailorAnalysisResult?.missingKeywords || version?.missingRequirements || [];
    const remainingMissing = originalMissing.filter(kw => {
      if (!kw) return false;
      const kwLower = kw.toLowerCase();
      // Check if it exists in tailored skills or tailored full text
      const inSkills = (tailored?.skills || []).some(s => String(s).toLowerCase() === kwLower);
      const inText = tailoredText.includes(kwLower);
      return !inSkills && !inText;
    });

    return {
      skillsAdded,
      keywordsAdded,
      sectionsImproved,
      missingRequirements: remainingMissing,
      improvements: version?.improvements || [],
      added: version?.diffAdded || [],
      modified: version?.diffModified || [],
      unchanged: version?.diffUnchanged || [],
    };
  };

  const getHighlightClass = (section: "summary" | "skills" | "experience" | "projects", originalValue: unknown, tailoredValue: unknown, value?: string) => {
    if (section === "summary") {
      return JSON.stringify(originalValue || "") !== JSON.stringify(tailoredValue || "") ? "bg-purple-100 border-purple-300" : "";
    }
    if (section === "skills") {
      const originalSkills = Array.isArray(originalValue) ? originalValue.map(skill => String(skill).toLowerCase()) : [];
      return value && !originalSkills.includes(value.toLowerCase()) ? "bg-blue-100 border-blue-300" : "";
    }
    if (section === "experience") {
      const originalBullets = Array.isArray(originalValue) ? originalValue.map(b => String(b).trim().toLowerCase()) : [];
      const isNew = !originalBullets.includes(String(tailoredValue).trim().toLowerCase());
      return isNew ? "bg-emerald-100 border-emerald-300" : "";
    }
    if (section === "projects") {
      const origProjects = Array.isArray(originalValue) ? originalValue : [];
      const tailProj = tailoredValue as any;
      const tailDesc = Array.isArray(tailProj?.description) ? tailProj.description.join(" ") : String(tailProj?.description || "");
      const exists = origProjects.some((op: any) => {
        const opDesc = Array.isArray(op?.description) ? op.description.join(" ") : String(op?.description || "");
        return opDesc.trim().toLowerCase() === tailDesc.trim().toLowerCase();
      });
      return !exists ? "bg-yellow-100 border-yellow-300" : "";
    }
    return "";
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

  const handleGuestAccess = async () => {
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);
    setAuthMessage(null);
    const name = "Guest Candidate";
    const email = "guest@fresher.io";
    try {
      const session = await supabaseAuth.signInAnonymously();
      localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
      await supabaseData.upsertUser(session.accessToken, {
        id: session.user.id,
        email,
      });
      await supabaseData.upsertProfile(session.accessToken, {
        id: session.user.id,
        full_name: name,
      });
      const userObj = { email, name, isGuest: true };
      setCurrentUser(userObj);
      setCurrentStep("resume");
      showNotification("Continuing as Guest.", "success");
    } catch (error: any) {
      showNotification(error.message || "Guest login failed. Please try again.", "error");
    } finally {
      setIsAuthSubmitting(false);
    }
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
    setCurrentStep("dashboard");
    showNotification(`Loaded tailoring details for ${ver.companyName}!`, "info");
  };

  // Preset loaders
  const loadPresetResume = (key: "software_grad" | "marketing_grad") => {
    const presetData = DEMO_RESUMES[key].data;
    const label = DEMO_RESUMES[key].label;
    if (isDuplicateResume(undefined, undefined, presetData)) {
      showNotification("This resume has already been added.", "error");
      return;
    }
    const newId = `resume-preset-${key}-${Date.now()}`;
    const newEntry: SavedResume = {
      id: newId,
      name: generateUniqueResumeName(label),
      data: presetData,
      uploadedAt: new Date().toISOString()
    };
    setSavedUserResumes(prev => [...prev, newEntry]);
    setActiveResumeId(newId);
    setActiveResume(presetData);
    setOriginalResume(presetData);
    setIsUnlocked(true);
    sessionStorage.setItem("auralis_platform_unlocked", "true");
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
          if (isDuplicateResume(undefined, undefined, parsed)) {
            showNotification("This resume has already been added.", "error");
            return;
          }
          const newId = `resume-json-${Date.now()}`;
          const newEntry: SavedResume = {
            id: newId,
            name: generateUniqueResumeName(parsed.fullName || file.name),
            data: parsed,
            uploadedAt: new Date().toISOString()
          };
          setSavedUserResumes(prev => [...prev, newEntry]);
          setActiveResumeId(newId);
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

  // Call backend to validate whether file is a resume, then save it
  const triggerResumeAnalysis = async (file: File) => {
    setIsAnalyzing(true);
    setUploadError(null);
    setAnalysisResult(null);

    try {
      const base64Data = await convertFileToBase64(file);

      if (isDuplicateResume(base64Data)) {
        setUploadError("This resume has already been added to your library.");
        setIsAnalyzing(false);
        return;
      }

      const controller = new AbortController();
      // 55-second timeout: Gemini 2.5 Flash can take 20-40s under load; Vercel functions cap at 60s
      const validationTimeout = window.setTimeout(() => controller.abort(), 55000);
      const res = await fetch("/api/analyze-uploaded-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, base64Data }),
        signal: controller.signal
      });
      window.clearTimeout(validationTimeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const result = await res.json();

      console.info("[Resume Validation] Result", {
        fileName: file.name,
        isResume: result.isResume,
        indicators: result.indicators || [],
        reason: result.reason || ""
      });

      if (!result.isResume) {
        setAnalysisResult({ isResume: false });
        setTempFile(null);
        setUploadError(result.reason || "This document does not look like a professional resume.");
        return;
      }

      {
        const dp = result.detectedProfile || {};
        const defaultName = file.name.replace(/\.[^/.]+$/, "");
        const resumeHolderName = isLikelyResumeHolderName(dp.fullName) ? dp.fullName.trim() : "";
        const extension = file.name.split(".").pop()?.toLowerCase();
        const storedFileType: "pdf" | "docx" =
          result.fileType === "docx" || extension === "docx" ? "docx" : "pdf";

        const mappedExperience = (dp.workExperience || []).map((exp: any, idx: number) => ({
          id: `exp-${Date.now()}-${idx}`,
          role: exp.role || "",
          company: exp.company || "",
          duration: exp.duration || "",
          description: Array.isArray(exp.description) ? exp.description : [exp.description || ""]
        }));

        const mappedEducation = (dp.education || []).map((edu: any, idx: number) => ({
          id: `edu-${Date.now()}-${idx}`,
          degree: edu.degree || "",
          school: edu.school || "",
          duration: edu.duration || "",
          gpa: edu.gpa || ""
        }));

        const mappedProjects = (dp.projects || []).map((proj: any, idx: number) => ({
          id: `proj-${Date.now()}-${idx}`,
          name: proj.name || "",
          description: Array.isArray(proj.description) ? proj.description : [proj.description || ""]
        }));

        const newResumeData: ResumeStructure = {
          fullName: resumeHolderName || defaultName,
          email: dp.email || "",
          phone: dp.phone || "",
          summary: dp.summary || "",
          skills: dp.skills && dp.skills.length > 0 ? dp.skills : [],
          languages: dp.languages && dp.languages.length > 0 ? dp.languages : [],
          workExperience: mappedExperience,
          education: mappedEducation,
          projects: mappedProjects,
          certifications: dp.certifications || [],
          achievements: dp.achievements || []
        };

        const newId = `resume-${Date.now()}`;
        const newEntry: SavedResume = {
          id: newId,
          name: generateUniqueResumeName(resumeHolderName || file.name.replace(/\.[^/.]+$/, "")),
          data: newResumeData,
          fileBase64: base64Data,
          originalFileName: file.name,
          fileType: storedFileType,
          extractedText: result.extractedText || "",
          pdfBase64: storedFileType === "pdf" ? base64Data : undefined,
          uploadedAt: new Date().toISOString()
        };

        setSavedUserResumes(prev => [...prev, newEntry]);
        setActiveResumeId(newId);
        setIsUnlocked(true);
        sessionStorage.setItem("auralis_platform_unlocked", "true");
        setOnboardingChoice("done");
        sessionStorage.setItem("auralis_onboarding_dismissed", "true");
        localStorage.setItem("jd_resume_customizer_onboarding_done", "true");

        // Auto-close modal and toast success
        setIsUploadModalOpen(false);
        setIsChoiceModalOpen(false);
        setTempFile(null);
        setAnalysisResult(null);
        showNotification("Resume saved successfully!", "success");
      }
    } catch (err: any) {
      console.error("Resume validation error:", err);
      setUploadError(err.name === "AbortError" ? "Resume validation timed out. Please upload a smaller or readable resume file." : err.message || "Failed to process the file. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Manual Editor Actions
  const handleUpdateContact = (field: keyof ResumeStructure, value: any) => {
    setActiveResume(prev => {
      const updated = { ...prev, [field]: value };
      syncActiveResumeToLibrary(updated);
      return updated;
    });
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
    if (currentUser?.isGuest) {
      showNotification("Please sign in or create an account to save tailored resume versions.", "error");
      return;
    }
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
    const session = getStoredSupabaseSession();
    if (session?.accessToken && currentUser && !currentUser.isGuest) {
      supabaseData.deleteTailoredResume(session.accessToken, id)
        .catch((error) => console.warn("Supabase tailored resume delete failed:", error));
    }
    setSavedVersions(prev => prev.filter(v => v.id !== id));
    showNotification("Version removed from management.", "info");
  };

  const cleanExportValue = (value?: string): string => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^(unknown institution|unknown degree|undefined|null|n\/a|na)$/i.test(text)) return "";
    if (/^(page\s*\d+|>\s*|candidate\s*\/\s*profile optimized)$/i.test(text)) return "";
    return text
      .replace(/^>\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const sanitizeResumeForExport = (resume: ResumeStructure): ResumeStructure => ({
    ...resume,
    fullName: cleanExportValue(resume.fullName) || "Candidate",
    email: cleanExportValue(resume.email),
    phone: cleanExportValue(resume.phone),
    linkedin: cleanExportValue(resume.linkedin),
    website: cleanExportValue(resume.website),
    location: cleanExportValue(resume.location),
    summary: cleanExportValue(resume.summary),
    skills: Array.from(new Set((resume.skills || []).map(cleanExportValue).filter(Boolean))),
    workExperience: (resume.workExperience || [])
      .map(exp => ({
        ...exp,
        role: cleanExportValue(exp.role),
        company: cleanExportValue(exp.company),
        duration: cleanExportValue(exp.duration),
        description: Array.from(new Set((exp.description || []).map(cleanExportValue).filter(Boolean)))
      }))
      .filter(exp => exp.role || exp.company || exp.description.length > 0),
    education: (resume.education || [])
      .map(edu => ({
        ...edu,
        degree: cleanExportValue(edu.degree),
        school: cleanExportValue(edu.school),
        duration: cleanExportValue(edu.duration),
        gpa: cleanExportValue(edu.gpa)
      }))
      .filter(edu => edu.degree || edu.school),
    projects: (resume.projects || [])
      .map(project => ({
        ...project,
        name: cleanExportValue(project.name),
        duration: cleanExportValue(project.duration),
        description: Array.from(new Set((project.description || []).map(cleanExportValue).filter(Boolean)))
      }))
      .filter(project => project.name || project.description.length > 0),
    certifications: Array.from(new Set((resume.certifications || []).map(cleanExportValue).filter(Boolean))),
    languages: Array.from(new Set((resume.languages || []).map(cleanExportValue).filter(Boolean))),
  });

  const DOWNLOAD_ERROR_MESSAGE = "Unable to generate resume. Please try again.";

  const logDownloadEvent = (message: string, details?: unknown) => {
    if (details !== undefined) {
      console.info(`[Resume Download] ${message}`, details);
    } else {
      console.info(`[Resume Download] ${message}`);
    }
  };

  const failDownload = (reason: string, error?: unknown) => {
    console.error(`[Resume Download] Reason for failure: ${reason}`, error || "");
    showNotification(DOWNLOAD_ERROR_MESSAGE, "error");
  };

  const hasDownloadableResumeContent = (resume?: ResumeStructure | null): boolean => {
    if (!resume) return false;
    const textParts = [
      resume.fullName,
      resume.email,
      resume.phone,
      resume.summary,
      ...(resume.skills || []),
      ...(resume.workExperience || []).flatMap(exp => [exp.company, exp.role, exp.duration, ...(exp.description || [])]),
      ...(resume.education || []).flatMap(edu => [edu.degree, edu.school, edu.duration]),
      ...(resume.projects || []).flatMap(project => [project.name, project.duration, ...(project.description || [])]),
      ...(resume.certifications || []),
    ];
    return textParts.some(part => Boolean(String(part || "").trim()));
  };

  const validateResumeForExport = (resume: ResumeStructure, original?: ResumeStructure): string[] => {
    const issues: string[] = [];
    if (!hasDownloadableResumeContent(resume)) issues.push("Resume content is empty.");
    if (!resume.email && !resume.phone) issues.push("Contact details are missing.");
    if ((resume.education || []).length === 0) issues.push("Education section is missing.");
    if ((resume.workExperience || []).length === 0) issues.push("Experience section is missing.");
    if ((resume.skills || []).length === 0) issues.push("Skills section is missing.");
    const serialized = JSON.stringify(resume).toLowerCase();
    if (/unknown institution|unknown degree|undefined|null/.test(serialized)) issues.push("Placeholder values were found.");
    const bullets = (resume.workExperience || []).flatMap(exp => exp.description || []);
    if (new Set(bullets.map(b => b.toLowerCase())).size !== bullets.length) issues.push("Duplicate experience bullets were found.");
    if (original) {
      if (resume.fullName !== original.fullName) issues.push("Name was not preserved exactly.");
      if (resume.phone !== original.phone) issues.push("Phone number was not preserved exactly.");
      if (resume.email !== original.email) issues.push("Email was not preserved exactly.");
      if ((original.linkedin || "") && resume.linkedin !== original.linkedin) issues.push("LinkedIn was not preserved exactly.");
      if ((original.website || "") && resume.website !== original.website) issues.push("Website was not preserved exactly.");
      if ((original.location || "") && resume.location !== original.location) issues.push("Location was not preserved exactly.");
      if ((resume.workExperience || []).length !== (original.workExperience || []).length) issues.push("Work experience entries were not preserved.");
      if ((resume.education || []).length !== (original.education || []).length) issues.push("Education entries were not preserved.");
      if ((resume.projects || []).length !== (original.projects || []).length) issues.push("Project entries were not preserved.");
      if ((resume.certifications || []).length !== (original.certifications || []).length) issues.push("Certifications were not preserved.");
      (original.workExperience || []).forEach((orig, idx) => {
        const exp = resume.workExperience?.[idx];
        if (!exp || exp.company !== orig.company || exp.role !== orig.role || exp.duration !== orig.duration) {
          issues.push("Work experience company, role, or date was not preserved exactly.");
        }
      });
      (original.education || []).forEach((orig, idx) => {
        const edu = resume.education?.[idx];
        if (!edu || edu.degree !== orig.degree || edu.school !== orig.school || edu.duration !== orig.duration) {
          issues.push("Education details were not preserved exactly.");
        }
      });
      (original.projects || []).forEach((orig, idx) => {
        const project = resume.projects?.[idx];
        if (!project || project.name !== orig.name || project.duration !== orig.duration) {
          issues.push("Project names or dates were not preserved exactly.");
        }
      });
      (original.certifications || []).forEach((orig, idx) => {
        if (resume.certifications?.[idx] !== orig) {
          issues.push("Certifications were not preserved exactly.");
        }
      });
    }
    return issues;
  };

  const prepareResumeForDownload = (resume?: ResumeStructure | null, original?: ResumeStructure): ResumeStructure | null => {
    logDownloadEvent("File Generation Started");
    if (!resume) {
      failDownload("Resume does not exist.");
      return null;
    }
    if (!hasDownloadableResumeContent(resume)) {
      failDownload("Resume generation has not completed or resume content is empty.");
      return null;
    }

    const repaired = original ? sanitizeResume(resume, original) : resume;
    const sanitized = sanitizeResumeForExport(repaired);
    const originalForValidation = original ? sanitizeResumeForExport(original) : undefined;
    const issues = validateResumeForExport(sanitized, originalForValidation);
    if (issues.length > 0) {
      console.warn("Resume download validation failed:", issues);
      failDownload(`Validation failed: ${issues.join("; ")}`);
      return null;
    }
    return sanitized;
  };

  const escapeHtml = (value?: string): string =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // Exporters
  const handlePrintDownload = () => {
    // Triggers standard print screen with custom pure print target styling
    window.print();
  };



  const downloadBlob = (blob: Blob, filename: string): boolean => {
    if (!blob || blob.size === 0) {
      failDownload(`Generated file is empty for ${filename}.`);
      return false;
    }
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      link.style.display = "none";
      document.body.appendChild(link);
      logDownloadEvent("Download Triggered", { filename, bytes: blob.size });
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      logDownloadEvent("Download Completed", { filename });
      return true;
    } catch (error) {
      URL.revokeObjectURL(url);
      failDownload(`Browser download trigger failed for ${filename}.`, error);
      return false;
    }
  };

  const buildResumePlainLines = (resume: ResumeStructure, headline = "") => {
    const contactParts = [resume.phone, resume.email, resume.linkedin, resume.location, resume.website].filter(Boolean);
    const lines: { text: string; type?: "title" | "headline" | "contact" | "heading" | "body" | "bullet" | "subhead" | "meta" | "rule" | "spacer" }[] = [];
    lines.push({ text: resume.fullName, type: "title" });
    if (headline) lines.push({ text: headline, type: "headline" });
    if (contactParts.length) lines.push({ text: contactParts.join(" | "), type: "contact" });
    lines.push({ text: "", type: "rule" });
    if (resume.summary) {
      lines.push({ text: "Professional Summary", type: "heading" });
      lines.push({ text: resume.summary, type: "body" });
    }
    if (resume.skills?.length) {
      lines.push({ text: "Core Skills", type: "heading" });
      resume.skills.forEach(skill => lines.push({ text: skill, type: "bullet" }));
    }
    if (resume.workExperience?.length) {
      lines.push({ text: "Work Experience", type: "heading" });
      resume.workExperience.forEach((exp, idx) => {
        if (exp.company) lines.push({ text: exp.company, type: "subhead" });
        if (exp.role || exp.duration) lines.push({ text: [exp.role, exp.duration].filter(Boolean).join(" | "), type: "meta" });
        exp.description.forEach(bullet => lines.push({ text: bullet, type: "bullet" }));
        if (idx < resume.workExperience.length - 1) lines.push({ text: "", type: "spacer" });
      });
    }
    if (resume.projects?.length) {
      lines.push({ text: "Projects", type: "heading" });
      resume.projects.forEach((project, idx) => {
        lines.push({ text: project.name, type: "subhead" });
        if (project.duration) lines.push({ text: project.duration, type: "meta" });
        project.description.forEach(bullet => lines.push({ text: bullet, type: "bullet" }));
        if (idx < (resume.projects || []).length - 1) lines.push({ text: "", type: "spacer" });
      });
    }
    if (resume.education?.length) {
      lines.push({ text: "Education", type: "heading" });
      resume.education.forEach(edu => {
        if (edu.degree) lines.push({ text: edu.degree, type: "subhead" });
        if (edu.school) lines.push({ text: edu.school, type: "body" });
        const metaParts = [edu.duration, edu.gpa ? `GPA: ${edu.gpa}` : null].filter(Boolean);
        if (metaParts.length) lines.push({ text: metaParts.join(" | "), type: "meta" });
      });
    }
    if (resume.certifications?.length) {
      lines.push({ text: "Certifications", type: "heading" });
      resume.certifications.forEach(cert => lines.push({ text: cert, type: "bullet" }));
    }
    if (resume.languages?.length) {
      lines.push({ text: "Languages", type: "heading" });
      resume.languages.forEach(lang => lines.push({ text: lang, type: "bullet" }));
    }
    return lines;
  };

  const wrapPdfText = (text: string, maxChars: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    const rows: string[] = [];
    let current = "";
    words.forEach(word => {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        rows.push(current);
        current = word;
      } else {
        current = next;
      }
    });
    if (current) rows.push(current);
    return rows.length ? rows : [""];
  };

  const handlePrintOrSavePDF = (resume: ResumeStructure, original?: ResumeStructure, headline = "", tailored?: TailoredResume) => {
    try {
      logDownloadEvent("Download Started", { type: "PDF" });
      setPrintResume(resume);
      setPrintOriginalResume(original);
      setPrintTailoredResult(tailored || null);
      
      showNotification("Generating PDF file...", "info");

      // Helper function to temporarily replace oklch colors with rgb equivalent to avoid html2canvas parser crash
      const tempConvertStyleSheets = async () => {
        const links = Array.from(document.querySelectorAll("link[rel='stylesheet']")) as HTMLLinkElement[];
        const styles = Array.from(document.querySelectorAll("style")) as HTMLStyleElement[];
        
        const originalLinkStates = links.map(l => ({ el: l, disabled: l.disabled }));
        const originalStyleContents = styles.map(s => ({ el: s, content: s.innerHTML }));
        
        const tempStyleEl = document.createElement("style");
        tempStyleEl.id = "temp-html2canvas-styles";
        
        // 1. Process inline styles
        styles.forEach(s => {
          try {
            s.innerHTML = s.innerHTML.replace(/oklch\([^)]+\)/g, "rgb(100, 100, 100)");
          } catch (e) {
            // Ignore stylesheet access errors
          }
        });
        
        // 2. Fetch external styles, replace oklch, and inject
        let mergedCss = "";
        for (const link of links) {
          try {
            const res = await fetch(link.href);
            if (res.ok) {
              const cssText = await res.text();
              mergedCss += cssText.replace(/oklch\([^)]+\)/g, "rgb(100, 100, 100)") + "\n";
            }
          } catch (e) {
            console.warn("Could not load external stylesheet for PDF generation:", e);
          }
          link.disabled = true;
        }
        
        tempStyleEl.innerHTML = mergedCss;
        document.head.appendChild(tempStyleEl);
        
        return () => {
          tempStyleEl.remove();
          originalLinkStates.forEach(item => {
            item.el.disabled = item.disabled;
          });
          originalStyleContents.forEach(item => {
            try {
              item.el.innerHTML = item.content;
            } catch (e) {
              // Ignore stylesheet restore errors
            }
          });
        };
      };

      // Wait for React to render the print preview container into DOM
      setTimeout(async () => {
        try {
          const element = document.getElementById("resume-preview-sheet-print");
          if (!element) {
            throw new Error("Print layout container not found in DOM");
          }

          // Clone the element to render off-screen cleanly
          const clone = element.cloneNode(true) as HTMLElement;
          clone.style.position = "fixed";
          clone.style.left = "-9999px";
          clone.style.top = "0";
          clone.style.width = "820px"; // standard Letter/A4 page layout width for resume
          clone.style.display = "block";
          clone.style.background = "white";
          clone.style.zIndex = "-9999";
          
          document.body.appendChild(clone);

          // Force-show images or icons if any (wait 100ms for browser layout recalculation)
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Run temporary stylesheet replacement to protect html2canvas from oklch crash
          const restoreStylesheets = await tempConvertStyleSheets();

          const canvas = await html2canvas(clone, {
            scale: 2, // High DPI print resolution
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff"
          });

          // Restore styles immediately
          restoreStylesheets();

          document.body.removeChild(clone);

          const imgData = canvas.toDataURL("image/png");
          const pdf = new jsPDF("p", "mm", "a4");
          const imgWidth = 210; // A4 width in mm
          const pageHeight = 297; // A4 height in mm
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          let heightLeft = imgHeight;
          let position = 0;

          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;

          while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }

          const filename = `${resume.fullName.replace(/\s+/g, "_")}_Tailored_Resume.pdf`;
          pdf.save(filename);

          logDownloadEvent("Download Completed", { type: "PDF" });
          showNotification("PDF downloaded successfully.", "success");
        } catch (genError: any) {
          console.error("PDF canvas generation failed:", genError);
          showNotification("Failed to generate PDF file.", "error");
        }
      }, 300);
    } catch (error: any) {
      console.error("PDF Print failed:", error);
      showNotification("Failed to generate PDF.", "error");
    }
  };

  const downloadResumeAsDocx = async (resume: ResumeStructure, filename: string, original?: ResumeStructure, headline = "") => {
    try {
      logDownloadEvent("Download Started", { type: "DOCX" });
      const exportResume = prepareResumeForDownload(resume, original);
      if (!exportResume) return;

      logDownloadEvent("File Generation Started", { type: "DOCX" });
      const textXml = (value?: string) => escapeHtml(value).replace(/\n/g, " ");
      const paragraph = (text: string, style = "BodyText") => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${textXml(text)}</w:t></w:r></w:p>`;
      const bullet = (text: string) => `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${textXml(text)}</w:t></w:r></w:p>`;
      const heading = (text: string) => paragraph(text.toUpperCase(), "Heading1");
      const subhead = (text: string) => paragraph(text, "Heading2");
      const smallLine = (text: string) => paragraph(text, "BodyText");
      const metaLine = (text: string) => paragraph(text, "Meta");
      const entryGap = () => paragraph("", "EntryGap");
      const contactLines = [exportResume.phone, exportResume.email, exportResume.linkedin, exportResume.location, exportResume.website].filter(Boolean);
      const cell = (content: string, width: number) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
      const headerTable = () => `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="6" w:space="3" w:color="C9CDD3"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="6048"/><w:gridCol w:w="4032"/></w:tblGrid><w:tr>${cell(paragraph(exportResume.fullName, "HeaderName") + (headline ? paragraph(headline, "HeaderRole") : ""), 6048)}${cell(contactLines.map(line => paragraph(String(line), "HeaderContact")).join(""), 4032)}</w:tr></w:tbl>`;

      let body = "";
      body += headerTable();
      if (exportResume.summary) body += heading("Professional Summary") + paragraph(exportResume.summary);
      if (exportResume.skills.length) {
        body += heading("Core Skills");
        exportResume.skills.forEach(skill => { body += bullet(skill); });
      }
      if (exportResume.workExperience.length) {
        body += heading("Work Experience");
        exportResume.workExperience.forEach((exp, idx) => {
          if (exp.company) body += subhead(exp.company);
          if (exp.role || exp.duration) body += metaLine([exp.role, exp.duration].filter(Boolean).join(" | "));
          exp.description.forEach(item => { body += bullet(item); });
          if (idx < exportResume.workExperience.length - 1) body += entryGap();
        });
      }
      if (exportResume.projects?.length) {
        body += heading("Projects");
        exportResume.projects.forEach((project, idx) => {
          body += subhead(project.name);
          if (project.duration) body += metaLine(project.duration);
          project.description.forEach(item => { body += bullet(item); });
          if (idx < (exportResume.projects || []).length - 1) body += entryGap();
        });
      }
      if (exportResume.education.length) {
        body += heading("Education");
        exportResume.education.forEach(edu => {
          if (edu.degree) body += subhead(edu.degree);
          if (edu.school) body += smallLine(edu.school);
          if (edu.duration) body += metaLine(edu.duration);
          if (edu.gpa) body += paragraph(`GPA: ${edu.gpa}`);
        });
      }
      if (exportResume.achievements?.length) {
        body += heading("Key Achievements");
        exportResume.achievements.forEach(ach => { body += bullet(ach); });
      }
      if (exportResume.certifications?.length) {
        body += heading("Certifications");
        exportResume.certifications.forEach(cert => { body += bullet(cert); });
      }
      if (exportResume.languages?.length) {
        body += heading("Languages");
        exportResume.languages.forEach(lang => { body += bullet(lang); });
      }

      const zip = new JSZip();
      zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
      zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
      zip.folder("word")?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
      zip.folder("word")?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:spacing w:after="90" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderName"><w:name w:val="Header Name"/><w:pPr><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderRole"><w:name w:val="Header Role"/><w:pPr><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:color w:val="374151"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderContact"><w:name w:val="Header Contact"/><w:pPr><w:jc w:val="right"/><w:spacing w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="111827"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="180" w:after="80" w:line="276" w:lineRule="auto"/><w:pBdr><w:bottom w:val="single" w:sz="5" w:space="3" w:color="C9CDD3"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:pPr><w:spacing w:before="80" w:after="20" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:pPr><w:spacing w:after="50" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="4B5563"/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="EntryGap"><w:name w:val="Entry Gap"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:sz w:val="4"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="420" w:hanging="240"/><w:spacing w:after="45" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:style></w:styles>`);
      zip.folder("word")?.file("numbering.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="420" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
      zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);

      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      if (blob.size === 0) {
        failDownload("DOCX generation produced an empty file.");
        return;
      }
      logDownloadEvent("DOCX Generated", { bytes: blob.size });
      const didDownload = downloadBlob(blob, filename.endsWith(".docx") ? filename : `${filename}.docx`);
      if (didDownload) showNotification("DOCX resume downloaded successfully.", "success");
    } catch (error: any) {
      console.error("DOCX generation failed:", error);
      failDownload(error.message || "DOCX generation failed.", error);
    }
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
    if (activeResume.certifications?.length) {
      text += `\n-- CERTIFICATIONS --\n${activeResume.certifications.join(", ")}\n`;
    }
    if (activeResume.languages?.length) {
      text += `\n-- LANGUAGES --\n${activeResume.languages.join(", ")}\n`;
    }

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
                      disabled={isAuthSubmitting}
                      className={`w-full py-3.5 bg-black hover:bg-neutral-800 text-white text-sm font-bold rounded-xl transition duration-150 shadow-md ${
                        isAuthSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      Continue as Guest
                    </button>
   
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-neutral-300"></div>
                      <span className="flex-shrink mx-4 text-neutral-500 text-[10px] uppercase font-mono font-bold tracking-widest">
                        OR
                      </span>
                      <div className="flex-grow border-t border-neutral-300"></div>
                    </div>
   
                    <form onSubmit={handleAuth} noValidate className="space-y-4 text-left">
                      <h2 className="text-xl font-black text-black tracking-tight">
                        {isResetPassword ? "Reset Password" : isForgotPassword ? "Forgot Password" : isSignUp ? "Create Account" : "Sign In"}
                      </h2>
   
                      {!isResetPassword && (
                        <div>
                          <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">Email Address</label>
                          <input
                            id="input-auth-email"
                            type="email"
                            required
                            placeholder="name@university.edu"
                            value={authEmail}
                            onChange={(e) => {
                              setAuthEmail(e.target.value);
                              setAuthMessage(null);
                            }}
                            className="w-full pl-3 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                          />
                        </div>
                      )}
   
                      {!isForgotPassword && (
                        <div>
                          <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">{isResetPassword ? "New Password" : "Password"}</label>
                          <div className="relative">
                            <input
                              id="input-auth-password"
                              type={showPassword ? "text" : "password"}
                              required
                              placeholder="••••••••"
                              value={authPassword}
                              onChange={(e) => {
                                setAuthPassword(e.target.value);
                                setAuthMessage(null);
                              }}
                              className="w-full pl-3 pr-10 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-black cursor-pointer flex items-center justify-center p-1 rounded-md"
                              title={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {!isSignUp && !isResetPassword && (
                            <button
                              id="btn-forgot-password"
                              type="button"
                              onClick={() => {
                                setIsForgotPassword(true);
                                setIsSignUp(false);
                                setIsResetPassword(false);
                                setAuthPassword("");
                                setAuthConfirmPassword("");
                                setAuthMessage(null);
                                setShowPassword(false);
                                setShowConfirmPassword(false);
                              }}
                              className="mt-2 text-[11px] text-black hover:text-neutral-700 underline font-semibold"
                            >
                              Forgot Password?
                            </button>
                          )}
                        </div>
                      )}

                      {(isSignUp || isResetPassword) && (
                        <div>
                          <label className="block text-[10px] text-black uppercase font-mono mb-1.5 font-bold">Confirm Password</label>
                          <div className="relative">
                            <input
                              id="input-auth-confirm-password"
                              type={showConfirmPassword ? "text" : "password"}
                              required
                              placeholder="••••••••"
                              value={authConfirmPassword}
                              onChange={(e) => {
                                setAuthConfirmPassword(e.target.value);
                                setAuthMessage(null);
                              }}
                              className="w-full pl-3 pr-10 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-black cursor-pointer flex items-center justify-center p-1 rounded-md"
                              title={showConfirmPassword ? "Hide password" : "Show password"}
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {authMessage && (
                        <div
                          id="auth-inline-message"
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-relaxed ${
                            authMessage.type === "error"
                              ? "border-rose-300 bg-rose-50 text-rose-800"
                              : authMessage.type === "info"
                                ? "border-blue-300 bg-blue-50 text-blue-800"
                                : "border-emerald-300 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {authMessage.message}
                        </div>
                      )}

                      {isForgotPassword && resetCooldownSeconds > 0 && (
                        <div
                          id="password-reset-cooldown"
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800"
                        >
                          You can request another reset email in {resetCooldownSeconds} seconds.
                        </div>
                      )}
   
                      <button
                        id="btn-auth-submit"
                        type="submit"
                        disabled={isAuthSubmitting || (isForgotPassword && resetCooldownSeconds > 0)}
                        className={`w-full py-2.5 text-white text-xs font-semibold rounded-lg transition mt-4 shadow-md ${
                          isAuthSubmitting || (isForgotPassword && resetCooldownSeconds > 0)
                            ? "bg-neutral-400 cursor-not-allowed"
                            : "bg-black hover:bg-neutral-800 cursor-pointer"
                        }`}
                      >
                        {isAuthSubmitting
                          ? isResetPassword
                            ? "Updating Password..."
                            : isForgotPassword
                              ? "Sending Reset Link..."
                              : isSignUp
                                ? "Creating Account..."
                                : "Signing In..."
                          : isResetPassword
                            ? "Update Password"
                            : isForgotPassword
                              ? resetCooldownSeconds > 0
                                ? `Wait ${resetCooldownSeconds}s`
                                : "Send Reset Link"
                              : isSignUp
                                ? "Create Account"
                                : "Sign In"}
                      </button>
   
                      <div className="text-center mt-3">
                        {!isSignUp && !isForgotPassword && !isResetPassword && (
                          <p className="text-xs text-neutral-600 mb-2 font-semibold">Don't have an account?</p>
                        )}
                        <button
                          id="btn-toggle-auth-mode"
                          type="button"
                          onClick={() => {
                            if (isForgotPassword || isResetPassword) {
                              setIsForgotPassword(false);
                              setIsResetPassword(false);
                              setIsSignUp(false);
                              setResetAccessToken(null);
                            } else {
                              setIsSignUp(!isSignUp);
                            }
                            setAuthEmail("");
                            setAuthPassword("");
                            setAuthConfirmPassword("");
                            setAuthMessage(null);
                          }}
                          className="text-xs text-black hover:text-neutral-800 underline font-semibold transition"
                        >
                          {isForgotPassword || isResetPassword ? "Back to Sign In" : isSignUp ? "Already have an account? Sign In" : "Create Account"}
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
        className={`flex flex-col border-r-2 border-black bg-white transition-all duration-300 z-30 h-screen relative flex-shrink-0 ${
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
              { step: "dashboard", label: "Tailored Resumes", icon: FolderOpen }
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
                      setCurrentStep(item.step as "resume" | "dashboard");
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
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Persona identifier block */}
        <div className="p-4 border-t-2 border-black bg-white mt-auto">
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
              onClick={async () => {
                const storedSession = localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
                if (storedSession) {
                  try {
                    const session = JSON.parse(storedSession);
                    await supabaseAuth.signOut(session.accessToken);
                  } catch {
                    // Local sign-out should still continue even if remote sign-out fails.
                  }
                }
                // Clear all local storage and session storage
                localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
                sessionStorage.removeItem("jd_resume_customizer_guest_user");
                localStorage.removeItem("jd_resume_customizer_user");
                localStorage.removeItem("jd_resume_customizer_active_resume");
                localStorage.removeItem("jd_resume_customizer_original_resume");
                localStorage.removeItem("jd_resume_customizer_saved_resumes");
                localStorage.removeItem("jd_resume_customizer_versions");
                localStorage.removeItem("jd_resume_customizer_jd");
                localStorage.removeItem("jd_resume_customizer_active_resume_id");
                localStorage.removeItem("jd_resume_customizer_has_resume");
                sessionStorage.removeItem("auralis_platform_unlocked");
                sessionStorage.removeItem("auralis_onboarding_dismissed");
                localStorage.removeItem("jd_resume_customizer_onboarding_done");

                // Reset all states
                setCurrentUser(null);
                setCurrentStep("auth");
                setIsUnlocked(false);
                setOnboardingChoice(null);
                setActiveResume(DEMO_RESUMES.software_grad.data);
                setOriginalResume(DEMO_RESUMES.software_grad.data);
                setSavedUserResumes([]);
                setSavedVersions([]);
                setActiveResumeId(null);
                setJdText(DEMO_JDS.frontend_eng.text);
                setTargetCompany("Vercel Systems");
                setTargetRole("Junior Frontend Engineer");
                setAuthEmail("");
                setAuthPassword("");
                setAuthConfirmPassword("");
                setAuthMessage(null);
                setNotifications([]);
                setShowPassword(false);
                setShowConfirmPassword(false);

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
              className="fixed top-24 right-6 z-55 flex items-center gap-3 p-4 rounded-xl border-2 border-black dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-950 dark:text-white shadow-xl text-xs font-bold animate-slideIn"
            >
              {notification.type === "error" ? (
                <XCircle className="w-4 h-4 text-rose-500" />
              ) : notification.type === "info" ? (
                <AlertTriangle className="w-4 h-4 text-blue-500" />
              ) : (
                <Check className="w-4 h-4 text-emerald-500" />
              )}
              <span>{notification.message}</span>
            </div>
          )}

          {currentStep === "dashboard" && (
            <div className="max-w-5xl mx-auto space-y-6 relative min-h-[70vh] flex flex-col justify-between w-full">
              <div>
                {savedVersions.length === 0 ? (
                  /* FIRST TIME USER BLANK SCREEN STYLED SIMILAR TO LOGIN CARD WITH THICK BLACK BORDER */
                  <div className="max-w-xl w-full mx-auto my-6 animate-fadeIn">
                    <div className="flex flex-col items-center justify-center py-16 px-8 bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center w-full transition-all duration-300">
                      <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-400 flex items-center justify-center mb-6">
                        <FolderOpen className="w-8 h-8 text-black" />
                      </div>
                      {/* Shortened empty state text as requested */}
                      <h3 className="text-xl font-black tracking-tight text-black uppercase font-mono">No Resumes Tailored</h3>
                      <p className="text-sm text-neutral-650 mt-3 max-w-sm leading-relaxed font-semibold">
                        Add a resume in Resume Setup, then create and download a tailored resume here.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* EXQUISITE JD CARD LAYOUT REPRESENTING CREATED JDS AS DEPICTED IN THE WIREFRAME */
                  <div className="space-y-3 max-w-xl mx-auto text-left mt-2 animate-fadeIn w-full pb-4">
                    {savedVersions.map((version) => (
                      <div
                        key={version.id}
                        id={`jd-item-${version.id}`}
                        className="w-full bg-white border-4 border-black rounded-3xl p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 text-left"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <h3 className="text-lg font-black text-black tracking-tight font-sans truncate">
                            {version.companyName} — <span className="italic text-neutral-800 font-medium">{version.jobTitle}</span>
                          </h3>
                          <p className="text-[10px] font-mono font-bold text-neutral-550 tracking-wider">
                            Created: {version.savedAt}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSavedVersion(version);
                              setShowSavedVersionPreviewModal(true);
                            }}
                            className="px-4 py-2 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest border-2 border-black hover:bg-neutral-800 transition-all cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVersionToDeleteId(version.id);
                              setShowDeleteSavedVersionConfirmModal(true);
                            }}
                            className="px-4 py-2 bg-white text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest border-2 border-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Action Pill on dashboard fixed to bottom-right */}
              <button
                id={savedVersions.length === 0 ? "btn-dashboard-float-create-new" : "btn-dashboard-float-create-new-has-items"}
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
                className="fixed bottom-8 right-8 z-40 px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border border-transparent flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                <span>Create New</span>
              </button>
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
                        loadPresetResume("software_grad");
                        setOnboardingChoice("done");
                        sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                        localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
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
                    setIsUnlocked(true);
                    sessionStorage.setItem("auralis_platform_unlocked", "true");
                    setOnboardingChoice("done");
                    sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                    localStorage.setItem("jd_resume_customizer_onboarding_done", "true");

                    // Push into the library
                    const newId = `resume-manual-${Date.now()}`;
                    const newName = activeResume.fullName ? `${activeResume.fullName}'s Resume` : "My Resume";
                    if (isDuplicateResume(newName, undefined, activeResume)) {
                      showNotification("This resume has already been added.", "error");
                      return;
                    }
                    const newEntry: SavedResume = {
                      id: newId,
                      name: newName,
                      data: { ...activeResume },
                      uploadedAt: new Date().toISOString()
                    };
                    setSavedUserResumes(prev => [...prev, newEntry]);
                    setActiveResumeId(newId);
                    setOriginalResume(activeResume);
                    showNotification("Resume created and added to your library! Platform unlocked.", "success");
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
              <div id="step-resume-panel" className="max-w-5xl mx-auto space-y-6 min-h-[70vh] flex flex-col justify-between">
                <div>
                  {resumeSelectionMode === "create" ? null : !hasResume ? (
                    <div className="max-w-xl w-full mx-auto my-6 animate-fadeIn">
                      {/* Center empty state box matching the wireframe precisely */}
                      <div className="flex flex-col items-center justify-center py-16 px-8 bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center w-full transition-all duration-300">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-400 flex items-center justify-center mb-6">
                          <FolderOpen className="w-8 h-8 text-black" />
                        </div>
                        <h3 className="text-xl font-black tracking-tight text-black uppercase font-mono">No Resumes Setup</h3>
                        <p className="text-sm text-neutral-650 mt-3 max-w-sm leading-relaxed font-semibold">
                          Click on the 'Create New' button to upload your resume.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex flex-col justify-start items-center text-left p-2 animate-fadeIn w-full">
                      {/* Resume Library Card List and Floating Add Button Wrapper */}
                      <div className="max-w-xl w-full relative space-y-3 pb-4 mx-auto">
                        {savedUserResumes.map((savedResume) => (
                          <div
                            key={savedResume.id}
                            className="w-full bg-white border-4 border-black rounded-3xl p-5 sm:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-black text-black tracking-tight font-sans truncate">
                                  {getResumeCardDisplayName(savedResume)}
                                </h3>
                              </div>
                              <p className="text-[10px] font-mono font-bold text-neutral-550 tracking-wider">
                                Created: {formatResumeCreatedDate(savedResume.uploadedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveResumeId(savedResume.id);
                                  setPreviewResumeId(savedResume.id);
                                  setShowResumePreviewModal(true);
                                }}
                                className="px-4 py-2 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest border-2 border-black hover:bg-neutral-800 transition-all cursor-pointer"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setResumeToDeleteId(savedResume.id);
                                  setShowDeleteConfirmModal(true);
                                }}
                                className="px-4 py-2 bg-white text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest border-2 border-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {resumeSelectionMode !== "create" && (
                  <>
                    {!hasResume ? (
                      <div className="fixed bottom-8 right-8 z-40 group inline-block animate-fadeIn">
                        <button
                          id="btn-first-time-create-resume"
                          onClick={() => {
                            setTempFile(null);
                            setUploadError(null);
                            setAnalysisResult(null);
                            setIsUploadModalOpen(true);
                          }}
                          className="px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border border-transparent flex items-center gap-2"
                          title="Start here to unlock Auralis."
                        >
                          <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                          <span>Create New</span>
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-black text-white text-[10px] font-bold uppercase tracking-wider py-1 px-2.5 rounded border border-white whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] pointer-events-none z-35 font-sans">
                          Start here to unlock Auralis.
                        </div>
                      </div>
                    ) : (
                      <button
                        id="btn-create-resume-setup-floating"
                        onClick={() => {
                          setTempFile(null);
                          setUploadError(null);
                          setAnalysisResult(null);
                          setIsUploadModalOpen(true);
                        }}
                        className="fixed bottom-8 right-8 z-40 px-6 py-4 bg-[#2563eb] hover:bg-blue-600 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 shadow-xl cursor-pointer border border-transparent flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                        <span>Add Resume</span>
                      </button>
                    )}
                  </>
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
                        setIsUnlocked(true);
                        sessionStorage.setItem("auralis_platform_unlocked", "true");
                        setOnboardingChoice("done");
                        sessionStorage.setItem("auralis_onboarding_dismissed", "true");
                        localStorage.setItem("jd_resume_customizer_onboarding_done", "true");

                        // Push the manually created resume into the library
                        const newId = `resume-manual-${Date.now()}`;
                        const newName = activeResume.fullName ? `${activeResume.fullName}'s Resume` : "My Resume";
                        if (isDuplicateResume(newName, undefined, activeResume)) {
                          showNotification("This resume has already been added.", "error");
                          return;
                        }
                        const newEntry: SavedResume = {
                          id: newId,
                          name: newName,
                          data: { ...activeResume },
                          uploadedAt: new Date().toISOString()
                        };
                        setSavedUserResumes(prev => [...prev, newEntry]);
                        setActiveResumeId(newId);
                        setOriginalResume(activeResume);
                        showNotification("Resume created and added to your library!", "success");
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
                        ? "Checking your resume..."
                        : analysisResult && !analysisResult.isResume
                          ? "Not a Valid Resume"
                          : "Upload your resume"
                      }
                    </h3>
                    <p className="text-xs text-neutral-550 font-sans font-medium">
                      {isAnalyzing
                        ? "Please wait while we check your file..."
                        : analysisResult && !analysisResult.isResume
                          ? "Please upload a valid resume file."
                          : "Select or drop your PDF or DOCX file below."
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
                        <p className="text-sm font-black text-neutral-800 font-mono uppercase tracking-wide">Checking file...</p>
                        <p className="text-[11px] text-neutral-550 font-sans leading-relaxed font-semibold">
                          Verifying that your file is a resume. This only takes a few seconds.
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

                  {/* Invalid resume error */}
                  {showInvalidResumeCard && (
                    <div className="border-2 border-rose-500 bg-rose-50/20 rounded-2xl p-5 space-y-3.5">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-black text-rose-950 uppercase font-mono tracking-wide">Not a Valid Resume</p>
                          <p className="text-[11px] text-neutral-700 font-semibold mt-1 font-sans leading-relaxed">
                            This file does not appear to be a valid resume. Please upload a resume.
                          </p>
                        </div>
                      </div>
                      <div className="pt-1.5 flex justify-start">
                        <button
                          type="button"
                          onClick={() => {
                            setTempFile(null);
                            setUploadError(null);
                            setAnalysisResult(null);
                          }}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
                        >
                          Try Another File
                        </button>
                      </div>
                    </div>
                  )}

                  {/* File format / upload error */}
                  {uploadError && !isAnalyzing && !showInvalidResumeCard && (
                    <div className="flex items-center gap-2 p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 text-xs font-bold animate-fadeIn font-sans">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>{formatFriendlyError(uploadError)}</span>
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
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------------------- STEP 2: PASTE JOB DESCRIPTION & JD SIMPLIFIER -------------------- */}
        {false && (
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
        {false && (
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
                <ResumePreview resume={activeResume} templateStyle={selectedStyle} originalResume={originalResume || undefined} />
              </div>
            </div>
          </div>
        )}

        {/* -------------------- STEP: SAVED COPIES / VERSIONS LIST -------------------- */}
        {false && (
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
                    onClick={() => setCurrentStep("dashboard")}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setVersionToDeleteId(version.id);
                              setShowDeleteSavedVersionConfirmModal(true);
                            }}
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
              {false && (
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

      {currentStep !== "auth" && (
        <div className="print-container-display print-container">
          <ResumePreview
            resume={printResume || activeResume}
            templateStyle={selectedStyle}
            id="resume-preview-sheet-print"
            tailored={printTailoredResult || undefined}
            showHighlights={false}
          />
        </div>
      )}

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
              {(() => {
                const previewResume = savedUserResumes.find(r => r.id === previewResumeId);
                if (!previewResume) return <p className="text-sm text-neutral-500">No resume selected.</p>;

                return <ResumePreview resume={previewResume.data} templateStyle="two-column" />;
              })()}
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end border-t border-neutral-200 mt-2">
              <button
                id="btn-preview-popup-delete"
                onClick={() => {
                  setResumeToDeleteId(previewResumeId);
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
                {resumeToDeleteId && savedUserResumes.find(r => r.id === resumeToDeleteId)?.name
                  ? `Remove "${savedUserResumes.find(r => r.id === resumeToDeleteId)?.name}" from your library?`
                  : "Are you sure you want to delete this resume?"}
                {savedUserResumes.length === 1 && " This is your only resume — deleting it will lock the platform."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
              <button
                id="btn-confirm-delete-yes"
                onClick={() => {
                  if (resumeToDeleteId) {
                    handleDeleteResumeById(resumeToDeleteId);
                  }
                }}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                Yes, Delete
              </button>
              <button
                id="btn-confirm-delete-cancel"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setResumeToDeleteId(null);
                }}
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
                          We are validating key profile details and scanning contact coordinates.
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

                  {/* Invalid resume error */}
                  {showInvalidResumeCard && (
                    <div className="border-2 border-rose-500 bg-rose-50/20 rounded-2xl p-5 space-y-3.5">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-black text-rose-950 uppercase font-mono tracking-wide">Not a Valid Resume</p>
                          <p className="text-[11px] text-neutral-700 font-semibold mt-1 font-sans leading-relaxed">
                            This file does not appear to be a valid resume. Please upload a resume.
                          </p>
                        </div>
                      </div>
                      <div className="pt-1.5 flex justify-start">
                        <button
                          type="button"
                          onClick={() => {
                            setTempFile(null);
                            setUploadError(null);
                            setAnalysisResult(null);
                          }}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
                        >
                          Try Another File
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadError && !isAnalyzing && !showInvalidResumeCard && (
                    <div className="flex items-center gap-2 p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-950 text-xs font-bold animate-fadeIn font-sans">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>{formatFriendlyError(uploadError)}</span>
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

              {choiceModalPathway !== "upload" && (
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
          onClick={() => {
            if (!tailorIsAnalyzing) {
              setIsTailorWizardOpen(false);
            }
          }}
        >
          <div 
            id="tailor-wizard-modal" 
            className={`bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full text-left relative animate-scaleIn flex flex-col max-h-[95vh] ${tailorWizardStep === 3 ? "max-w-4xl" : "max-w-2xl"}`}
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
                {tailorAnalysisError ? "Error Occurred during processing" : (
                  <>
                    {tailorWizardStep === 1 && "Step 1 of 3: Target details"}
                    {tailorWizardStep === 2 && "Step 2 of 3: Job Description"}
                    {tailorWizardStep === 3 && "Step 3 of 3: Results & Download"}
                  </>
                )}
              </p>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 py-2">
              
              {/* Loader */}
              {tailorIsAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 min-h-[300px]">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                  <p className="text-sm font-black text-neutral-800 uppercase font-mono tracking-wide">
                    {tailorProcessingStage}...
                  </p>
                  <div className="w-full max-w-md space-y-2">
                    <div className="h-4 bg-neutral-200 border-2 border-black rounded-full overflow-hidden shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <div
                        className="h-full bg-[#2563eb] transition-all duration-300"
                        style={{ width: `${tailorProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-black font-mono uppercase tracking-wider text-neutral-600">
                      <span>{tailorProcessingStage}</span>
                      <span>{tailorProgress}%</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5 w-full max-w-2xl">
                    {processingStages.map(stage => {
                      const isDone = tailorProgress >= stage.at;
                      const isCurrent = tailorProcessingStage === stage.label;
                      const status = isCurrent ? "Processing" : isDone ? "✓ Complete" : "Waiting";
                      return (
                        <div key={stage.label} className={`text-[9px] font-black uppercase tracking-wide rounded-lg border px-2 py-1 text-center ${isCurrent ? "bg-amber-50 border-amber-300 text-amber-800" : isDone ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-neutral-200 text-neutral-400"}`}>
                          <div>{stage.label}</div>
                          <div className="text-[8px] mt-0.5">{status}</div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-neutral-555 text-center max-w-md font-semibold">
                    Target time is 5-15 seconds. If the AI service is slow, Auralis keeps processing and switches to deterministic ATS matching instead of blocking the workflow.
                  </p>
                </div>
              )}

              {/* Error Screen */}
              {!tailorIsAnalyzing && tailorAnalysisError && (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 min-h-[300px] text-center animate-fadeIn">
                  <div className="p-4 bg-rose-100 border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-bounce">
                    <XCircle className="w-12 h-12 text-rose-600 animate-pulse" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <h4 className="text-base font-black text-black uppercase font-mono tracking-tight">
                      Analysis Failed
                    </h4>
                    <p className="text-xs text-neutral-600 font-bold leading-relaxed">
                      {tailorAnalysisError}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTailorAnalysisError(null);
                        handleAnalyzeAndGenerate();
                      }}
                      className="flex-1 px-4 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                    >
                      Retry Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTailorAnalysisError(null);
                      }}
                      className="flex-1 px-4 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                    >
                      Back to Editing
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1: COMPANY NAME & CHOOSE RESUME */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 1 && (
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
                    {existingResumes.length >= 2 && (
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
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: JOB DESCRIPTION TEXT */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 2 && (
                <div className="space-y-4 text-left animate-fadeIn">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono">Job Description Text</label>
                    <textarea
                      placeholder="Paste the full job description text here..."
                      value={tailorJdText}
                      onChange={(e) => setTailorJdText(e.target.value)}
                      className="w-full bg-white border-2 border-black rounded-xl p-3 text-xs font-semibold focus:outline-none h-56 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: RESULTS & DOWNLOAD (Tailored Resume only) */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 3 && (
                (() => {
                  const originalResume = getResumeToTailor();
                  const tailoredResume = tailoredResultResume;

                  if (!originalResume || !tailoredResume) return null;

                  const tailoredEval = calculateRealisticAtsScore(
                    tailoredResume,
                    tailorAnalysisResult?.simplifiedJdObject || { companyPitch: "", requiredSkills: [], keyResponsibilities: [], candidateExpectations: [], keywordsToTarget: [] }
                  );

                  return (
                    <div className="space-y-4 text-left py-2 animate-fadeIn font-sans">
                      {/* Info Banner */}
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3 justify-between">
                        <div className="flex gap-3">
                          <div className="w-4 h-4 mt-0.5 shrink-0 text-blue-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                          </div>
                          <div className="text-xs text-blue-800 font-semibold leading-relaxed">
                            Your tailored resume has been generated. Use the controls below to toggle visual AI changes or download your file.
                          </div>
                        </div>
                        
                        {/* Highlights Toggle */}
                        <div className="flex items-center gap-2 bg-white border border-blue-300 px-3 py-1 rounded-lg shrink-0">
                          <input
                            type="checkbox"
                            id="toggle-highlights-cb"
                            checked={showHighlights}
                            onChange={(e) => setShowHighlights(e.target.checked)}
                            className="w-3.5 h-3.5 cursor-pointer accent-blue-600"
                          />
                          <label htmlFor="toggle-highlights-cb" className="text-[10px] font-black uppercase text-blue-900 cursor-pointer select-none">
                            View AI Changes
                          </label>
                        </div>
                      </div>

                      {/* Header controls & Score */}
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        {/* Highlight Legend */}
                        <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wide">
                          {showHighlights && (
                            <>
                              <span className="text-neutral-500 font-mono">Legend:</span>
                              <span className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 text-blue-900 px-2 py-0.5 rounded-lg">
                                <span className="w-2 h-2 rounded-sm bg-[#BAE6FD] border border-blue-300 inline-block"></span> Added
                              </span>
                              <span className="flex items-center gap-1.5 bg-yellow-100 border border-yellow-200 text-yellow-900 px-2 py-0.5 rounded-lg">
                                <span className="w-2 h-2 rounded-sm bg-[#FEF08A] border border-yellow-300 inline-block"></span> Improved
                              </span>
                            </>
                          )}
                        </div>
                        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl px-3 py-1 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(16,185,129,1)]">
                          <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider">ATS Score</span>
                          <span className="text-sm font-black text-emerald-600">{tailoredEval.score}%</span>
                        </div>
                      </div>

                      {/* Single Panel Tailored Resume */}
                      <div className="border-2 border-neutral-300 rounded-2xl overflow-hidden bg-white shadow-md max-w-2xl mx-auto w-full">
                        <div className="bg-neutral-800 text-white px-4 py-2 text-xs font-black uppercase tracking-wider font-mono flex items-center justify-between">
                          <span>Tailored Resume (Optimized for {tailorCompany})</span>
                        </div>
                        <div className="overflow-y-auto bg-neutral-50" style={{height: '60vh'}}>
                          <ResumePreview
                            resume={originalResume}
                            tailored={tailoredResult || undefined}
                            templateStyle={selectedStyle}
                            id="step-3-preview-tailored"
                            showHighlights={showHighlights}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

            </div>


            {/* Modal Footer */}
            {!tailorIsAnalyzing && !tailorAnalysisError && (
              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-neutral-100 mt-4 justify-end font-sans">
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
                    <button
                      type="button"
                      onClick={() => setTailorWizardStep(1)}
                      className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeAndGenerate}
                      className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                    >
                      Tailor Resume
                    </button>
                  </>
                )}

                {tailorWizardStep === 3 && (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-semibold mr-auto">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-emerald-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      Original resume unchanged
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (tailoredResultResume) {
                          handlePrintOrSavePDF(tailoredResultResume, undefined, tailorRole);
                        }
                      }}
                      className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (tailoredResultResume) {
                          downloadResumeAsDocx(
                            tailoredResultResume,
                            `${tailorCompany.replace(/\s+/g, "_")}_Tailored_Resume`,
                            getResumeToTailor(),
                            tailorRole
                          );
                        }
                      }}
                      className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4 text-emerald-600" />
                      <span>Download DOCX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTailorWizardOpen(false);
                        setCurrentStep("dashboard");
                      }}
                      className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-extrabold text-[11px] tracking-wide uppercase rounded-xl border-2 border-black transition cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0"
                    >
                      Back to Dashboard
                    </button>
                  </>
                )}
              </div>
            )}

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
            className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 sm:p-8 w-full max-w-5xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
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

            {/* Body: Two columns layout */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-y-auto mb-6 pr-1">
              {/* Left Column: Metrics & Gaps & Diff Log */}
              <div className="w-full md:w-5/12 flex flex-col gap-4 font-sans text-left max-h-[600px] overflow-y-auto pr-1">
                
                {/* Score Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border-2 border-black p-4 rounded-2xl text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    <span className="text-[10px] uppercase font-black tracking-wider text-neutral-500 font-mono">ATS SCORE</span>
                    <div className="text-3xl font-black text-blue-600 mt-1">
                      {selectedSavedVersion.atsScore ?? 75}/100
                    </div>
                  </div>
                  <div className="bg-white border-2 border-black p-4 rounded-2xl text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    <span className="text-[10px] uppercase font-black tracking-wider text-neutral-500 font-mono">JD MATCH</span>
                    <div className="text-3xl font-black text-emerald-600 mt-1">
                      {selectedSavedVersion.matchPercentage ?? 70}%
                    </div>
                  </div>
                </div>

                {/* Gaps/Missing Skills */}
                <div className="bg-rose-50/20 border-2 border-black p-4 rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span className="text-[11px] font-black uppercase text-rose-800 font-mono tracking-wider">Remaining Gaps</span>
                  </div>
                  {selectedSavedVersion.missingRequirements && selectedSavedVersion.missingRequirements.filter(r => !r.includes("No missing")).length > 0 ? (
                    <ul className="list-disc pl-4 text-xs font-bold text-neutral-700 space-y-1.5">
                      {selectedSavedVersion.missingRequirements.filter(r => !r.includes("No missing")).slice(0, 5).map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-555 font-bold">No remaining critical gaps!</p>
                  )}
                </div>

                {/* Missing Qualifications */}
                <div className="bg-indigo-50/20 border-2 border-black p-4 rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span className="text-[11px] font-black uppercase text-indigo-800 font-mono tracking-wider">Missing Qualifications</span>
                  </div>
                  {selectedSavedVersion.missingQualifications && selectedSavedVersion.missingQualifications.filter(q => !q.includes("No critical")).length > 0 ? (
                    <ul className="list-disc pl-4 text-xs font-bold text-neutral-700 space-y-1.5">
                      {selectedSavedVersion.missingQualifications.filter(q => !q.includes("No critical")).slice(0, 5).map((qual, idx) => (
                        <li key={idx}>{qual}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-555 font-bold">All qualifications satisfied!</p>
                  )}
                </div>

                {/* Applied Improvements */}
                <div className="bg-blue-50/20 border-2 border-black p-4 rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] font-sans">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-[11px] font-black uppercase text-blue-800 font-mono tracking-wider">Improvements Made</span>
                  </div>
                  {selectedSavedVersion.improvements && selectedSavedVersion.improvements.length > 0 ? (
                    <ul className="list-disc pl-4 text-xs font-bold text-neutral-700 space-y-1.5">
                      {selectedSavedVersion.improvements.map((imp, idx) => (
                        <li key={idx}>{imp}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-neutral-550 font-bold">Aligned professional summary and keyword matching.</p>
                  )}
                </div>

                {/* Visual Resume Diff Log */}
                <div className="border-2 border-black rounded-2xl p-4 bg-neutral-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-black pb-2 gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-black font-mono">Resume Diff Log</span>
                    <div className="flex border border-black rounded-lg overflow-hidden text-[9px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDiffTab("added")}
                        className={`px-2 py-0.5 border-r border-black transition ${diffTab === "added" ? "bg-emerald-500 text-white font-extrabold" : "bg-white text-black hover:bg-neutral-100"}`}
                      >
                        Added ({selectedSavedVersion.diffAdded?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffTab("modified")}
                        className={`px-2 py-0.5 border-r border-black transition ${diffTab === "modified" ? "bg-amber-500 text-white font-extrabold" : "bg-white text-black hover:bg-neutral-100"}`}
                      >
                        Mod ({selectedSavedVersion.diffModified?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffTab("unchanged")}
                        className={`px-2 py-0.5 transition ${diffTab === "unchanged" ? "bg-neutral-500 text-white font-extrabold" : "bg-white text-black hover:bg-neutral-100"}`}
                      >
                        Unch ({selectedSavedVersion.diffUnchanged?.length || 0})
                      </button>
                    </div>
                  </div>

                  <div className="max-h-32 overflow-y-auto pr-1 text-[11px] space-y-1.5 font-semibold font-mono">
                    {diffTab === "added" && (
                      (selectedSavedVersion.diffAdded || []).length > 0 ? (
                        (selectedSavedVersion.diffAdded || []).map((item, i) => (
                          <div key={i} className="text-emerald-700 bg-emerald-50/50 border border-emerald-200 p-1.5 rounded-lg flex items-start gap-1 leading-relaxed animate-fadeIn">
                            <span className="font-black text-xs text-emerald-600 flex-shrink-0">+</span>
                            <span>{item}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-500 italic p-1">No items added.</p>
                      )
                    )}

                    {diffTab === "modified" && (
                      (selectedSavedVersion.diffModified || []).length > 0 ? (
                        (selectedSavedVersion.diffModified || []).map((item, i) => (
                          <div key={i} className="text-amber-700 bg-amber-50/50 border border-amber-200 p-1.5 rounded-lg flex items-start gap-1 leading-relaxed animate-fadeIn">
                            <span className="font-black text-xs text-amber-600 flex-shrink-0">~</span>
                            <span>{item}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-500 italic p-1">No modifications logged.</p>
                      )
                    )}

                    {diffTab === "unchanged" && (
                      (selectedSavedVersion.diffUnchanged || []).length > 0 ? (
                        (selectedSavedVersion.diffUnchanged || []).map((item, i) => (
                          <div key={i} className="text-neutral-600 bg-white border border-neutral-200 p-1.5 rounded-lg flex items-start gap-1 leading-relaxed animate-fadeIn">
                            <span className="font-black text-neutral-400 flex-shrink-0">=</span>
                            <span>{item}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-neutral-500 italic p-1">No unchanged items logged.</p>
                      )
                    )}
                  </div>
                </div>

                <div className="border-2 border-black rounded-2xl p-4 bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-2">
                  <div className="flex items-center gap-1.5 border-b-2 border-black pb-2">
                    <FileText className="w-4 h-4 text-neutral-800" />
                    <span className="text-[11px] font-black uppercase text-black font-mono tracking-wider">Original Job Description</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed font-semibold text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                    {selectedSavedVersion.originalJobDescription || "Original job description was not stored for this older tailored resume."}
                  </div>
                </div>
              </div>

              {/* Right Column: Resume Preview */}
              <div className="w-full md:w-7/12 flex flex-col border-2 border-black rounded-2xl overflow-hidden bg-neutral-100 max-h-[500px] md:max-h-none">
                <div className="bg-neutral-800 text-white px-4 py-2 text-xs font-black uppercase tracking-wider font-mono border-b-2 border-black flex justify-between items-center">
                  <span>Resume Preview</span>
                  <span className="text-[10px] text-neutral-400">Pure print output preview</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-neutral-50 scrollbar-thin">
                  <ResumePreview resume={selectedSavedVersion.resumeData} templateStyle="two-column" originalResume={selectedSavedVersion.originalResumeData || undefined} />
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end border-t border-neutral-200 mt-2 font-sans">
              <button
                type="button"
                onClick={() => {
                  handlePrintOrSavePDF(selectedSavedVersion.resumeData, selectedSavedVersion.originalResumeData, selectedSavedVersion.jobTitle);
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadResumeAsDocx(
                    selectedSavedVersion.resumeData,
                    `${selectedSavedVersion.companyName.replace(/\s+/g, "_")}_Tailored_Resume`,
                    selectedSavedVersion.originalResumeData,
                    selectedSavedVersion.jobTitle
                  );
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Download DOCX</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDownloadSpecificResume(selectedSavedVersion);
                }}
                className="px-5 py-3 bg-white hover:bg-neutral-50 text-black font-extrabold text-[11px] tracking-wide uppercase rounded-xl transition cursor-pointer border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-neutral-600" />
                <span>Download TXT</span>
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
                    const session = getStoredSupabaseSession();
                    if (session?.accessToken && currentUser && !currentUser.isGuest) {
                      supabaseData.deleteTailoredResume(session.accessToken, versionToDeleteId)
                        .catch((error) => console.warn("Supabase tailored resume delete failed:", error));
                    }
                    setSavedVersions(prev => {
                      const updated = prev.filter(v => v.id !== versionToDeleteId);
                      localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(updated));
                      return updated;
                    });
                    if (selectedSavedVersion?.id === versionToDeleteId) {
                      setSelectedSavedVersion(null);
                      setShowSavedVersionPreviewModal(false);
                    }
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
