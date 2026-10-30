/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SAMPLE_RESUME, SAMPLE_JOB_POST } from "./utils/sampleResume";
import { educationNewestFirst, educationGoesFirst } from "./utils/educationOrder";
import { checkResume } from "./utils/resumeChecks";
import CodeBoxes from "./components/CodeBoxes";
import PrivacyNotice from "./components/PrivacyNotice";
import FeedbackBox from "./components/FeedbackBox";
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
import { detectRoleMismatch, type RoleCheck } from "./utils/roleFamily";
import { cleanSkillName } from "./utils/skillNames";
import { buildResumePdf } from "./utils/resumePdf";
import { RESUME_COLORS, DEFAULT_RESUME_COLOR, resumeColorHex, type ResumeColor } from "./utils/resumeColors";
import { DEMO_RESUMES, DEMO_JDS } from "./demoData";
import ResumePreview from "./components/ResumePreview";
import { supabaseAuth, supabaseData, type SupabaseSession } from "./lib/supabase";
import { resultEndingsFor, addResultToLine } from "./utils/resultEndings";
import { backedBy } from "./utils/sameSkill";
import { yearsOfExperience, yearsInJob } from "./utils/experienceYears";
import SideBySideReview, { changedLines } from "./components/SideBySideReview";
import ResumeReview from "./components/ResumeReview";
import { validateJobDescriptionText as checkJobDescriptionText, JD_MIN_WORDS, JD_MAX_WORDS } from "./utils/jdValidation";

const SUPABASE_SESSION_STORAGE_KEY = "jd_resume_customizer_supabase_session";
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
// Written when someone deletes their data, so other open tabs reload
const DATA_DELETED_SIGNAL_KEY = "jd_resume_customizer_data_deleted_at";

// Reads the email out of a sign-in token (used on the reset-link screen)
function emailFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).email || null;
  } catch {
    return null;
  }
}

// Adds a career switcher's courses/certificates and side projects (one per line) to a copy of the resume.
// A project line can be "Name - what I built"; links are kept as typed.
function addSwitchExtras(resume: ResumeStructure, certsText: string, projectsText: string): ResumeStructure {
  const lines = (text: string) => text.split("\n").map(l => l.replace(/^[\s•*-]+/, "").trim()).filter(Boolean);
  const certs = lines(certsText);
  const projects = lines(projectsText).map((line, i) => {
    const [name, ...rest] = line.split(/\s+[-–—:]\s+/);
    const detail = rest.join(" - ").trim();
    return { id: `switch-project-${i}`, name: name.trim(), description: detail ? [detail] : [] };
  });
  if (!certs.length && !projects.length) return resume;
  const haveCert = new Set((resume.certifications || []).map(c => c.toLowerCase()));
  const haveProject = new Set((resume.projects || []).map(p => (p.name || "").toLowerCase()));
  return {
    ...resume,
    certifications: [...(resume.certifications || []), ...certs.filter(c => !haveCert.has(c.toLowerCase()))],
    projects: [...(resume.projects || []), ...projects.filter(p => !haveProject.has(p.name.toLowerCase()))]
  };
}

// Rough word stem so "roadmaps"/"roadmap" and "running"/"run" compare equal
function stem(word: string): string {
  return word.toLowerCase().replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "");
}

// "in 5 hours" / "in under an hour" / "tomorrow" for the daily AI limit reset
function resetsInText(resetsAt?: string | null): string {
  const ms = resetsAt ? new Date(resetsAt).getTime() - Date.now() : NaN;
  if (!Number.isFinite(ms)) return "tomorrow";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// Set when a guest leaves to sign in, so their resumes are merged into the account.
// Must match Supabase: Authentication > Sign In / Providers > Email > Email OTP Length
const SIGNUP_CODE_LENGTH = 6;
const GUEST_HANDOFF_KEY = "jd_resume_customizer_guest_handoff";

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
  // Sign-up waiting for the code from the confirmation email
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  // Create Account: after the code is confirmed, the session waits here while they pick a password
  const [signupSession, setSignupSession] = useState<SupabaseSession | null>(null);
  // Password reset by code: the email the code went to, and the code typed
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  // Reset: after the code is confirmed, the session waits here while they pick a new password
  const [resetSession, setResetSession] = useState<SupabaseSession | null>(null);
  // What's happening while we sign them in (shown under the button)
  const [authProgress, setAuthProgress] = useState<string | null>(null);
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
  // View popup of a saved version: before/after or the full resume
  const [versionView, setVersionView] = useState<"compare" | "full">("full");

  const [isTailoring, setIsTailoring] = useState(false);
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([]);
  const [originalResumeBackup, setOriginalResumeBackup] = useState<ResumeStructure | null>(null);

  const [isAuditingATS, setIsAuditingATS] = useState(false);
  const [atsResult, setAtsResult] = useState<ATSCheckResult | null>(null);

  // UI Customizations
  const [selectedStyle, setSelectedStyle] = useState<"classic" | "tech" | "executive" | "two-column">("classic"); // matches the one-column download
  // Download colour: classic black, or one accent colour on the name, headings and lines (remembered on this device)
  const [resumeColor, setResumeColorState] = useState<ResumeColor>(() => {
    try {
      const saved = localStorage.getItem("jd_resume_customizer_resume_color") as ResumeColor | null;
      return saved && RESUME_COLORS.some(c => c.id === saved) ? saved : DEFAULT_RESUME_COLOR;
    } catch { return DEFAULT_RESUME_COLOR; }
  });
  const setResumeColor = (color: ResumeColor) => {
    setResumeColorState(color);
    try { localStorage.setItem("jd_resume_customizer_resume_color", color); } catch { /* private window */ }
  };
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

  // Second tailored resume for the same company → "Swiggy (2)", "Swiggy (3)"
  const generateUniqueCompanyName = (company: string): string => {
    const base = (company || "Untitled").trim().replace(/\s*\(\d+\)$/, "");
    const taken = new Set(savedVersions.map(v => (v.companyName || "").trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base} (${n})`.toLowerCase())) n++;
    return `${base} (${n})`;
  };

  // Same name twice (same person, or two people with one name) → "Name", "Name (2)", "Name (3)"
  const generateUniqueResumeName = (fullName: string): string => {
    const baseName = (fullName || "Candidate").trim().replace(/\s*\(\d+\)$/, "");
    const taken = new Set(savedUserResumes.map(r => (r.name || "").trim().toLowerCase()));
    if (!taken.has(baseName.toLowerCase())) return baseName;
    let n = 2;
    while (taken.has(`${baseName} (${n})`.toLowerCase())) n++;
    return `${baseName} (${n})`;
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
    if (isLikelyResumeHolderName(holderName)) {
      // Keep the "(2)" suffix when two resumes share a name
      const numbered = resume.name?.trim().match(/\s\((\d+)\)$/);
      return numbered ? `${holderName} (${numbered[1]})` : holderName;
    }

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
  const [tailorWizardStep, setTailorWizardStep] = useState<1 | 2 | 3 | 4>(1);
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
  // Inline validation message shown inside the wizard (toasts disappear before people read them)
  const [tailorStepError, setTailorStepError] = useState<string | null>(null);
  // Skill checkbox step: JD analysis, the skills it lists, and which ones the candidate ticked
  const [tailorJdAnalysis, setTailorJdAnalysis] = useState<SimplifiedJD | null>(null);
  const [tailorSkillOptions, setTailorSkillOptions] = useState<{ name: string; inResume: boolean }[]>([]);
  const [tailorSelectedSkills, setTailorSelectedSkills] = useState<string[]>([]);
  const [tailorCustomSkill, setTailorCustomSkill] = useState("");
  // Per-line review of AI edits: nothing the AI rewrote goes into the resume until the user accepts or edits it
  type EditReview = {
    id: string;
    label: string;
    original: string;
    suggested: string;
    text: string;
    status: "pending" | "accepted" | "edited" | "skipped";
    mentions: string[];
    warnings: string[]; // things this edit claims that the original resume never said
    target: { kind: "summary" } | { kind: "exp" | "proj"; item: number; bullet: number };
    resultOnly?: boolean; // the AI left this line alone; shown only so the user can add a result
    note?: string; // shown in the orange box instead of a warning (suggested summary)
  };
  const [tailorReviews, setTailorReviews] = useState<EditReview[]>([]);
  // Job-switcher check: set when the resume's recent role and the job are in different fields
  const [tailorRoleCheck, setTailorRoleCheck] = useState<RoleCheck | null>(null);
  const [tailorIsSwitching, setTailorIsSwitching] = useState<boolean | null>(null);
  // Career switchers can list courses/certificates and side projects for the new field (one per line).
  const [tailorSwitchCerts, setTailorSwitchCerts] = useState("");
  const [tailorSwitchProjects, setTailorSwitchProjects] = useState("");
  // Privacy notice and "delete my account" dialog
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  // Feedback: the sidebar box, and whether this browser already answered "How was it?" after a download
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackAsked, setFeedbackAsked] = useState(() => {
    try { return localStorage.getItem("jd_resume_customizer_feedback_asked") === "1"; } catch { return false; }
  });
  // Feedback asked once on the review screen (for people who never download); thanks stays visible there
  const [reviewFeedbackSent, setReviewFeedbackSent] = useState(false);
  const markFeedbackAsked = () => {
    setFeedbackAsked(true);
    try { localStorage.setItem("jd_resume_customizer_feedback_asked", "1"); } catch { /* private window */ }
  };
  // "Close without saving?" check for the tailor wizard
  const [showCloseDraftConfirm, setShowCloseDraftConfirm] = useState(false);
  // Daily AI limit for the signed-in person (from /api/ai-credits and the tailoring response)
  const [aiCredits, setAiCredits] = useState<{ aiEnabled: boolean; status?: string; used?: number; limit?: number; remaining?: number; resetsAt?: string | null } | null>(null);
  const refreshAiCredits = async () => {
    try {
      const r = await fetch("/api/ai-credits", { headers: await aiAuthHeaders() });
      if (r.ok) setAiCredits(await r.json());
    } catch {
      // the note is optional; tailoring still works
    }
  };
  // Set after a download from the tailoring wizard, to show the "downloaded" popup.
  const [tailorDownloaded, setTailorDownloaded] = useState<{ format: "pdf" | "docx"; fileName: string } | null>(null);
  const [tailorReviewBase, setTailorReviewBase] = useState<{ original: ResumeStructure; skills: string[] } | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  // "Add a result" on a review card: which card and ending was tapped, and the number typed
  const [resultPick, setResultPick] = useState<{ id: string; ending: string } | null>(null);
  const [resultValue, setResultValue] = useState("");
  const [resultError, setResultError] = useState<string | null>(null);
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
  // Every skill the tailored resume could show, job-matched first; the resume keeps the best 10 of these
  const [tailorSkillPool, setTailorSkillPool] = useState<string[]>([]);
  const [showMoreSkills, setShowMoreSkills] = useState(false);
  const [extraSkillInput, setExtraSkillInput] = useState("");
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
        setAuthMessage({ type: "error", message: "This link is invalid or has expired. If you were confirming your email, just sign in; if you were resetting your password, request a new link below." });
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // Back from the "confirm your email" link: say so, and let them sign in
      if ((type === "signup" || type === "email" || type === "invite") && accessToken) {
        setCurrentStep("auth");
        setIsSignUp(false);
        setIsForgotPassword(false);
        setIsResetPassword(false);
        setAuthMessage({ type: "success", message: "Your email is confirmed. Sign in to continue." });
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
  // After sign-in, sign-up or a confirmed code: save the session, load their data, open the app
  const finishSignIn = async (session: SupabaseSession, isNew: boolean) => {
    const name = session.user.email.split("@")[0];
    const userObj = { email: session.user.email, name };
    localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
    setAuthProgress(isNew ? "Setting up your account..." : "Signing you in...");
    await supabaseData.upsertUser(session.accessToken, { id: session.user.id, email: session.user.email });
    await supabaseData.upsertProfile(session.accessToken, { id: session.user.id, full_name: name });
    setAuthProgress("Loading your resumes...");
    await loadPersistedSupabaseData(session);
    setAuthProgress(null);
    setCurrentUser(userObj);
    // Always land on Resume Setup first after login
    setCurrentStep("resume");
    setAuthMessage(null);
    setVerifyEmail(null);
    setVerifyCode("");
    showNotification(isNew ? "Account created successfully." : `Welcome, ${name}! Your resume dashboard is ready.`, "success");
    trackEvent(isNew ? "signed_up" : "signed_in");
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyEmail) return;
    if (!new RegExp(`^\\d{${SIGNUP_CODE_LENGTH}}$`).test(verifyCode.trim())) {
      setAuthMessage({ type: "error", message: `Type the ${SIGNUP_CODE_LENGTH}-digit code from the email.` });
      return;
    }
    setIsVerifying(true);
    setAuthProgress("Checking your code...");
    try {
      const session = await supabaseAuth.verifySignupCode(verifyEmail, verifyCode);
      if (isSignUp) {
        // Email is confirmed; next they choose a password
        setSignupSession(session);
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage(null);
      } else {
        await finishSignIn(session, false);
      }
    } catch (error: any) {
      setAuthMessage({ type: "error", message: error.message || "Couldn't check the code. Please try again." });
    } finally {
      setIsVerifying(false);
      setAuthProgress(null);
    }
  };

  const handleResendCode = async () => {
    if (!verifyEmail) return;
    try {
      if (isSignUp) await supabaseAuth.sendEmailCode(verifyEmail);
      else await supabaseAuth.resendSignupCode(verifyEmail);
      setAuthMessage({ type: "success", message: `New code sent to ${verifyEmail}. Check your inbox and spam folder.` });
    } catch (error: any) {
      setAuthMessage({ type: "error", message: error.message || "Couldn't send a new code." });
    }
  };

  const handleResendResetCode = async () => {
    if (!resetEmail || resetCooldownSeconds > 0) return;
    try {
      await supabaseAuth.sendPasswordReset(resetEmail, `${window.location.origin}${window.location.pathname}`);
      setResetCooldownSeconds(PASSWORD_RESET_COOLDOWN_SECONDS);
      setAuthMessage({ type: "success", message: `New code sent to ${resetEmail}. Use the newest email.` });
    } catch (error: any) {
      setAuthMessage({ type: "error", message: error.message || "Couldn't send a new code." });
    }
  };

  // Create Account step 3: save the password, then open the app
  const handleSetSignupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupSession || isAuthSubmitting) return;
    if (authPassword.length < PASSWORD_MIN_LENGTH) {
      setAuthMessage({ type: "error", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthMessage({ type: "error", message: "Passwords do not match." });
      return;
    }
    setIsAuthSubmitting(true);
    setAuthProgress("Saving your password...");
    try {
      await supabaseAuth.updatePassword(signupSession.accessToken, authPassword);
      setSignupSession(null);
      setAuthPassword("");
      setAuthConfirmPassword("");
      await finishSignIn(signupSession, true);
    } catch (error: any) {
      setAuthMessage({ type: "error", message: error.message || "Couldn't save the password. Please try again." });
    } finally {
      setIsAuthSubmitting(false);
      setAuthProgress(null);
    }
  };

  // The Sign in / Create account / Forgot password switch: start that flow fresh
  const switchAuthTab = (tab: "signin" | "signup" | "forgot") => {
    setVerifyEmail(null);
    setVerifyCode("");
    setSignupSession(null);
    setResetEmail(null);
    setResetCode("");
    setResetSession(null);
    setIsResetPassword(false);
    setResetAccessToken(null);
    setIsSignUp(tab === "signup");
    setIsForgotPassword(tab === "forgot");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAuthMessage(null);
  };

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
    if (isSignUp) {
      // Create Account step 1: email a code first; the password comes after the code
      setIsAuthSubmitting(true);
      setAuthProgress("Sending your code...");
      try {
        await supabaseAuth.sendEmailCode(email);
        setVerifyEmail(email);
        setVerifyCode("");
        setSignupSession(null);
        setAuthMessage(null);
      } catch (error: any) {
        setAuthMessage({ type: "error", message: error.message || "Couldn't send the code. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
        setAuthProgress(null);
      }
      return;
    }
    if (isForgotPassword && resetEmail && !resetSession) {
      // Reset step 2: check the code first; the password boxes appear only after it's right
      if (!new RegExp(`^\\d{${SIGNUP_CODE_LENGTH}}$`).test(resetCode.trim())) {
        setAuthMessage({ type: "error", message: `Type the ${SIGNUP_CODE_LENGTH}-digit code from the email.` });
        return;
      }
      setIsAuthSubmitting(true);
      setAuthProgress("Checking your code...");
      try {
        const session = await supabaseAuth.verifyRecoveryCode(resetEmail, resetCode);
        setResetSession(session);
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage(null);
      } catch (error: any) {
        setAuthMessage({ type: "error", message: error.message || "Couldn't check the code. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
        setAuthProgress(null);
      }
      return;
    }
    if (isForgotPassword && resetSession) {
      // Reset step 3: save the new password, then they're signed in
      if (authPassword.length < PASSWORD_MIN_LENGTH) {
        setAuthMessage({ type: "error", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setAuthMessage({ type: "error", message: "Passwords do not match." });
        return;
      }
      setIsAuthSubmitting(true);
      setAuthProgress("Saving your new password...");
      try {
        await supabaseAuth.updatePassword(resetSession.accessToken, authPassword);
        const session = resetSession;
        setIsForgotPassword(false);
        setResetEmail(null);
        setResetCode("");
        setResetSession(null);
        setAuthPassword("");
        setAuthConfirmPassword("");
        await finishSignIn(session, false);
        showNotification("Password updated. You're signed in.", "success");
      } catch (error: any) {
        setAuthMessage({ type: "error", message: error.message || "Could not update password. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
        setAuthProgress(null);
      }
      return;
    }
    if (isForgotPassword) {
      if (resetCooldownSeconds > 0) {
        setAuthMessage({ type: "info", message: `You can request another reset email in ${resetCooldownSeconds} seconds.` });
        return;
      }
      setIsAuthSubmitting(true);
      setAuthProgress("Sending your code...");
      try {
        const resetUrl = `${window.location.origin}${window.location.pathname}`;
        const diagnostic = await supabaseAuth.sendPasswordReset(email, resetUrl);
        console.info("Password reset request accepted by Supabase", {
          email,
          status: diagnostic.status,
          requestId: diagnostic.requestId,
        });
        setResetCooldownSeconds(PASSWORD_RESET_COOLDOWN_SECONDS);
        setResetEmail(email);
        setResetCode("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage(null); // the code screen already says where the code went
      } catch (error: any) {
        console.error("Password reset request failed", {
          email,
          message: error.message,
        });
        setAuthMessage({ type: "error", message: error.message || "Could not send the reset code. Please try again." });
      } finally {
        setIsAuthSubmitting(false);
        setAuthProgress(null);
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
    setAuthProgress(isSignUp ? "Creating your account..." : "Checking your details...");
    try {
      const session = isSignUp
        ? await supabaseAuth.signUp(email, authPassword)
        : await supabaseAuth.signIn(email, authPassword);
      await finishSignIn(session, isSignUp);
    } catch (error: any) {
      if (String(error.message || "").startsWith("Account created.")) {
        // Email confirmation is on: ask for the code from the email
        setVerifyEmail(email);
        setVerifyCode("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthMessage(null); // the code screen already says where the code went
        return;
      }
      if (/verify your email/i.test(String(error.message || ""))) {
        // Signed up earlier but never typed the code: send a fresh one and show the code screen
        setVerifyEmail(email);
        setVerifyCode("");
        setAuthPassword("");
        try {
          await supabaseAuth.resendSignupCode(email);
          setAuthMessage({ type: "info", message: "Your email isn't confirmed yet. We sent you a new code." });
        } catch (resendError: any) {
          setAuthMessage({ type: "info", message: `Your email isn't confirmed yet. Type the code from your latest email. (${resendError.message})` });
        }
        return;
      }
      setAuthMessage({ type: "error", message: error.message || "Authentication failed. Please try again." });
      showNotification(error.message || "Authentication failed. Please try again.", "error");
    } finally {
      setIsAuthSubmitting(false);
      setAuthProgress(null);
    }
  };

  // Sign out. Guests leaving to create an account keep their work; after deleting an account everything is wiped.
  const handleSignOut = async (afterDelete = false) => {
    // Guests leave to create an account; their resumes stay on this device and move to the new account.
    const keepGuestWork = !!currentUser?.isGuest && !afterDelete;
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
    if (!keepGuestWork) {
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
    }

    // Reset all states
    setCurrentUser(null);
    setCurrentStep("auth");
    if (!keepGuestWork) {
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
    }
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthMessage(null);
    setNotifications([]);
    setShowPassword(false);
    setShowConfirmPassword(false);

    if (keepGuestWork) {
      localStorage.setItem(GUEST_HANDOFF_KEY, "1");
      setIsSignUp(true);
      showNotification("Create an account to keep your resumes.", "info");
    } else {
      showNotification(afterDelete ? "Your account and all your data were deleted." : "Logged out securely.", "info");
    }
  };

  // Delete the account and all data in Supabase, then sign out
  const handleDeleteMyAccount = async () => {
    const session = getStoredSupabaseSession();
    if (!session?.accessToken) {
      await handleSignOut(true);
      return;
    }
    setIsDeletingAccount(true);
    try {
      const headers = await aiAuthHeaders(); // refreshes an expired sign-in first
      const token = (headers.Authorization || "").replace(/^Bearer\s+/, "") || session.accessToken;
      await supabaseData.deleteMyAccount(token);
      setShowPrivacy(false);
      await handleSignOut(true);
    } catch (error: any) {
      showNotification(error.message || "Could not delete your account. Please try again.", "error");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Delete resumes, versions and job posts but keep the account signed in
  const handleDeleteMyData = async () => {
    const session = getStoredSupabaseSession();
    setIsDeletingAccount(true);
    try {
      if (session?.accessToken && session.user?.id) {
        const headers = await aiAuthHeaders(); // refreshes an expired sign-in first
        const token = (headers.Authorization || "").replace(/^Bearer\s+/, "") || session.accessToken;
        await supabaseData.deleteMyData(token, session.user.id);
      }
      [
        "jd_resume_customizer_active_resume",
        "jd_resume_customizer_original_resume",
        "jd_resume_customizer_saved_resumes",
        "jd_resume_customizer_versions",
        "jd_resume_customizer_jd",
        "jd_resume_customizer_active_resume_id",
        "jd_resume_customizer_has_resume",
      ].forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem("auralis_platform_unlocked");
      // Tells other open tabs to reload, so they can't save the deleted resumes back
      localStorage.setItem(DATA_DELETED_SIGNAL_KEY, String(Date.now()));
      setIsUnlocked(false);
      setActiveResume(DEMO_RESUMES.software_grad.data);
      setOriginalResume(DEMO_RESUMES.software_grad.data);
      setSavedUserResumes([]);
      setSavedVersions([]);
      setActiveResumeId(null);
      setJdText(DEMO_JDS.frontend_eng.text);
      setTargetCompany("Vercel Systems");
      setTargetRole("Junior Frontend Engineer");
      setShowPrivacy(false);
      setCurrentStep("resume");
      showNotification("Your resumes and versions were deleted. Your account is still here.", "info");
    } catch (error: any) {
      showNotification(error.message || "Could not delete your data. Please try again.", "error");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Save feedback to Supabase (jd_feedback)
  const handleSendFeedback = async (rating: "up" | "down" | null, comment: string, place: string) => {
    const headers = await aiAuthHeaders(); // refreshes an expired sign-in first
    const token = (headers.Authorization || "").replace(/^Bearer\s+/, "") || getStoredSupabaseSession()?.accessToken;
    if (!token) throw new Error("Please sign in or continue as a guest to send feedback.");
    await supabaseData.sendFeedback(token, { rating, comment, place });
    markFeedbackAsked();
    trackEvent("feedback", { rating: rating || "none", place });
  };

  // Keep the sign-in fresh (it lasts about an hour): on start, every 4 minutes, and when the tab is back in focus.
  // Saves read the stored sign-in, so without this they would quietly fail after an hour.
  useEffect(() => {
    if (!currentUser) return;
    aiAuthHeaders();
    const timer = window.setInterval(() => { aiAuthHeaders(); }, 4 * 60_000);
    const onFocus = () => { aiAuthHeaders(); };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [currentUser]);

  // Another tab deleted the data or signed out: reload so this tab shows the same thing
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DATA_DELETED_SIGNAL_KEY) window.location.reload();
      if (e.key === SUPABASE_SESSION_STORAGE_KEY && e.newValue === null && currentUser) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentUser]);

  // Usage tracking: upload → tailor → download, plus errors. Stored in Supabase (jd_events).
  const trackEvent = (name: string, props: Record<string, unknown> = {}) => {
    const session = getStoredSupabaseSession();
    if (!session?.accessToken) return;
    supabaseData.logEvent(session.accessToken, name, props).catch(() => {});
  };

  // Error logging: send unexpected browser errors to jd_events (at most 5 per visit) so problems on the live site get noticed
  useEffect(() => {
    let sent = 0;
    const report = (message: string, where: string) => {
      if (sent >= 5) return;
      sent++;
      trackEvent("error", { message: String(message || "").slice(0, 300), where, page: currentStep });
    };
    const onError = (e: ErrorEvent) => report(e.message, `${e.filename || ""}:${e.lineno || ""}`);
    const onRejection = (e: PromiseRejectionEvent) => report(e.reason?.message || String(e.reason), "promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [currentStep]);

  // Tells the server who's signed in, for the daily AI limit. Refreshes a sign-in that's about to expire.
  const endExpiredSignIn = () => {
    localStorage.removeItem(SUPABASE_SESSION_STORAGE_KEY);
    localStorage.removeItem("jd_resume_customizer_user");
    sessionStorage.removeItem("jd_resume_customizer_guest_user");
    setCurrentUser(null);
    setCurrentStep("auth");
    setIsSignUp(false);
    setIsForgotPassword(false);
    setAuthMessage({ type: "info", message: "Your sign-in has ended. Please sign in again." });
  };

  const aiAuthHeaders = async (): Promise<Record<string, string>> => {
    const raw = localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
    if (!raw) return {};
    try {
      let session = JSON.parse(raw);
      const expiringSoon = !session.expiresAt || session.expiresAt - Date.now() < 5 * 60_000;
      if (expiringSoon && session.refreshToken) {
        try {
          session = await supabaseAuth.refreshSession(session.refreshToken);
          localStorage.setItem(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
        } catch (error: any) {
          console.warn("Sign-in refresh failed:", error);
          // The sign-in was ended elsewhere (signed out, password changed): ask them to sign in again
          // instead of staying "signed in" while every save fails
          if (/refresh token|invalid grant|session.*not found/i.test(String(error?.message || ""))) {
            endExpiredSignIn();
            return {};
          }
        }
      }
      return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
    } catch {
      return {};
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
    const guestHandoff = localStorage.getItem(GUEST_HANDOFF_KEY) === "1";
    localStorage.removeItem(GUEST_HANDOFF_KEY);
    const readLocalList = <T,>(key: string): T[] => {
      try { return JSON.parse(localStorage.getItem(key) || "[]") || []; } catch { return []; }
    };
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
          // Supabase has records — use as authoritative source, plus any resumes made as a guest just before signing in
          if (guestHandoff) {
            const ids = new Set(supabaseResumes.map(r => r.id));
            supabaseResumes.push(...readLocalList<SavedResume>("jd_resume_customizer_saved_resumes").filter(r => !ids.has(r.id)));
          }
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
      if (guestHandoff && versions.length > 0) {
        const ids = new Set(versions.map(v => v.id));
        versions.push(...readLocalList<SavedResumeVersion>("jd_resume_customizer_versions").filter(v => !ids.has(v.id)));
      }
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
    setTailorStepError(null);
    setTailorJdAnalysis(null);
    setTailorSkillOptions([]);
    setTailorJdAnalysis(null);
    setTailorSkillOptions([]);
    setTailorSelectedSkills([]);
    setTailorCustomSkill("");
    setTailorReviews([]);
    setTailorReviewBase(null);
    setEditingReviewId(null);
    setTailorRoleCheck(null);
    setTailorIsSwitching(null);
    setTailorSwitchCerts("");
    setTailorSwitchProjects("");
    setTailorDownloaded(null);
    refreshAiCredits();
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
    setShowCloseDraftConfirm(false);
    // the "Original resume" popup shouldn't stay open behind the wizard
    setShowResumePreviewModal(false);
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

  // Loading steps shown while we wait: one list for reading the JD, one for tailoring
  const JD_STAGES = [
    { label: "Reading the job description", at: 0 },
    { label: "Finding the key skills", at: 35 },
    { label: "Checking which ones your resume has", at: 70 }
  ];
  const TAILOR_STAGES = [
    { label: "Matching your resume to the job", at: 0 },
    { label: "Writing suggested edits", at: 30 },
    { label: "Checking edits for new claims", at: 70 },
    { label: "Preparing your resume", at: 88 }
  ];
  const [processingStages, setProcessingStages] = useState(TAILOR_STAGES);

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
    const result = checkJobDescriptionText(jdText);
    console.info(`[JD Validation] Validation ${result.isValid ? "Passed" : "Failed"}`, result);
    return result;
  };

  const startTailorProgress = (stages = TAILOR_STAGES) => {
    if (tailorProgressTimerRef.current) {
      window.clearInterval(tailorProgressTimerRef.current);
    }
    setProcessingStages(stages);
    setTailorProcessingStage(stages[0].label);
    setTailorProgress(4);
    const startedAt = Date.now();
    tailorProgressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(98, 4 + Math.floor((elapsed / ANALYSIS_HARD_TIMEOUT_MS) * 94));
      setTailorProgress(nextProgress);
      const activeStage = [...stages].reverse().find(stage => nextProgress >= stage.at);
      if (activeStage) setTailorProcessingStage(activeStage.label);
    }, 300);
  };

  const stopTailorProgress = (complete = false) => {
    if (tailorProgressTimerRef.current) {
      window.clearInterval(tailorProgressTimerRef.current);
      tailorProgressTimerRef.current = null;
    }
    if (complete) {
      setTailorProcessingStage(processingStages[processingStages.length - 1].label);
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

  // "REST APIs" -> "REST API", "microservices" -> "microservice"; leaves AWS, CSS, Redis, Kubernetes-like stems safe
  const singularSkill = (term: string): string => {
    if (/apis$/.test(term)) return term.slice(0, -1);            // "REST APIs" -> "REST API"
    if (/\.js$/.test(term)) return term;                         // Node.js, Next.js
    return term.length >= 5 && /s$/.test(term) && !/(ss|us|is)$/.test(term) ? term.slice(0, -1) : term;
  };

  const calculateRealisticAtsScore = (resume: ResumeStructure, jd: SimplifiedJD) => {
    const requiredSkills = (jd.requiredSkills || []).map((s: any) => s?.name || s || "");
    const keywordsToTarget = jd.keywordsToTarget || [];
    // One entry per skill: drop case/plural repeats and longer variants ("PRD Writing" next to "PRD")
    const allKeywords = (() => {
      const list = [...requiredSkills, ...keywordsToTarget].map(k => String(k || "").trim()).filter(Boolean);
      const keys = list.map(k => singularSkill(k.toLowerCase().replace(/\s+/g, " ")));
      return list.filter((_, i) => keys.indexOf(keys[i]) === i && !keys.some((other, j) => j !== i && other.length < keys[i].length && keys[i].startsWith(other + " ")));
    })();
    
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
      const kwSingular = singularSkill(kwLower);
      const kwEscaped = kwSingular.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      // Match if present in skills list, or using word boundary search in general text
      const isMatched = skillsLower.some(s => s === kwLower || s === kwSingular || s === kwSingular + "s") ||
                        new RegExp(`\\b${kwEscaped}(?:e?s)?\\b`, 'i').test(allTextLower) || 
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

  // Proper casing for common skill names the JD reader lower-cases ("Aws" -> "AWS")
  const KNOWN_SKILL_CASE: Record<string, string> = {
    aws: "AWS", css: "CSS", html: "HTML", sql: "SQL", "ci/cd": "CI/CD", typescript: "TypeScript",
    javascript: "JavaScript", postgresql: "PostgreSQL", postgres: "Postgres", mysql: "MySQL",
    mongodb: "MongoDB", "node.js": "Node.js", nodejs: "Node.js", "next.js": "Next.js", nextjs: "Next.js",
    graphql: "GraphQL", gcp: "GCP", "github actions": "GitHub Actions", seo: "SEO", "power bi": "Power BI",
    "ab testing": "A/B testing", prds: "PRDs", "ui/ux": "UI/UX", fastapi: "FastAPI", "nest.js": "NestJS",
    nestjs: "NestJS", mui: "MUI", ios: "iOS", dynamodb: "DynamoDB", sqlite: "SQLite", ".net": ".NET",
    "c++": "C++", "c#": "C#", php: "PHP", "material-ui": "Material UI", "google cloud": "Google Cloud",
    "amazon web services": "Amazon Web Services"
  };
  const displaySkillName = (name: string, resume?: ResumeStructure | null): string => {
    const lower = name.toLowerCase();
    const own = (resume?.skills || []).find(sk => sk.toLowerCase() === lower);
    if (own) return own;
    if (KNOWN_SKILL_CASE[lower]) return KNOWN_SKILL_CASE[lower];
    return name;
  };

  const skillKey = (name: string) => singularSkill(name.toLowerCase().replace(/\s+/g, " ").trim());
  const dedupeSkillNames = (names: string[]): string[] => {
    const cleaned = names.flatMap(n => cleanSkillName(String(n || "")));
    const keys = cleaned.map(skillKey);
    return cleaned.filter((name, i) => {
      const key = keys[i];
      if (keys.indexOf(key) !== i) return false; // same skill, different case or plural
      // a longer variant of another listed skill, e.g. "CI/CD pipelines" next to "CI/CD"
      return !keys.some((other, j) => j !== i && other.length < key.length && key.startsWith(other + " "));
    });
  };
  const cleanJdSkills = (jd: SimplifiedJD, companyName = ""): SimplifiedJD => {
    // Skills only: drop the job title itself (AI sometimes lists it) and long phrases that aren't skills
    const titleKey = skillKey(jd.jobTitle || "");
    // The hiring company's own products aren't skills ("Razorpay Checkout"). Skip this for companies
    // whose products are everyday tools ("Google Analytics", "Microsoft Excel").
    const companyKey = skillKey(companyName).split(" ")[0] || "";
    const TOOL_MAKERS = new Set(["google", "microsoft", "amazon", "aws", "adobe", "salesforce", "atlassian", "meta", "apple", "oracle", "sap", "hubspot", "zoho"]);
    // compare the raw word too: "Sophos" loses its "s" in skillKey ("sopho")
    const companyWord = companyName.toLowerCase().trim().split(/\s+/)[0] || "";
    const isOwnProduct = (key: string) => companyKey.length >= 3 && !TOOL_MAKERS.has(companyKey) &&
      (key.split(" ").includes(companyKey) || key.split(" ").includes(companyWord));
    const isSkillLike = (name: string) => {
      const key = skillKey(name);
      // Job titles aren't skills ("Backend Engineer", "Product Manager")
      const looksLikeTitle = /\b(engineer|developer|manager|analyst|designer|scientist|architect|consultant|specialist|intern|executive|officer|associate|recruiter|accountant)s?$/.test(key);
      return !!key && key !== titleKey && !looksLikeTitle && !isOwnProduct(key) && key.split(" ").length <= 4 && name.length <= 40;
    };
    const required = dedupeSkillNames((jd.requiredSkills || []).map((sk: any) => sk?.name || sk)).filter(isSkillLike);
    const requiredKeys = new Set(required.map(skillKey));
    const priorityOf = (name: string) =>
      ((jd.requiredSkills || []) as any[]).find(sk => skillKey(sk?.name || "") === skillKey(name))?.priority || "high";
    return {
      ...jd,
      requiredSkills: required.map(name => ({ name, priority: priorityOf(name) })),
      keywordsToTarget: dedupeSkillNames([...required, ...(jd.keywordsToTarget || [])]).filter(k => isSkillLike(k) && !requiredKeys.has(skillKey(k)))
    };
  };

  // Skills named in the JD, each marked by whether the resume already shows it
  const buildSkillOptions = (resume: ResumeStructure, jd: SimplifiedJD) => {
    const names = [
      ...(jd.requiredSkills || []).map((sk: any) => sk?.name || sk),
      ...(jd.keywordsToTarget || [])
    ].map(n => String(n || "").trim()).filter(Boolean);
    const unique = dedupeSkillNames(names);
    const evaluation = calculateRealisticAtsScore(resume, {
      ...jd,
      requiredSkills: unique.map(name => ({ name, priority: "high" as const })),
      keywordsToTarget: []
    });
    const matched = new Set(evaluation.matchedKeywords.map(k => k.toLowerCase()));
    return unique.map(n => ({ name: displaySkillName(n, resume), inResume: matched.has(n.toLowerCase()) }));
  };

  // Compare the AI rewrite with the original, line by line, and list each change for review.
  // `mentions` = ticked skills a line now claims that the original line never mentioned.
  // `warnings` = new claims the original resume never made anywhere: numbers, JD skills, seniority.
  const buildEditReviews = (original: ResumeStructure, tailored: ResumeStructure, ticked: string[], jdSkills: string[] = [], jdText = ""): EditReview[] => {
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // whole word, singular or plural either way ("Payments" ticked matches "payment solutions")
    const has = (text: string, skill: string) => {
      const base = skill.toLowerCase().trim().replace(/(?<=[a-z]{3})s$/, "");
      return new RegExp(`(^|[^a-z0-9])${esc(base)}(e?s)?([^a-z0-9]|$)`, "i").test(text.toLowerCase());
    };
    const newMentions = (suggested: string, orig: string) => ticked.filter(sk => has(suggested, sk) && !has(orig, sk));
    const originalText = [
      original.summary, ...(original.skills || []), ...(original.certifications || []), ...(original.achievements || []),
      ...(original.workExperience || []).flatMap(j => [j.role, j.company, j.duration, ...(j.description || [])]),
      ...(original.projects || []).flatMap(pr => [pr.name, ...(pr.description || [])]),
      ...(original.education || []).flatMap(e => [e.degree, e.school, e.duration, e.gpa])
    ].filter(Boolean).join(" \n ").toLowerCase();
    // "B2B", "B2C", "H1B" aren't numbers; "2M users" still is
    const numbersOf = (text: string) => new Set((text.replace(/[A-Za-z]+\d+[A-Za-z]+/g, " ").match(/\d[\d,.]*/g) || []).map(n => n.replace(/,/g, "").replace(/\.$/, "")));
    const originalNumbers = numbersOf(originalText);
    const SENIORITY = ["senior", "lead", "principal", "staff engineer", "head of", "expert", "chief", "director"];
    // Everyday job-post words that don't make a claim on their own
    const GENERIC = new Set("about across ability reason reasons find finding conduct conducted able analyse analysis analyze based build building candidate clear closely comfort company cross customer customers daily deliver delivery design drive ensure every excellent experience familiarity features functional great growth hands help high hiring ideal impact including improve join knowledge launch looking manage manager managing metrics multiple needs other plus preferred prioritise prioritize product products quality required requirements responsibilities responsible results role strong success support teams their these things through tools track understanding using users within working world would years".split(" ").map(w => stem(w)));
    const wordsOf = (text: string) => (text.toLowerCase().match(/[a-z][a-z0-9+#/-]{4,}/g) || []);
    const stemsOf = (text: string) => new Map(wordsOf(text).map(w => [stem(w), w] as [string, string]));
    const jdStems = new Set([...stemsOf(jdText).keys()].filter(st => !GENERIC.has(st)));
    const originalStems = new Set(stemsOf(originalText).keys());
    const tickedStems = new Set(ticked.flatMap(t => [...stemsOf(t).keys()]));
    const claimWarnings = (sugg: string): string[] => {
      const warnings: string[] = [];
      const newNumbers = [...numbersOf(sugg)].filter(n => !originalNumbers.has(n));
      if (newNumbers.length) warnings.push(`Adds ${newNumbers.length === 1 ? "a number" : "numbers"} not in your resume (${newNumbers.slice(0, 3).join(", ")})`);
      const unbacked = jdSkills.filter(sk => sk && has(sugg, sk) && !has(originalText, sk) && !backedBy(originalText, sk) && !ticked.some(t => t.toLowerCase() === sk.toLowerCase()));
      if (unbacked.length) warnings.push(`Claims ${unbacked.slice(0, 3).join(", ")}, which ${unbacked.length === 1 ? "isn't" : "aren't"} in your resume`);
      const seniority = SENIORITY.filter(w => has(sugg, w) && !has(originalText, w));
      if (seniority.length) warnings.push(`Adds "${seniority[0]}", which isn't in your titles or experience`);
      // Words lifted from the job post that your resume never used, e.g. "checkout" for a payments job
      const lifted = [...stemsOf(sugg).entries()].filter(([stem, word]) => jdStems.has(stem) && !originalStems.has(stem) && !tickedStems.has(stem) && !backedBy(originalText, word)).map(([, word]) => word);
      const alreadyNamed = (w: string) => warnings.some(x => x.toLowerCase().includes(w.toLowerCase()));
      const liftedNew = lifted.filter(w => !alreadyNamed(w));
      if (liftedNew.length) warnings.push(`Uses "${liftedNew.slice(0, 3).join('", "')}" from the job post, which your resume doesn't mention`);
      return warnings;
    };
    // Results the line now claims that the original line didn't ("increased footfall", "boosted revenue")
    const RESULT_WORDS = ["increas", "boost", "grew", "grow", "drove", "driv", "rais", "reduc", "cut ", "doubl", "tripl", "accelerat", "maximi", "enhanc", "improv"];
    const resultWarning = (sugg: string, orig: string): string | null => {
      const s2 = sugg.toLowerCase(), o2 = orig.toLowerCase();
      // Only when the original line states no result at all ("raising coverage" -> "increased coverage" is fine)
      if (RESULT_WORDS.some(w => o2.includes(w))) return null;
      // "Generated weekly reports" is not a result; "generated ₹2L revenue" is
      const generatesResult = /generat\w*\s+(?:\S+\s+){0,3}?(?:[₹$€£]|\d|revenue|leads|sales|savings|profit)/.test(s2);
      return RESULT_WORDS.some(w => s2.includes(w)) || generatesResult ? "Claims a result your original line doesn't mention" : null;
    };
    const reviews: EditReview[] = [];
    const push = (label: string, orig: string, sugg: string, target: EditReview["target"], id: string) => {
      if (!sugg.trim() || sugg.trim() === orig.trim()) return;
      const result = orig.trim() ? resultWarning(sugg, orig) : null;
      reviews.push({ id, label, original: orig, suggested: sugg.trim(), text: sugg.trim(), status: "pending", mentions: newMentions(sugg, orig), warnings: [...claimWarnings(sugg), ...(result ? [result] : [])], target });
    };
    push("Professional summary", original.summary || "", tailored.summary || "", { kind: "summary" }, "summary");
    // "Associate Product Manager with 7 years" when only 2 of them were in that role
    {
      const sr = reviews.find(r => r.id === "summary");
      const latest = (original.workExperience || [])[0];
      const m = sr?.suggested.match(/^(.{3,80}?)\s+with\s+(?:about\s+|over\s+|nearly\s+)?(\d+)\+?\s+years/i);
      if (sr && latest?.role && m) {
        const roleWords = latest.role.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const saysRole = roleWords.length > 0 && roleWords.every(w => m[1].toLowerCase().includes(w));
        const inRole = yearsInJob(latest.duration);
        if (saysRole && Number(m[2]) > Math.ceil(inRole) + 1) {
          sr.warnings.push(`Says ${m[2]} years as ${latest.role}; your dates show about ${Math.max(1, Math.round(inRole))} in that role`);
        }
      }
    }
    (original.workExperience || []).forEach((job, i) => {
      const tJob = (tailored.workExperience || []).find(t => t.id && t.id === job.id) || (tailored.workExperience || [])[i];
      if (!tJob) return;
      const count = Math.max(job.description.length, (tJob.description || []).length);
      for (let b = 0; b < count; b++) {
        const name = [job.company, job.role].filter(Boolean).join(" · ") || `Job ${i + 1}`;
        const label = b < job.description.length ? `${name} · bullet ${b + 1}` : `${name} · new bullet`;
        push(label, job.description[b] || "", (tJob.description || [])[b] || "", { kind: "exp", item: i, bullet: b }, `exp-${i}-${b}`);
      }
    });
    (original.projects || []).forEach((proj, i) => {
      const tProj = (tailored.projects || []).find(t => t.id && t.id === proj.id) || (tailored.projects || [])[i];
      if (!tProj) return;
      const count = Math.max(proj.description.length, (tProj.description || []).length);
      for (let b = 0; b < count; b++) {
        const label = b < proj.description.length ? `${proj.name || `Project ${i + 1}`} · bullet ${b + 1}` : `${proj.name || `Project ${i + 1}`} · new bullet`;
        push(label, proj.description[b] || "", (tProj.description || [])[b] || "", { kind: "proj", item: i, bullet: b }, `proj-${i}-${b}`);
      }
    });
    // Lines the AI left unchanged that have no number yet: offer "add a result" on them too (3 lines max overall)
    const withResultOffer = reviews.filter(r => r.target.kind !== "summary" && !/\d/.test(r.suggested)).length;
    const room = Math.max(0, 3 - withResultOffer);
    if (room > 0) {
      const unchanged: EditReview[] = [];
      (original.workExperience || []).forEach((job, i) => job.description.forEach((line, b) => {
        const id = `exp-${i}-${b}`;
        if (!line.trim() || /\d/.test(line) || reviews.some(r => r.id === id)) return;
        const name = [job.company, job.role].filter(Boolean).join(" · ") || `Job ${i + 1}`;
        unchanged.push({ id, label: `${name} · bullet ${b + 1}`, original: line, suggested: line, text: line, status: "accepted", mentions: [], warnings: [], target: { kind: "exp", item: i, bullet: b }, resultOnly: true });
      }));
      reviews.push(...unchanged.slice(0, room));
    }
    return reviews;
  };

  // The resume the user actually gets: their original, the skills they ticked, and only accepted/edited lines
  const applyEditReviews = (base: { original: ResumeStructure; skills: string[] }, reviews: EditReview[]): ResumeStructure => {
    const result: ResumeStructure = JSON.parse(JSON.stringify(base.original));
    result.skills = [...base.skills];
    for (const r of reviews) {
      const value = r.status === "accepted" ? r.suggested : r.status === "edited" ? r.text.trim() : null;
      if (!value) continue;
      if (r.target.kind === "summary") { result.summary = value; continue; }
      const list = r.target.kind === "exp" ? result.workExperience : (result.projects || []);
      const item = list?.[r.target.item];
      if (!item) continue;
      if (r.target.bullet < item.description.length) item.description[r.target.bullet] = value;
      else item.description.push(value);
    }
    return result;
  };

  // Apply a change to one review and keep the preview, score and saved copy in sync
  const updateEditReviews = (next: EditReview[]) => {
    setTailorReviews(next);
    if (!tailorReviewBase) return;
    syncTailoredResume(applyEditReviews(tailorReviewBase, next));
  };
  // Change the final skills row (step 5 "add more skills"), in both AI and basic mode
  const setFinalSkills = (skills: string[]) => {
    if (tailorReviewBase) {
      const base = { ...tailorReviewBase, skills };
      setTailorReviewBase(base);
      syncTailoredResume(applyEditReviews(base, tailorReviews));
    } else if (tailoredResultResume) {
      syncTailoredResume({ ...tailoredResultResume, skills });
    }
  };
  // Show the new resume everywhere and keep the saved tailored version and its score in step
  const syncTailoredResume = (resume: ResumeStructure) => {
    setTailoredResultResume(resume);
    const jd = tailorAnalysisResult?.simplifiedJdObject;
    const evaluation = jd ? calculateRealisticAtsScore(resume, jd) : null;
    const versionId = tailoredResultVersion?.id;
    if (!versionId) return;
    setSavedVersions(prev => {
      const updated = prev.map(v => v.id === versionId ? {
        ...v,
        resumeData: resume,
        ...(evaluation ? { atsScore: evaluation.score, matchPercentage: evaluation.matchPercentage, missingRequirements: evaluation.missingKeywords } : {})
      } : v);
      localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(updated));
      return updated;
    });
  };
  const setReviewStatus = (id: string, status: EditReview["status"], text?: string) =>
    updateEditReviews(tailorReviews.map(r => r.id === id ? { ...r, status, text: text ?? r.text } : r));

  // Step 2 -> 3: read the job description and list its skills as checkboxes
  const handleAnalyzeJd = async () => {
    setTailorAnalysisError(null);
    const companyVal = tailorCompany || "";
    const jdTextVal = tailorJdText || "";

    if (!companyVal.trim()) {
      setTailorStepError("Please enter the company name.");
      setTailorWizardStep(1);
      return;
    }
    if (!jdTextVal.trim()) {
      setTailorStepError("Please paste a job description.");
      return;
    }
    const jdValidation = validateJobDescriptionText(jdTextVal);
    if (jdValidation.isTooLong) {
      setTailorStepError(`Job description is too long. Please keep it under ${JD_MAX_WORDS} words.`);
      return;
    }
    if (!jdValidation.isValid) {
      const wordCount = jdTextVal.trim().split(/\s+/).length;
      setTailorStepError(
        wordCount < JD_MIN_WORDS
          ? `This looks too short for a job description (${wordCount} words). Paste the full posting — at least ${JD_MIN_WORDS} words.`
          : INVALID_JD_MESSAGE
      );
      return;
    }
    setTailorStepError(null);

    setTailorIsAnalyzing(true);
    startTailorProgress(JD_STAGES);
    try {
      const selectedResume = getResumeToTailor();
      if (!selectedResume) throw new Error("No resume selected");
      const simplifyRes = await fetch("/api/simplify-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await aiAuthHeaders()) },
        body: JSON.stringify({ jdText: jdTextVal })
      }).catch(() => null);
      const simplifiedJd: SimplifiedJD = cleanJdSkills(simplifyRes && simplifyRes.ok
        ? await simplifyRes.json()
        : extractJDHeuristically(jdTextVal, companyVal), companyVal);
      if (simplifiedJd.isValidJd === false) {
        setTailorStepError(simplifiedJd.invalidReason ? `This doesn't look like a job description: ${simplifiedJd.invalidReason}` : INVALID_JD_MESSAGE);
        return;
      }
      setTailorJdAnalysis(simplifiedJd);
      trackEvent("jd_read", { mode: (simplifiedJd as any).aiUsage?.mode || "ai", skills: (simplifiedJd.requiredSkills || []).length });
      setTailorRole(simplifiedJd.jobTitle || "Tailored Position");
      setTailorSkillOptions(buildSkillOptions(selectedResume, simplifiedJd));
      // If the JD reader couldn't name the role, the posting's first line is usually the job title
      const firstLine = jdTextVal.trim().split("\n")[0].trim();
      const jobTitleForCheck = simplifiedJd.jobTitle && simplifiedJd.jobTitle !== "Tailored Position"
        ? simplifiedJd.jobTitle
        : (firstLine.length <= 80 ? firstLine : "");
      setTailorRoleCheck(detectRoleMismatch(selectedResume.workExperience?.[0]?.role, jobTitleForCheck));
      setTailorIsSwitching(null);
      setTailorSelectedSkills([]);
      setTailorCustomSkill("");
      setTailorWizardStep(3);
    } catch (err: any) {
      console.error(err);
      setTailorAnalysisError(err.message || "Couldn't read the job description.");
    } finally {
      stopTailorProgress(false);
      setTailorIsAnalyzing(false);
    }
  };

  // Step 3 -> 4: tailor the resume, adding only the skills the candidate ticked
  const handleAnalyzeAndGenerate = async () => {
    setTailorAnalysisError(null);
    const companyVal = tailorCompany || "";
    const jdTextVal = tailorJdText || "";
    const simplifiedJd = tailorJdAnalysis;
    if (!simplifiedJd) {
      setTailorWizardStep(2);
      return;
    }

    setTailorIsAnalyzing(true);
    startTailorProgress(TAILOR_STAGES);

    try {
      const pickedResume = getResumeToTailor();
      if (!pickedResume) throw new Error("No resume selected");
      // Career switchers' own courses and side projects count as their facts for this tailoring.
      const selectedResume = tailorIsSwitching ? addSwitchExtras(pickedResume, tailorSwitchCerts, tailorSwitchProjects) : pickedResume;

      const extractedRole = simplifiedJd.jobTitle || "Tailored Position";
      const simplifiedJdText = `Role: ${extractedRole}\nCompany Pitch: ${simplifiedJd.companyPitch || ""}\nKeywords: ${(simplifiedJd.keywordsToTarget || []).join(", ")}`;

      // Generate tailored resume
      setTailorProcessingStage("Writing suggested edits");
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
          headers: { "Content-Type": "application/json", ...(await aiAuthHeaders()) },
          body: JSON.stringify({
            resume: specResume,
            resumeStructure: selectedResume,
            jdText: simplifiedJdText,
            selectedSkills: tailorSelectedSkills,
            careerSwitch: tailorIsSwitching && tailorRoleCheck ? {
              fromRole: tailorRoleCheck.resumeRole,
              fromField: tailorRoleCheck.resumeFamily.label,
              toRole: tailorRoleCheck.jobTitle,
              toField: tailorRoleCheck.jobFamily.label
            } : undefined
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
      const raw: any = await tailorRes.json();
      if (raw?.aiUsage) setAiCredits({ aiEnabled: true, ...raw.aiUsage });

      // Rules mode returns highlight-style edits; Gemini returns a whole rewritten resume.
      const isFullRewrite = !!raw?.tailoredResume && !raw?.inlineAdditions;
      const result: TailoredResume = isFullRewrite
        ? { score: 0, matchedKeywords: [], missingKeywords: [], inlineAdditions: {}, newBullets: {}, newSkills: raw.newSkills || [], newSections: [] }
        : raw;

      // Highlight data only exists for rules-mode edits; null tells the results screen to show the rewrite as-is
      setTailoredResult(isFullRewrite ? null : result);

      let mergedTailoredResume: ResumeStructure;
      const jdSkillNames = [
        ...(simplifiedJd.requiredSkills || []).map((sk: any) => sk?.name || sk),
        ...(simplifiedJd.keywordsToTarget || [])
      ].map(n => String(n || "").trim()).filter(Boolean);
      // Skills row: the ones this job asks for first, then the person's others, 10 at most
      const jobSkillKeys = [...jdSkillNames, ...tailorSelectedSkills].map(skillKey).filter(k => k.length >= 2);
      const isJobSkill = (name: string) => {
        const key = skillKey(name);
        return jobSkillKeys.some(j => j === key || (j.length >= 3 && key.includes(j)) || (key.length >= 3 && j.includes(key)));
      };
      const bestSkills = (skills: string[], max = 10) => {
        const unique = skills.filter((sk, i) => skills.findIndex(o => skillKey(o) === skillKey(sk)) === i);
        const matched = unique.filter(isJobSkill);
        const others = unique.filter(sk => !isJobSkill(sk));
        return [...matched, ...others.slice(0, Math.max(0, max - matched.length))];
      };
      setShowMoreSkills(false);
      setExtraSkillInput("");
      if (isFullRewrite) {
        const aiResume = raw.tailoredResume as ResumeStructure;
        setTailorSkillPool(bestSkills(aiResume.skills || selectedResume.skills || [], Infinity));
        const base = { original: selectedResume, skills: bestSkills(aiResume.skills || selectedResume.skills || []) };
        // Safe edits (wording only, no new claims) go straight in; edits that add a claim wait for one click
        let reviews = buildEditReviews(selectedResume, aiResume, tailorSelectedSkills, jdSkillNames, tailorJdText || "")
          .map(r => !r.resultOnly && r.status === "pending" && (r.original.trim() || r.target.kind === "summary") && r.warnings.length === 0 && r.mentions.length === 0
            ? { ...r, status: "accepted" as const } : r);
        // No summary of your own: 2+ years of work gets a suggested one to add or edit; earlier on it's optional, so none is added
        if (!(selectedResume.summary || "").trim()) {
          const years = yearsOfExperience(selectedResume.workExperience || []);
          reviews = years >= 2
            ? reviews.map(r => r.target.kind === "summary"
              ? { ...r, status: "pending" as const, note: `You didn't have a summary. Here's one from your ${Math.floor(years)}+ years of experience (recruiters read it first). Keep it, edit it or remove it.` }
              : r)
            : reviews.filter(r => r.target.kind !== "summary");
        }
        setTailorReviewBase(base);
        setTailorReviews(reviews);
        setEditingReviewId(null);
        mergedTailoredResume = applyEditReviews(base, reviews);
      } else {
        setTailorReviewBase(null);
        setTailorReviews([]);
        mergedTailoredResume = mergeResumeWithAdditions(selectedResume, result);
        setTailorSkillPool(bestSkills(mergedTailoredResume.skills || [], Infinity));
        mergedTailoredResume = { ...mergedTailoredResume, skills: bestSkills(mergedTailoredResume.skills || []) };
      }
      
      if (mergedTailoredResume) {
        setTailorProcessingStage("Checking edits for new claims");
        const tailoredAtsEvaluation = calculateRealisticAtsScore(mergedTailoredResume, simplifiedJd);
        const diffResult = generateResumeDiff(selectedResume, mergedTailoredResume);

        // Keep the JD analysis so the results screen scores against the same keywords
        // as the saved version (it previously fell back to an empty JD and always showed ~70%).
        const originalAtsEvaluation = calculateRealisticAtsScore(selectedResume, simplifiedJd);
        setTailorAnalysisResult({
          matchedKeywords: tailoredAtsEvaluation.matchedKeywords,
          missingKeywords: tailoredAtsEvaluation.missingKeywords,
          missingQualifications: [],
          improvements: result.newSkills || [],
          simplifiedText: simplifiedJdText,
          originalAtsScore: originalAtsEvaluation.score,
          originalMatchPct: originalAtsEvaluation.matchPercentage,
          simplifiedJdObject: simplifiedJd
        });

        const newVersion: SavedResumeVersion = {
          id: `ver-${Date.now()}`,
          companyName: generateUniqueCompanyName(companyVal),
          jobTitle: extractedRole,
          savedAt: formatResumeCreatedDate(new Date().toISOString()),
          resumeData: mergedTailoredResume,
          originalResumeData: selectedResume,
          originalJobDescription: jdTextVal,
          appliedSuggestionsCount: (result.newSkills?.length || 0) + (result.newSections?.length || 0),
          atsScore: tailoredAtsEvaluation.score,
          matchPercentage: tailoredAtsEvaluation.matchPercentage,
          improvements: result.newSkills || [],
          missingRequirements: tailoredAtsEvaluation.missingKeywords,
          missingQualifications: [],
          diffAdded: diffResult.added,
          diffModified: diffResult.modified,
          diffUnchanged: diffResult.unchanged
        };

        setTailoredResultResume(mergedTailoredResume);
        setTailoredResultVersion(newVersion);
        trackEvent("tailored", { mode: raw?.aiUsage?.mode || (isFullRewrite ? "ai" : "rules"), ats: tailoredAtsEvaluation.score, careerSwitch: !!tailorIsSwitching });
        setTailoredAtsScore(result.score || tailoredAtsEvaluation.score);

        // Update locally saved versions
        setSavedVersions(prev => {
          const updated = [newVersion, ...prev];
          localStorage.setItem("jd_resume_customizer_versions", JSON.stringify(updated));
          return updated;
        });

        setTailorWizardStep(4);
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
      trackEvent("guest_started");
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
        setAnalysisResult({ isResume: false, ...(result.scanned ? { scanned: true, reason: result.reason } : {}) } as any);
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
        trackEvent("resume_uploaded", { fileType: file.name.split(".").pop()?.toLowerCase() });
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
        headers: { "Content-Type": "application/json", ...(await aiAuthHeaders()) },
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
        headers: { "Content-Type": "application/json", ...(await aiAuthHeaders()) },
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
      companyName: generateUniqueCompanyName(targetCompany),
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

  // One click: add a made-up sample resume so visitors can try the flow without their own file
  const handleUseSampleResume = () => {
    const newId = `resume-sample-${Date.now()}`;
    const data: ResumeStructure = JSON.parse(JSON.stringify(SAMPLE_RESUME));
    setSavedUserResumes(prev => [...prev, { id: newId, name: generateUniqueResumeName(data.fullName), data, fileType: "manual", uploadedAt: new Date().toISOString() }]);
    setActiveResumeId(newId);
    setIsUnlocked(true);
    sessionStorage.setItem("auralis_platform_unlocked", "true");
    setOnboardingChoice("done");
    sessionStorage.setItem("auralis_onboarding_dismissed", "true");
    localStorage.setItem("jd_resume_customizer_onboarding_done", "true");
    showNotification("Sample resume added. Go to Tailored Resumes and click Create New to try it.", "success");
    trackEvent("sample_resume_used", {});
  };

  // Closing the tailor window before the final step throws away that unfinished tailored copy.
  // Reaching the final step (or downloading) keeps it in "Tailored resumes".
  // Closing with unsaved AI edits asks first; "Discard and close" calls this with force = true
  const closeTailorWizard = (force: boolean = false) => {
    const unfinished = tailoredResultVersion && tailorWizardStep < 4 && !tailorDownloaded;
    if (unfinished && force !== true) {
      setShowCloseDraftConfirm(true);
      return;
    }
    setShowCloseDraftConfirm(false);
    if (unfinished) {
      const id = tailoredResultVersion!.id;
      const session = getStoredSupabaseSession();
      if (session?.accessToken && currentUser && !currentUser.isGuest) {
        supabaseData.deleteTailoredResume(session.accessToken, id)
          .catch((error) => console.warn("Supabase tailored resume delete failed:", error));
      }
      setSavedVersions(prev => prev.filter(v => v.id !== id));
      setTailoredResultVersion(null);
    }
    setIsTailorWizardOpen(false);
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
    education: educationNewestFirst(resume.education || [])
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

  // Text-based, single-column PDF that ATS software can read (the old export was a screenshot image)
  // Headline under the name = the person's own most recent title, never the target job's title
  // (printing "Senior Product Manager" for an Associate PM would be a false claim)
  const ownHeadline = (resume?: ResumeStructure | null) => (resume?.workExperience?.[0]?.role || "").trim();

  // Same file name for PDF and Word: "Priya_Sharma_Swiggy_Resume"
  const fileBaseName = (fullName?: string, company?: string) =>
    [fullName || "Resume", company || ""].map(part => part.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_")).filter(Boolean).join("_") + "_Resume";

  const handlePrintOrSavePDF = (resume: ResumeStructure, original?: ResumeStructure, headline = "", _tailored?: TailoredResume, company = "") => {
    try {
      logDownloadEvent("Download Started", { type: "PDF" });
      const exportResume = prepareResumeForDownload(resume, original);
      if (!exportResume) return;
      const doc = buildResumePdf(exportResume, ownHeadline(exportResume), resumeColor);
      doc.save(`${fileBaseName(exportResume.fullName, company)}.pdf`);
      logDownloadEvent("Download Completed", { type: "PDF" });
      showNotification("PDF downloaded.", "success");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      showNotification("Couldn't create the PDF. Try the Word download instead.", "error");
    }
  };

  // Download the tailored resume from the wizard, then show the "downloaded" popup.
  const downloadTailored = (format: "pdf" | "docx") => {
    if (!tailoredResultResume) return;
    const base = fileBaseName(tailoredResultResume.fullName, tailorCompany);
    if (format === "pdf") {
      handlePrintOrSavePDF(tailoredResultResume, undefined, tailorRole, undefined, tailorCompany);
    } else {
      downloadResumeAsDocx(tailoredResultResume, base, getResumeToTailor(), tailorRole);
    }
    setTailorDownloaded({ format, fileName: `${base}.${format}` });
    trackEvent("downloaded", { format });
  };

  const downloadResumeAsDocx = async (resume: ResumeStructure, filename: string, original?: ResumeStructure, headline = "") => {
    // Accent colour for the name and section headings (none for classic black)
    const docxAccent = resumeColor === "classic" ? "" : resumeColorHex(resumeColor).replace("#", "");
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
      const entryGap = () => ""; // space between jobs comes from the company heading's spacing (an empty line renders too tall in some viewers)
      const contactLines = [exportResume.phone, exportResume.email, exportResume.linkedin, exportResume.location, exportResume.website].filter(Boolean);

      let body = "";
      // Plain paragraphs, not a table: some ATS skip text inside tables, which would lose the contact details
      body += paragraph(exportResume.fullName, "HeaderName");
      const headlineText = ownHeadline(exportResume);
      if (headlineText) body += paragraph(headlineText, "HeaderRole");
      if (contactLines.length) body += paragraph(contactLines.map(String).join(" | "), "HeaderContact");
      if (exportResume.summary) body += heading("Professional Summary") + paragraph(exportResume.summary);
      if (exportResume.skills.length) {
        body += heading("Core Skills");
        // Two columns to save space, in a borderless table so the columns line up in every viewer
        // (Word, Google Docs, Mac preview). Only skills go in it; hiring software reads it row by row.
        const cell = (text?: string) => `<w:tc><w:tcPr><w:tcW w:w="4860" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:after="30"/></w:pPr><w:r><w:t xml:space="preserve">${text ? "• " + textXml(text) : ""}</w:t></w:r></w:p></w:tc>`;
        // a narrow spacer column, so the columns never touch (some viewers ignore cell padding)
        const gap = `<w:tc><w:tcPr><w:tcW w:w="360" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="BodyText"/><w:spacing w:after="30"/></w:pPr><w:r><w:t xml:space="preserve">\u00A0\u00A0\u00A0\u00A0</w:t></w:r></w:p></w:tc>`;
        let rows = "";
        for (let i = 0; i < exportResume.skills.length; i += 2) {
          rows += `<w:tr>${cell(exportResume.skills[i])}${gap}${cell(exportResume.skills[i + 1])}</w:tr>`;
        }
        body += `<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4860"/><w:gridCol w:w="360"/><w:gridCol w:w="4860"/></w:tblGrid>${rows}</w:tbl>`;
      }
      // School, years and GPA on one line (like the PDF); recent graduates get Education above Experience
      const educationXml = () => {
        if (!exportResume.education.length) return "";
        let xml = heading("Education");
        educationNewestFirst(exportResume.education).forEach(edu => {
          xml += subhead(edu.degree || edu.school || "");
          const sub = [edu.degree ? edu.school : "", edu.duration, edu.gpa ? `GPA: ${edu.gpa}` : ""].filter(Boolean).join(" | ");
          if (sub) xml += metaLine(sub);
        });
        return xml;
      };
      const eduFirst = educationGoesFirst(exportResume);
      if (eduFirst) body += educationXml();
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
      if (!eduFirst) body += educationXml();
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
        body += paragraph(exportResume.languages.join(", ")); // one line, like the PDF
      }

      const zip = new JSZip();
      zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
      zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
      zip.folder("word")?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
      zip.folder("word")?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:spacing w:after="90" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderName"><w:name w:val="Header Name"/><w:pPr><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/>${docxAccent ? `<w:color w:val="${docxAccent}"/>` : ""}<w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderRole"><w:name w:val="Header Role"/><w:pPr><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:color w:val="374151"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="HeaderContact"><w:name w:val="Header Contact"/><w:pPr><w:spacing w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="111827"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="180" w:after="80" w:line="276" w:lineRule="auto"/><w:pBdr><w:bottom w:val="single" w:sz="5" w:space="3" w:color="${docxAccent || "C9CDD3"}"/></w:pBdr></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/>${docxAccent ? `<w:color w:val="${docxAccent}"/>` : ""}<w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:pPr><w:spacing w:before="160" w:after="20" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:pPr><w:spacing w:after="50" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="4B5563"/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="EntryGap"><w:name w:val="Entry Gap"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="4"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="420" w:hanging="240"/><w:spacing w:after="45" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="21"/></w:rPr></w:style></w:styles>`);
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

  // Shared by the desktop sidebar and the mobile tab bar
  const handleWorkspaceNav = (step: "resume" | "dashboard") => {
    if (step !== "resume" && !isUnlocked && !hasResume) {
      handleLockedInteraction();
      return;
    }
    if (hasResume && !isUnlocked) {
      setIsUnlocked(true);
      sessionStorage.setItem("auralis_platform_unlocked", "true");
    }
    setCurrentStep(step);
  };

  const workspaceNavItems = [
    { step: "resume" as const, label: "Resume Setup", icon: FileText },
    { step: "dashboard" as const, label: "Tailored Resumes", icon: FolderOpen }
  ];

  // Escape closes the open dialog (but never interrupts a running analysis)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showDeleteSavedVersionConfirmModal) {
        setShowDeleteSavedVersionConfirmModal(false);
      } else if (showDeleteConfirmModal) {
        setShowDeleteConfirmModal(false);
      } else if (isTailorWizardOpen) {
        if (showCloseDraftConfirm) setShowCloseDraftConfirm(false);
        else if (!tailorIsAnalyzing) closeTailorWizard();
      } else if (isUploadModalOpen) {
        if (!isAnalyzing) {
          setIsUploadModalOpen(false);
          setTempFile(null);
          setUploadError(null);
          setAnalysisResult(null);
        }
      } else if (showResumePreviewModal) {
        setShowResumePreviewModal(false);
      } else if (showSavedVersionPreviewModal) {
        setShowSavedVersionPreviewModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTailorWizardOpen, tailorIsAnalyzing, tailorWizardStep, tailoredResultVersion, tailorDownloaded, isUploadModalOpen, isAnalyzing, showResumePreviewModal, showSavedVersionPreviewModal, showDeleteSavedVersionConfirmModal, showDeleteConfirmModal, showCloseDraftConfirm]);

  return (
    <div className="min-h-screen font-sans antialiased overflow-x-hidden selection:bg-neutral-200 selection:text-black pb-12 print:bg-white print:pb-0 bg-white text-black">
      {currentStep === "auth" ? (
        <>
          {/* Top Navigation Bar specifically for Login/Auth page */}
          <nav id="navbar-top" className="fixed top-0 w-full z-50 border-b border-neutral-200 bg-white print-hide">
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
   
                {/* Aggressive architecture tight headline (84px text class with Space Grotesk look) */}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-sans font-bold tracking-tighter text-black leading-[0.98] max-w-[540px]">
                  Tailor your resume to any job in minutes
                </h1>
   
                <p className="font-sans text-sm md:text-base text-neutral-700 max-w-[500px] leading-relaxed">
                  Upload your resume, paste a job post, and tick the skills you really have. Auralis makes honest edits for you (anything that adds a claim waits for your OK), then gives you a clean PDF or Word file that hiring software can read.
                </p>
   

              </div>

              {/* Right Column: Login options */}
              <div className="lg:col-span-6 w-full flex justify-center">
                <div id="auth-panel" className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10 relative overflow-hidden w-full max-w-[480px]">
                  
                  <div className="space-y-6">
                    {(() => {
                      const activeTab = isForgotPassword || isResetPassword ? "forgot" : isSignUp ? "signup" : "signin";
                      const tabs: { id: "signin" | "signup" | "forgot"; label: string }[] = [
                        { id: "signin", label: "Sign in" },
                        { id: "signup", label: "Create account" },
                        { id: "forgot", label: "Forgot password" },
                      ];
                      return (
                        <div id="auth-tabs" role="tablist" className="flex gap-1.5 p-1 bg-neutral-100 rounded-full">
                          {tabs.map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              role="tab"
                              id={`tab-${tab.id}`}
                              aria-selected={activeTab === tab.id}
                              disabled={isAuthSubmitting || isVerifying}
                              onClick={() => switchAuthTab(tab.id)}
                              className={`flex-1 py-2 px-2 text-xs rounded-full transition cursor-pointer ${
                                activeTab === tab.id ? "bg-white text-black font-semibold border border-neutral-300" : "text-neutral-600 hover:text-black"
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
   
                    {(() => {
                      // Once a code (or reset link) is out, the email is shown locked with an Edit button
                      const lockedEmail = verifyEmail || resetEmail || (isResetPassword ? emailFromToken(resetAccessToken) : null);
                      const codeFor: "signup" | "reset" | null = verifyEmail && !signupSession ? "signup" : resetEmail && !resetSession ? "reset" : null;
                      // Password boxes for a reset show only once the code is confirmed (or they came from a reset link)
                      const askNewPassword = isResetPassword || !!resetSession;
                      const settingNewPassword = isResetPassword || !!resetEmail;
                      const busy = isAuthSubmitting || isVerifying;
                      const sendCooldown = isForgotPassword && !resetEmail && resetCooldownSeconds > 0;
                      const hideEmail = isResetPassword && !lockedEmail;
                      return (
                    <form id={signupSession ? "signup-password-form" : verifyEmail ? "verify-code-form" : "auth-form"} onSubmit={signupSession ? handleSetSignupPassword : verifyEmail ? handleVerifyCode : handleAuth} noValidate className="space-y-4 text-left">
                      <h2 className="text-xl font-semibold text-black tracking-tight">
                        {verifyEmail ? (isSignUp ? "Create Account" : "Confirm your email") : settingNewPassword ? "Reset Password" : isForgotPassword ? "Forgot Password" : isSignUp ? "Create Account" : "Sign In"}
                      </h2>

                      {lockedEmail ? (
                        <div>
                          <label className="block text-xs text-black mb-1.5 font-bold">Email Address</label>
                          <div id="locked-email" className="px-3 py-2.5 bg-neutral-100 border border-neutral-200 rounded-lg">
                            <span className="block text-sm text-black truncate">{lockedEmail}</span>
                          </div>
                          <p id="wrong-email-note" className="mt-1.5 text-[11px] text-neutral-500">
                            Wrong email? Click <span className="font-semibold text-black">{isSignUp || verifyEmail ? "Create account" : "Forgot password"}</span> above to start again.
                          </p>
                        </div>
                      ) : !hideEmail && (
                        <div>
                          <label className="block text-xs text-black mb-1.5 font-bold">Email Address</label>
                          <input
                            id="input-auth-email"
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={authEmail}
                            onChange={(e) => {
                              setAuthEmail(e.target.value);
                              setAuthMessage(null);
                            }}
                            className="w-full pl-3 pr-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
                          />
                          {isSignUp && (
                            <p id="signup-email-note" className="mt-1.5 text-[11px] text-neutral-500">Use your own email. We'll send the code here.</p>
                          )}
                        </div>
                      )}

                      {(signupSession || resetSession) && (
                        <p id="email-confirmed" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5" /> {signupSession ? "Email confirmed. Now choose a password." : "Code confirmed. Now choose a new password."}
                        </p>
                      )}

                      {codeFor && (
                        <div id="code-section">
                          <p className="block text-xs text-black mb-1 font-bold">{SIGNUP_CODE_LENGTH}-digit code</p>
                          <p className="text-xs text-neutral-600 mb-2 leading-relaxed">
                            {codeFor === "signup" ? "We emailed you a code to confirm your account." : "We emailed you a code to reset your password."} It usually arrives within a minute; check spam too.
                          </p>
                          {codeFor === "signup" ? (
                            <CodeBoxes length={SIGNUP_CODE_LENGTH} value={verifyCode} onChange={(code) => { setVerifyCode(code); setAuthMessage(null); }} />
                          ) : (
                            <CodeBoxes length={SIGNUP_CODE_LENGTH} value={resetCode} onChange={(code) => { setResetCode(code); setAuthMessage(null); }} />
                          )}
                          <button
                            type="button"
                            id="btn-resend-code"
                            disabled={codeFor === "reset" && resetCooldownSeconds > 0}
                            onClick={codeFor === "signup" ? handleResendCode : handleResendResetCode}
                            className="mt-2 text-xs font-semibold text-black underline cursor-pointer disabled:text-neutral-400 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            {codeFor === "reset" && resetCooldownSeconds > 0 ? `Send a new code in ${resetCooldownSeconds}s` : "Send a new code"}
                          </button>
                        </div>
                      )}

                      {(signupSession || askNewPassword || (!verifyEmail && !isSignUp && !isForgotPassword)) && (
                        <div>
                          <label className="block text-xs text-black mb-1.5 font-bold">{settingNewPassword ? "New Password" : "Password"}</label>
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
                              className="w-full pl-3 pr-10 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
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
                          <p id="password-case-note" className="mt-1.5 text-[11px] text-neutral-500">Passwords are case sensitive (A and a are different).</p>
                        </div>
                      )}

                      {(signupSession || askNewPassword) && (
                        <div>
                          <label className="block text-xs text-black mb-1.5 font-bold">Confirm Password</label>
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
                              className="w-full pl-3 pr-10 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-black placeholder-neutral-400 focus:outline-hidden focus:border-black"
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

                      {sendCooldown && (
                        <div
                          id="password-reset-cooldown"
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800"
                        >
                          You can request another reset code in {resetCooldownSeconds} seconds.
                        </div>
                      )}

                      <button
                        id={verifyEmail ? "btn-verify-code" : "btn-auth-submit"}
                        type="submit"
                        disabled={busy || sendCooldown}
                        className={`w-full py-3 text-white text-sm font-medium rounded-lg transition mt-4 flex items-center justify-center gap-2 ${
                          busy ? "bg-neutral-700 cursor-wait" : sendCooldown ? "bg-neutral-400 cursor-not-allowed" : "bg-black hover:bg-neutral-800 cursor-pointer"
                        }`}
                      >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {busy
                          ? authProgress || "Please wait..."
                          : signupSession
                            ? "Create Account"
                            : verifyEmail
                            ? "Verify code"
                            : resetEmail && !resetSession
                              ? "Verify code"
                              : settingNewPassword
                              ? "Update Password"
                              : isForgotPassword
                                ? sendCooldown
                                  ? `Wait ${resetCooldownSeconds}s`
                                  : "Send Reset Code"
                                : isSignUp
                                  ? "Send code"
                                  : "Sign In"}
                      </button>
                      {busy && (
                        <p id="auth-progress-note" className="text-[11px] text-neutral-500 text-center -mt-2">This can take a few seconds. Please keep this page open.</p>
                      )}

                    </form>
                      );
                    })()}
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-neutral-200"></div>
                      <span className="flex-shrink mx-3 text-neutral-500 text-xs">or</span>
                      <div className="flex-grow border-t border-neutral-200"></div>
                    </div>
                    <button
                      id="btn-quick-guest"
                      onClick={handleGuestAccess}
                      disabled={isAuthSubmitting}
                      className={`w-full py-3 bg-white border border-neutral-300 hover:bg-neutral-50 text-black text-sm font-medium rounded-lg transition-colors duration-150 ${
                        isAuthSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      Continue as Guest
                    </button>
                    <p className="text-xs text-neutral-500 text-center">
                      By continuing, you agree to how we handle your data.{" "}
                      <button type="button" id="btn-privacy-login" onClick={() => setShowPrivacy(true)} className="underline hover:text-black cursor-pointer">Privacy</button>
                    </p>
                    {showPrivacy && <PrivacyNotice onClose={() => setShowPrivacy(false)} />}
   
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
        className={`flex flex-col border-r border-neutral-200 bg-white transition-all duration-300 z-30 h-screen relative flex-shrink-0 ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div>
          {/* Logo & Chevron toggle button */}
          <div className="h-16 flex items-center justify-between px-5 border-b border-neutral-200">
            {!isSidebarCollapsed ? (
              <span className="text-base font-semibold tracking-tight text-black flex items-center gap-2 selection:bg-transparent">
                <Sparkles className="w-[18px] h-[18px] text-emerald-600 flex-shrink-0" />
                <span>Auralis</span>
              </span>
            ) : (
              <Sparkles className="w-5 h-5 text-emerald-600 mx-auto flex-shrink-0" />
            )}
            
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-md text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer flex-shrink-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? "rotate-0" : "rotate-180"}`} />
            </button>
          </div>

          {/* Navigation Links inside Collapsible Sidebar */}
          <nav className="px-3 py-4 space-y-0.5">
            {workspaceNavItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = currentStep === item.step;
              return (
                <button
                  key={item.step}
                  id={`sidebar-link-${item.step}`}
                  onClick={() => handleWorkspaceNav(item.step)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 cursor-pointer ${
                    isActive
                      ? "bg-neutral-100 text-black font-medium"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-black"
                  }`}
                >
                  <IconComponent className="w-[18px] h-[18px] flex-shrink-0 text-current" />
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
        <div className="p-4 border-t border-neutral-200 bg-white mt-auto">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {currentUser?.name.charAt(0).toUpperCase()}
            </div>
            {!isSidebarCollapsed && (
              <div className="truncate text-left min-w-0">
                <p className="text-sm font-medium text-black truncate leading-tight">{currentUser?.name}</p>
                <p className="text-xs text-neutral-500 truncate mt-0.5">{currentUser?.email}</p>
              </div>
            )}
          </div>
          {!isSidebarCollapsed && (
            <div className="mt-3 flex flex-col items-start gap-1.5">
              <button type="button" id="btn-send-feedback" onClick={() => setShowFeedback(true)} className="text-xs font-medium text-black hover:underline cursor-pointer">
                Send feedback
              </button>
              <button type="button" id="btn-privacy" onClick={() => setShowPrivacy(true)} className="text-xs text-neutral-500 hover:text-black cursor-pointer">
                Privacy & delete my data
              </button>
            </div>
          )}
        </div>
      </aside>
      {showFeedback && currentUser && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowFeedback(false)}>
          <div id="feedback-modal" role="dialog" aria-label="Send feedback" className="bg-white rounded-2xl border border-neutral-200 w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowFeedback(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100" title="Close">
              <X className="w-5 h-5" />
            </button>
            <FeedbackBox title="How is Auralis working for you?" onSend={(rating, comment) => handleSendFeedback(rating, comment, "sidebar")} />
          </div>
        </div>
      )}
      {showPrivacy && currentUser && (
        <PrivacyNotice onClose={() => setShowPrivacy(false)} onDeleteData={handleDeleteMyData} onDeleteAccount={handleDeleteMyAccount} deleting={isDeletingAccount} isGuest={!!currentUser?.isGuest} />
      )}

      {/* Main Panel Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Menu */}
        <header className="h-16 border-b border-neutral-200 bg-white flex justify-between items-center px-8 z-20 flex-shrink-0">
          
          {/* Left indicator label or mobile Brand */}
          <div className="flex items-center gap-3 text-left">
                        <span className="text-sm text-neutral-500">
              Workspace <span className="mx-1.5 text-neutral-300">/</span>
              <span className="text-black font-medium">{currentStep === "dashboard" ? "Tailored Resumes" : "Resume Setup"}</span>
            </span>
            {!isUnlocked && (
              <span className="bg-amber-50 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-md">
                Profiles locked
              </span>
            )}
          </div>

          {/* Right Header Navigation Panel controls */}
          <div className="flex items-center gap-1">
            
            {/* Notification alert Bell triggering dropdown menu */}
            <div className="relative">
              <button
                id="btn-notifications-menu"
                onClick={toggleNotifications}
                className="p-2 rounded-lg text-neutral-600 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer relative"
                title="Toggle Notifications Alert"
              >
                <Bell className="w-[18px] h-[18px]" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 ring-2 ring-white flex items-center justify-center text-[10px] font-semibold text-white">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 p-4 text-left animate-fadeIn">
                  <div className="flex justify-between items-center border-b border-neutral-200 pb-2.5 mb-3">
                    <span className="text-xs font-semibold text-black flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Notifications ({notifications.filter(n => !n.read).length})</span>
                    </span>
                    {notifications.some(n => !n.read) && (
                      <button 
                        onClick={markAllNotificationsAsRead} 
                        className="text-xs text-neutral-500 hover:text-black px-2 py-1 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  
                  <div className="divide-y divide-neutral-100 max-h-64 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-neutral-500 font-semibold">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          className={`py-2.5 text-sm ${notif.read ? "text-neutral-500" : "text-neutral-900"}`}
                        >
                          <div className="flex items-start gap-2">
                            {!notif.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="leading-snug">{notif.text}</p>
                              <span className="text-xs text-neutral-400 mt-1 block">
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
              onClick={() => handleSignOut()}
              className="text-sm font-medium text-neutral-600 hover:text-black hover:bg-neutral-100 px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              {currentUser?.isGuest ? "Create account" : "Sign Out"}
            </button>
          </div>
        </header>

        {/* Scrollable Workspace Container */}
        <main className="flex-1 overflow-y-auto px-8 py-8 pb-28 relative">
          
          {/* Notification Toast within Workspace */}
          {notification && (
            <div
              id="toast-notification-workspace"
              className="fixed top-24 right-6 z-55 flex items-center gap-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-950 dark:text-white shadow-xl text-xs font-bold animate-slideIn"
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
                  <div className="max-w-xl w-full mx-auto my-16 animate-fadeIn">
                    <div className="flex flex-col items-center justify-center px-8 text-center w-full">
                      <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                        <FolderOpen className="w-5 h-5 text-neutral-600" />
                      </div>
                      <h3 className="text-base font-semibold text-black">No tailored resumes yet</h3>
                      <p className="text-sm text-neutral-500 mt-1.5 max-w-sm leading-relaxed">
                        Add a resume in Resume Setup, then create and download a tailored resume here.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* EXQUISITE JD CARD LAYOUT REPRESENTING CREATED JDS AS DEPICTED IN THE WIREFRAME */
                  <div className="max-w-3xl mx-auto text-left animate-fadeIn w-full pb-4">
                    <div className="mb-6">
                      <h1 className="text-2xl font-semibold tracking-tight text-black">Tailored resumes</h1>
                      <p className="text-sm text-neutral-500 mt-1">
                        Each one is a copy of your resume matched to a specific job. Your original resume stays unchanged.
                      </p>
                    </div>
                    <div className="border-t border-neutral-200 divide-y divide-neutral-200">
                    {savedVersions.map((version) => {
                      const showRole = !!version.jobTitle && version.jobTitle !== "Tailored Position";
                      const sourceName = version.originalResumeData?.fullName;
                      return (
                      <div
                        key={version.id}
                        id={`jd-item-${version.id}`}
                        className="w-full py-4 flex justify-between items-center gap-4 text-left"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <h3 className="text-[15px] font-medium text-black truncate">
                            {version.companyName}
                            {showRole && <span className="text-neutral-500 font-normal"> · {version.jobTitle}</span>}
                          </h3>
                          <p className="text-sm text-neutral-500 flex flex-wrap items-center gap-x-1.5">
                            {typeof version.atsScore === "number" && (
                              <>
                                <span className="text-emerald-700 font-medium">ATS {version.atsScore}%</span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span>{sourceName ? `From ${sourceName} · ` : ""}Created {version.savedAt}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSavedVersion(version); setVersionView("full");
                              setShowSavedVersionPreviewModal(true);
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-black rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
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
                            className="px-3 py-1.5 text-sm font-medium text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      );
                    })}
                    </div>
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
                className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-xl transition-colors duration-150 cursor-pointer border border-transparent flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                <span>Create New</span>
              </button>
            </div>
          )}


        {/* -------------------- STEP 1: RESUME SETUP / BUILDER -------------------- */}
        {false && (
          <div className="fixed inset-0 bg-black/55 dark:bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 w-full max-w-2xl max-h-[85vh] overflow-y-auto relative animate-scaleIn space-y-6">
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
                className="absolute top-4 right-4 text-xs font-bold text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition cursor-pointer px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
              >
                Dismiss ✕
              </button>

              {!isUnlocked && (
                <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 text-center space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
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
                  <span className="text-xs font-bold text-neutral-400">Option B</span>
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
                    const newName = generateUniqueResumeName(activeResume.fullName ? `${activeResume.fullName}'s Resume` : "My Resume");
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
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1.5">1. Contact & Identity</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700">Full Name *</label>
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
                        <label className="block text-sm font-medium text-neutral-700">Email Address *</label>
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
                        <label className="block text-sm font-medium text-neutral-700">Phone Number *</label>
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
                        <label className="block text-sm font-medium text-neutral-700">LinkedIn URL</label>
                        <input
                          type="text"
                          placeholder="e.g. linkedin.com/in/alex"
                          value={activeResume.linkedin || ""}
                          onChange={(e) => handleUpdateContact("linkedin", e.target.value)}
                          className="w-full mt-1 p-2 bg-white dark:bg-black border border-neutral-250 dark:border-neutral-800 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700">Portfolio / Website</label>
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
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1.5">2. Professional Pitch</h3>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700">Summary Summary *</label>
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
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1.5">3. Skill Tag Keywords</h3>
                    <div>
                      <div className="flex flex-wrap gap-1.5 mb-3 bg-white dark:bg-black p-2.5 rounded-lg border border-transparent dark:border-neutral-850 min-h-12 items-center">
                        {activeResume.skills.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-sans"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveSkillTag(tag)}
                              className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-semibold"
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
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1.5">4. Jobs & Academic Projects</h3>
                    
                    {activeResume.workExperience.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {activeResume.workExperience.map((exp) => (
                          <div key={exp.id} className="p-2.5 bg-white dark:bg-black rounded-lg border border-transparent dark:border-neutral-800 text-xs flex justify-between items-center">
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white">{exp.role}</p>
                              <p className="text-xs text-neutral-400">{exp.company} • {exp.duration}</p>
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

                    <div className="bg-white dark:bg-black rounded-xl p-3 border border-transparent dark:border-neutral-800 space-y-2.5 text-xs">
                      <p className="text-[11px] text-neutral-400 font-bold">Add Experience Entry</p>
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
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-800 pb-1.5">5. Academic Credentials</h3>
                    
                    {activeResume.education.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {activeResume.education.map((edu) => (
                          <div key={edu.id} className="p-2.5 bg-white dark:bg-black rounded-lg border border-transparent dark:border-neutral-805 text-xs flex justify-between items-center">
                            <div>
                              <p className="font-bold text-neutral-900 dark:text-white">{edu.degree}</p>
                              <p className="text-xs text-neutral-400">{edu.school} • {edu.duration} {edu.gpa ? `• GPA: ${edu.gpa}` : ""}</p>
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

                    <div className="bg-white dark:bg-black rounded-xl p-3 border border-transparent dark:border-neutral-800 space-y-2.5 text-xs">
                      <p className="text-[11px] text-neutral-400 font-bold">Add Education Degree</p>
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
                      className="px-8 py-4 bg-neutral-950 dark:bg-neutral-100 hover:opacity-90 text-white dark:text-black font-bold text-xs rounded-xl transition duration-150 cursor-pointer"
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
                    <div className="max-w-xl w-full mx-auto my-16 animate-fadeIn">
                      <div className="flex flex-col items-center justify-center px-8 text-center w-full">
                        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                          <FolderOpen className="w-5 h-5 text-neutral-600" />
                        </div>
                        <h3 className="text-base font-semibold text-black">No resumes yet</h3>
                        <p className="text-sm text-neutral-500 mt-1.5 max-w-sm leading-relaxed">
                          Upload your resume as a PDF or Word file to get started. Use the Create New button below.
                        </p>
                        <button
                          type="button"
                          id="btn-sample-resume"
                          onClick={handleUseSampleResume}
                          className="mt-4 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-black cursor-pointer"
                        >
                          Just looking? Try a sample resume
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex flex-col justify-start items-center text-left animate-fadeIn w-full">
                      {/* Resume Library Card List and Floating Add Button Wrapper */}
                      <div className="max-w-3xl w-full relative pb-4">
                        <div className="mb-6">
                          <h1 className="text-2xl font-semibold tracking-tight text-black">Your resumes</h1>
                          <p className="text-sm text-neutral-500 mt-1">
                            Upload a resume once, then tailor it to as many jobs as you like.
                          </p>
                        </div>
                        <div className="border-t border-neutral-200 divide-y divide-neutral-200">
                        {savedUserResumes.map((savedResume) => {
                          const jobCount = savedResume.data?.workExperience?.length || 0;
                          const skillCount = savedResume.data?.skills?.length || 0;
                          const summaryBits = [
                            jobCount ? `${jobCount} ${jobCount === 1 ? "job" : "jobs"}` : null,
                            skillCount ? `${skillCount} ${skillCount === 1 ? "skill" : "skills"}` : null
                          ].filter(Boolean).join(" · ");
                          return (
                          <div
                            key={savedResume.id}
                            className="w-full py-4 flex justify-between items-center gap-4"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <h3 className="text-[15px] font-medium text-black truncate">
                                {getResumeCardDisplayName(savedResume)}
                              </h3>
                              <p className="text-sm text-neutral-500">
                                {[summaryBits, `Added ${formatResumeCreatedDate(savedResume.uploadedAt)}`].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveResumeId(savedResume.id);
                                  setPreviewResumeId(savedResume.id);
                                  setShowResumePreviewModal(true);
                                }}
                                className="px-3 py-1.5 text-sm font-medium text-black rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
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
                                className="px-3 py-1.5 text-sm font-medium text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {resumeSelectionMode !== "create" && (
                  <>
                    {!hasResume ? (
                      <div className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 group inline-block animate-fadeIn">
                        <button
                          id="btn-first-time-create-resume"
                          onClick={() => {
                            setTempFile(null);
                            setUploadError(null);
                            setAnalysisResult(null);
                            setIsUploadModalOpen(true);
                          }}
                          className="px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-xl transition-colors duration-150 cursor-pointer border border-transparent flex items-center gap-2"
                          title="Start here to unlock Auralis."
                        >
                          <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                          <span>Create New</span>
                        </button>
                        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-black text-white text-xs font-bold py-1 px-2.5 rounded border border-white whitespace-nowrap pointer-events-none z-35 font-sans">
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
                        className="fixed bottom-5 right-5 sm:bottom-8 sm:right-8 z-40 px-5 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-xl transition-colors duration-150 cursor-pointer border border-transparent flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4 text-white" strokeWidth={3} />
                        <span>Add Resume</span>
                      </button>
                    )}
                  </>
                )}

                {/* Render Manual Build Form Fields Directly */}
                {resumeSelectionMode === "create" && (
                  <div className="max-w-3xl bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 animate-fadeIn">
                    <div className="mb-6 pb-4 border-b border-neutral-250 text-left flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-neutral-900 tracking-tight">
                          {hasResume ? "Edit your resume" : "Let's create your resume"}
                        </h3>
                        <p className="text-xs text-neutral-550 mt-1 font-medium font-sans">Fill out the fields below to construct a robust, ATS-compliant professional profile.</p>
                      </div>
                      {hasResume && (
                        <button
                          type="button"
                          onClick={() => setResumeSelectionMode(null)}
                          className="px-4 py-2 bg-neutral-150 hover:bg-neutral-200 text-neutral-700 hover:text-black rounded-lg text-xs font-bold transition cursor-pointer border border-neutral-200"
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
                        const newName = generateUniqueResumeName(activeResume.fullName ? `${activeResume.fullName}'s Resume` : "My Resume");
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
                        <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-200 pb-1.5">1. Contact & Identity</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-neutral-700">Full Name *</label>
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
                            <label className="block text-sm font-medium text-neutral-700">Email Address *</label>
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
                            <label className="block text-sm font-medium text-neutral-700">Phone Number *</label>
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
                            <label className="block text-sm font-medium text-neutral-700">LinkedIn URL</label>
                            <input
                              type="text"
                              placeholder="e.g. linkedin.com/in/alex"
                              value={activeResume.linkedin || ""}
                              onChange={(e) => handleUpdateContact("linkedin", e.target.value)}
                              className="w-full mt-1 p-2 bg-white border border-neutral-250 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-700">Portfolio / Website</label>
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
                        <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-200 pb-1.5">2. Professional Pitch</h3>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700">Professional Summary *</label>
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
                        <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-200 pb-1.5">3. Skill Tag Keywords</h3>
                        <div>
                          <div className="flex flex-wrap gap-1.5 mb-3 bg-white p-2.5 rounded-lg border border-neutral-200 min-h-12 items-center">
                            {activeResume.skills.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-neutral-100 border border-neutral-200 text-neutral-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-sans font-bold"
                              >
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSkillTag(tag)}
                                  className="text-neutral-400 hover:text-neutral-900 font-semibold cursor-pointer"
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
                        <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-200 pb-1.5">4. Jobs & Academic Projects</h3>
                        
                        {activeResume.workExperience.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {activeResume.workExperience.map((exp) => (
                              <div key={exp.id} className="p-2.5 bg-white rounded-lg border border-neutral-200 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-neutral-900">{exp.role}</p>
                                  <p className="text-xs text-neutral-400 font-bold">{exp.company} • {exp.duration}</p>
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
                          <p className="text-[11px] text-neutral-400 font-bold">Add Experience Entry</p>
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
                        <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-200 pb-1.5">5. Academic Credentials</h3>
                        
                        {activeResume.education.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {activeResume.education.map((edu) => (
                              <div key={edu.id} className="p-2.5 bg-white rounded-lg border border-neutral-200 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-neutral-900">{edu.degree}</p>
                                  <p className="text-xs text-neutral-450 font-bold">{edu.school} • {edu.duration} {edu.gpa ? `• GPA: ${edu.gpa}` : ""}</p>
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
                          <p className="text-[11px] text-neutral-400 font-bold">Add Education Degree</p>
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
                          className="px-8 py-4 bg-neutral-950 hover:bg-neutral-900 text-white font-semibold text-xs rounded-xl transition duration-150 cursor-pointer border border-neutral-200"
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
                  className="bg-white border border-neutral-200 rounded-2xl max-w-xl w-full overflow-hidden p-6 sm:p-8 animate-scaleUp text-left space-y-5 relative"
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
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  {/* Header Titles Based on State */}
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight text-black leading-tight">
                      {isAnalyzing
                        ? "Checking your resume..."
                        : analysisResult && !analysisResult.isResume
                          ? "Not a resume"
                          : "Upload your resume"
                      }
                    </h3>
                    <p className="text-sm text-neutral-500">
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
                    <div className="border border-neutral-200 rounded-xl p-8 flex flex-col items-center justify-center space-y-4 min-h-[200px]">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute" />
                        <span className="w-4 h-4 rounded-full bg-blue-500"></span>
                      </div>
                      <div className="space-y-1.5 text-center max-w-sm">
                        <p className="text-sm font-semibold text-neutral-800">Checking file...</p>
                        <p className="text-sm text-neutral-500 leading-relaxed">
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
                        className={`border border-dashed rounded-xl p-8 text-center transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center space-y-4 relative min-h-[180px] ${
                          dragActive 
                            ? "border-blue-500 bg-blue-50/40" 
                            : tempFile 
                              ? "border-emerald-500 bg-emerald-50/10" 
                              : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50"
                        }`}
                        onDragEnter={handleDragOverOrEnter}
                        onDragOver={handleDragOverOrEnter}
                        onDragLeave={handleDragOverOrEnter}
                        onDrop={handleFileDrop}
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-black">
                              Drop your file here, or <span className="text-blue-600">browse</span>
                            </p>
                            <p className="text-xs text-neutral-500">
                              PDF or Word (.docx)
                            </p>
                          </div>
                        </div>
                      </label>
                    </>
                  )}

                  {/* Invalid resume error */}
                  {showInvalidResumeCard && (
                    <div className="bg-rose-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-rose-900">{(analysisResult as any)?.scanned ? "We can't read this PDF" : "This doesn't look like a resume"}</p>
                          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                            {(analysisResult as any)?.scanned ? (analysisResult as any).reason : "We couldn't find resume sections like experience, education or skills. Try another file."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* File format / upload error */}
                  {uploadError && !isAnalyzing && !showInvalidResumeCard && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 text-rose-900 text-sm animate-fadeIn">
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
                      className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition duration-150 cursor-pointer border border-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    {showInvalidResumeCard && (
                      <button
                        type="button"
                        onClick={() => {
                          setTempFile(null);
                          setUploadError(null);
                          setAnalysisResult(null);
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg transition duration-150 border border-transparent cursor-pointer"
                      >
                        Try another file
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------------------- STEP 2: PASTE JOB DESCRIPTION & JD SIMPLIFIER -------------------- */}
        {false && (
          <div id="step-jd-panel" className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 relative">
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
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 font-semibold">Target Company Name</label>
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
                  <label className="block text-xs text-neutral-500 dark:text-neutral-400 font-semibold">Target Job Role/Title</label>
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
                <span className="text-xs text-neutral-400 dark:text-neutral-500 font-semibold">Load Sample Job Template:</span>
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
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 font-semibold">Full Raw Job Post Content</label>
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
              <div id="simplified-jd-section" className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-6">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2 font-display">
                  <CheckCircle2 className="w-5 h-5 text-neutral-900 dark:text-neutral-150" /> Simplified Job Analysis
                </h3>

                {/* Company Pitch */}
                <div className="bg-neutral-50 dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 mb-1">Company Elevator Pitch (No Jargon)</h4>
                  <p className="text-xs leading-relaxed text-neutral-750 dark:text-neutral-300 font-normal">
                    {simplifiedJd.companyPitch}
                  </p>
                </div>

                {/* Skills mapped out */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-500 mb-2">High Priority Required Core Stack</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").map((s, idx) => (
                        <span key={idx} className="bg-neutral-950 dark:bg-white text-white dark:text-black border border-neutral-800 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-black font-semibold"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "high").length === 0 && (
                        <span className="text-xs text-neutral-450 font-normal">None found.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-neutral-500 mb-2">Medium Priority / Preferred Skillsets</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").map((s, idx) => (
                        <span key={idx} className="bg-neutral-105 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500"></span> {s.name}
                        </span>
                      ))}
                      {simplifiedJd.requiredSkills.filter(s => s.priority === "medium").length === 0 && (
                        <span className="text-xs text-neutral-450 font-normal">None found.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Responsibilities list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 mb-2">What they expect you to do daily</h4>
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
                    <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-300 mb-2">Graduate Behavioral Expectations</h4>
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
                  <h4 className="text-xs font-bold text-neutral-500 mb-2">Target ATS Keyword Search Terms (Pass Filters)</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {simplifiedJd.keywordsToTarget.map((kw, idx) => (
                      <span key={idx} className="text-xs bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-850 text-neutral-800 dark:text-neutral-300 px-2.5 py-1 rounded-full font-semibold">
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
                    className="py-3 px-6 bg-neutral-950 dark:bg-white hover:opacity-90 text-white dark:text-black text-xs font-bold rounded-xl transition flex inline-flex items-center gap-1 justify-center cursor-pointer shadow-xs"
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
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 relative overflow-hidden">
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
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                    AI Recommendations ({suggestions.filter(s => !s.applied).length} pending)
                  </h4>
                  {suggestions.some(s => !s.applied) && (
                    <button
                      id="btn-apply-all-suggestions"
                      onClick={handleApplyAllSuggestions}
                      className="text-xs font-bold text-neutral-805 hover:text-black dark:text-neutral-300 dark:hover:text-white hover:underline flex items-center gap-1"
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
                            : "bg-white dark:bg-black border-transparent dark:border-neutral-800 text-neutral-800 dark:text-neutral-200"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                            {sug.section} suggestion • {sug.type} Standard
                          </span>
                          {sug.applied ? (
                            <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1 font-sans">
                              <Check className="w-3 h-3" /> Implemented
                            </span>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                id={`btn-reject-sug-${sug.id}`}
                                onClick={() => handleRejectSuggestion(sug.id)}
                                className="text-xs font-bold text-neutral-400 hover:text-neutral-600"
                              >
                                Skip
                              </button>
                              <button
                                id={`btn-accept-sug-${sug.id}`}
                                onClick={() => handleAcceptSuggestion(sug)}
                                className="text-xs font-bold text-neutral-900 dark:text-white hover:underline"
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
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
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
                    <div className="flex items-center gap-4 bg-neutral-50 dark:bg-black p-3.5 rounded-xl border border-transparent dark:border-neutral-800">
                      <div className="relative w-14 h-14 flex items-center justify-center rounded-full bg-neutral-950 dark:bg-white border border-neutral-800 dark:border-neutral-200 shadow-xs">
                        <span className="text-sm font-semibold text-white dark:text-black">
                          {atsResult.score}%
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white">
                          Verdict: {atsResult.passed ? "Strong Candidate (Passed)" : "Optimization Needed"}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5 font-normal">Automated screening metrics verified against corporate filters</p>
                      </div>
                    </div>

                    {/* Criteria checklist outputs */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {atsResult.criteria.map((item, idx) => (
                        <div key={idx} className="p-2.5 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-850 text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-neutral-805 dark:text-neutral-200 text-[11px]">{item.name}</span>
                            <span className={`text-xs font-bold ${item.passed ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-450 dark:text-neutral-500"}`}>
                              {item.passed ? "Passed" : "Action Required"}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mb-1 leading-normal font-sans">{item.description}</p>
                          <p className="text-xs text-neutral-700 dark:text-neutral-300 bg-white dark:bg-black border border-transparent dark:border-neutral-800 p-2 rounded leading-relaxed">{item.feedback}</p>
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
                    className="px-4 py-2 bg-neutral-950 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
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
                    className="px-4 py-2 bg-neutral-950 dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save as PDF</span>
                  </button>
                </div>
              </div>

              {/* Template Style Switcher inside preview box */}
              <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-xs text-neutral-500">Real-time Designer Canvas:</span>
                <div className="flex gap-1 bg-neutral-50 dark:bg-black p-1 rounded-xl border border-transparent dark:border-neutral-800 text-xs">
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
            <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 relative">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2 font-display">
                  <FolderOpen className="w-5 h-5 text-neutral-800 dark:text-neutral-200" /> Saved Resume Versions ({savedVersions.length})
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Manage independent tailored drafts labeled by employer targets and positions on single screen.
                </p>
              </div>

              {savedVersions.length === 0 ? (
                <div className="text-center py-12 bg-neutral-50 dark:bg-black rounded-2xl border border-transparent dark:border-neutral-800">
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
                      className="p-4 bg-neutral-50 dark:bg-black border border-transparent dark:border-neutral-800 rounded-xl hover:border-neutral-900 hover:bg-neutral-100/50 dark:hover:bg-neutral-900 cursor-pointer transition relative group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono text-[11px] font-bold text-neutral-500 bg-white dark:bg-neutral-900 px-2.5 py-1 rounded border border-neutral-200 dark:border-neutral-800">
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
                        <h4 className="text-xs font-semibold text-neutral-900 dark:text-white font-display mt-2">{version.companyName}</h4>
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-semibold mt-0.5">{version.jobTitle}</p>
                        <p className="text-xs text-neutral-500 mt-2">Candidate: {version.resumeData.fullName}</p>
                      </div>

                      <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3.5 mt-4 flex items-center justify-between text-xs text-neutral-500">
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
                  <p className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400 font-semibold">Crafted for Future Professionals</p>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1 max-w-sm mx-auto font-normal">
                    Optimizes graduate portfolios against modern recruitment trackers with absolute confidence.
                  </p>
                  <p className="text-xs text-neutral-500 mt-4">&copy; {new Date().getFullYear()} JD to Resume Customizer. Open Source Licensing.</p>
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
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn animate-fadeIn"
          >
            <div className="mx-auto w-16 h-16 rounded-full border border-neutral-200 flex items-center justify-center bg-amber-100 text-black">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight text-black">Resume Setup Required</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
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
                className="px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg transition cursor-pointer border border-transparent"
              >
                Go to Resume Setup
              </button>
              <button
                id="btn-alert-dismiss"
                onClick={() => setShowNoResumeAlert(false)}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200"
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
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full max-w-2xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              id="btn-close-preview-popup"
              onClick={() => setShowResumePreviewModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-5 text-left">
              <h3 className="text-lg font-semibold tracking-tight text-black">Original resume</h3>
              <p className="text-sm text-neutral-500 mt-0.5">As uploaded, before any tailoring.</p>
            </div>

            {/* Body: scrollable preview */}
            <div className="flex-1 overflow-y-auto pr-1 border border-neutral-200 rounded-xl mb-6 bg-neutral-50 p-4">
              {(() => {
                const previewResume = savedUserResumes.find(r => r.id === previewResumeId);
                if (!previewResume) return <p className="text-sm text-neutral-500">No resume selected.</p>;

                return <ResumePreview resume={previewResume.data} templateStyle="classic" />;
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-lg transition cursor-pointer border border-transparent flex items-center justify-center gap-1.5"
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
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              id="btn-close-delete-confirm"
              onClick={() => setShowDeleteConfirmModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-rose-50 text-rose-600">
              <Trash2 className="w-5 h-5" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight text-black">Delete Resume?</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-lg transition cursor-pointer border border-transparent"
              >
                Yes, Delete
              </button>
              <button
                id="btn-confirm-delete-cancel"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setResumeToDeleteId(null);
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200"
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
            className="bg-white border border-neutral-200 rounded-2xl max-w-xl w-full p-6 sm:p-8 animate-scaleUp text-left space-y-6 relative flex flex-col max-h-[90vh]"
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
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="space-y-1 text-left">
              <h3 className="text-lg font-semibold tracking-tight text-black leading-tight">
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
                  className={`p-4 bg-white border border-neutral-200 rounded-xl text-left transition-all duration-150 cursor-pointer flex items-center justify-between ${
                    choiceModalPathway === "upload" ? "ring-2 ring-blue-500 bg-blue-50/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border border-neutral-200 flex items-center justify-center bg-white`}>
                      {choiceModalPathway === "upload" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-800 font-sans">Upload Resume</p>
                      <p className="text-xs text-neutral-500 font-medium font-sans">PDF or DOCX file</p>
                    </div>
                  </div>
                </button>

                {/* Create Card (Disabled - Coming Soon) */}
                <button
                  type="button"
                  disabled
                  className="p-4 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl text-left flex items-center justify-between opacity-70 cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border border-neutral-300 flex items-center justify-center bg-neutral-100">
                      {/* Empty circle since it cannot be selected */}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-neutral-400 font-sans">Create Resume</p>
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[11px] font-semibold">
                          Coming Soon
                        </span>
                      </div>
                      <p className="text-xs text-neutral-450 font-medium font-sans">Manual form builder will be available in a future release</p>
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
                    <div className="border border-neutral-200 rounded-xl p-8 flex flex-col items-center justify-center space-y-4 min-h-[200px]">
                      <div className="relative w-14 h-14 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute" />
                        <span className="w-4 h-4 rounded-full bg-blue-500"></span>
                      </div>
                      <div className="space-y-1.5 text-center max-w-sm">
                        <p className="text-sm font-semibold text-neutral-800">Scanning structure...</p>
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
                        className={`border border-dashed rounded-xl p-8 text-center transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center space-y-4 relative min-h-[180px] ${
                          dragActive 
                            ? "border-blue-500 bg-blue-50/40" 
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
                          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-neutral-800 tracking-tight font-sans">
                              Drag and drop file here, or browse files
                            </p>
                            <p className="text-xs text-neutral-455 font-bold">
                              Supported formats: PDF, DOCX
                            </p>
                          </div>
                        </div>
                      </label>
                    </>
                  )}

                  {/* Invalid resume error */}
                  {showInvalidResumeCard && (
                    <div className="bg-rose-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-rose-900">{(analysisResult as any)?.scanned ? "We can't read this PDF" : "This doesn't look like a resume"}</p>
                          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                            {(analysisResult as any)?.scanned ? (analysisResult as any).reason : "We couldn't find resume sections like experience, education or skills. Try another file."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {uploadError && !isAnalyzing && !showInvalidResumeCard && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 text-rose-900 text-sm animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <span>{formatFriendlyError(uploadError)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* PATHWAY 2: CREATE RESUME */}
              {choiceModalPathway === "create" && (
                <div className="border border-neutral-200 bg-neutral-50/40 rounded-2xl p-5 space-y-3.5 text-left animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Manual Form Builder</p>
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
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition duration-150 cursor-pointer border border-neutral-200 disabled:opacity-50"
              >
                Cancel
              </button>
                    {showInvalidResumeCard && (
                      <button
                        type="button"
                        onClick={() => {
                          setTempFile(null);
                          setUploadError(null);
                          setAnalysisResult(null);
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg transition duration-150 border border-transparent cursor-pointer"
                      >
                        Try another file
                      </button>
                    )}

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
                  className="w-full sm:w-auto px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg transition duration-150 border border-transparent cursor-pointer"
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
              closeTailorWizard();
            }
          }}
        >
          <div 
            id="tailor-wizard-modal" 
            className={`bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full text-left relative animate-scaleIn flex flex-col max-h-[95vh] ${tailorWizardStep >= 4 ? "max-w-4xl" : "max-w-2xl"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            {!tailorIsAnalyzing && (
              <button
                id="btn-close-tailor-wizard"
                onClick={() => closeTailorWizard()}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {showCloseDraftConfirm && (
              <div id="close-draft-confirm" className="absolute inset-0 z-20 bg-white/85 rounded-2xl flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
                <div className="bg-white border border-neutral-200 rounded-xl p-5 max-w-sm w-full shadow-lg">
                  <p className="text-base font-semibold text-black">Close without saving?</p>
                  <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
                    The edits for this job will be lost. If AI was used, today's AI tailoring still counts.
                  </p>
                  <div className="mt-4 flex gap-2 justify-end">
                    <button type="button" id="btn-keep-editing" onClick={() => setShowCloseDraftConfirm(false)} className="px-3 py-2 text-sm font-medium text-white bg-black hover:bg-neutral-800 rounded-lg cursor-pointer">
                      Keep editing
                    </button>
                    <button type="button" id="btn-discard-draft" onClick={() => closeTailorWizard(true)} className="px-3 py-2 text-sm font-medium text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer">
                      Discard and close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="mb-5 text-left">
              <h3 className="text-lg font-semibold tracking-tight text-black">Tailor resume for a job</h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                {tailorAnalysisError ? "Something went wrong" : (
                  <>
                    {tailorWizardStep === 1 && "Step 1 of 4 · Company & resume"}
                    {tailorWizardStep === 2 && "Step 2 of 4 · Job description"}
                    {tailorWizardStep === 3 && "Step 3 of 4 · Choose skills"}
                    {tailorWizardStep === 4 && "Step 4 of 4 · Review and download"}
                  </>
                )}
              </p>
              {!tailorAnalysisError && (
                <div className="flex gap-1.5 mt-4" aria-hidden="true">
                  {[1, 2, 3, 4].map((s) => (
                    <div
                      key={s}
                      className={`h-1 flex-1 rounded-full transition-colors duration-300 ${s <= tailorWizardStep ? "bg-black" : "bg-neutral-200"}`}
                    />
                  ))}
                </div>
              )}
              {/* Daily AI limit */}
              {aiCredits?.aiEnabled && tailorWizardStep <= 3 && !tailorAnalysisError && (
                aiCredits.status === "limit-reached" ? (
                  <div id="ai-limit-note" className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 leading-relaxed">
                    You've used today's {aiCredits.limit} AI {aiCredits.limit === 1 ? "tailoring" : "tailorings"}. This one uses basic mode: your ticked skills are added and keywords are checked, but lines aren't rewritten. AI is back {resetsInText(aiCredits.resetsAt)}.
                    {currentUser?.isGuest && " Create a free account for 5 a day."}
                  </div>
                ) : aiCredits.status === "ok" ? (
                  <p id="ai-credits-left" className="mt-3 text-xs text-neutral-500">
                    AI tailorings left today: {aiCredits.remaining} of {aiCredits.limit}
                  </p>
                ) : aiCredits.status === "not-signed-in" ? (
                  <p className="mt-3 text-xs text-amber-700">Your sign-in has expired, so this uses basic mode (no AI). Sign in again to use AI.</p>
                ) : null
              )}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 py-2">
              
              {/* Loader */}
              {tailorIsAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4 min-h-[300px]">
                  <p className="text-base font-semibold text-black">
                    {tailorProcessingStage}…
                  </p>
                  <div className="w-full max-w-sm">
                    <div className="h-1 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#2563eb] transition-all duration-300" style={{ width: `${tailorProgress}%` }} />
                    </div>
                  </div>
                  <ul className="w-full max-w-sm space-y-1.5 text-sm">
                    {processingStages.map((stage, idx) => {
                      const currentIdx = processingStages.findIndex(st => st.label === tailorProcessingStage);
                      const state = idx < currentIdx ? "done" : idx === currentIdx ? "current" : "waiting";
                      return (
                        <li key={stage.label} className={`flex items-center gap-2 ${state === "waiting" ? "text-neutral-400" : state === "current" ? "text-black font-medium" : "text-neutral-500"}`}>
                          {state === "done" ? <Check className="w-4 h-4 text-emerald-600" /> : state === "current" ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <span className="w-4 h-4 rounded-full border border-neutral-300 inline-block" />}
                          {stage.label}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-neutral-500 text-center max-w-sm">
                    This usually takes 5 to 20 seconds.
                  </p>
                </div>
              )}

              {/* Error Screen */}
              {!tailorIsAnalyzing && tailorAnalysisError && (
                <div className="flex flex-col items-center justify-center py-12 space-y-6 min-h-[300px] text-center animate-fadeIn">
                  <div className="p-4 bg-rose-100 border border-neutral-200 rounded-full">
                    <XCircle className="w-12 h-12 text-rose-600" strokeWidth={2.5} />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <h4 className="text-base font-semibold text-black tracking-tight">
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
                        if (tailorJdAnalysis) handleAnalyzeAndGenerate(); else handleAnalyzeJd();
                      }}
                      className="flex-1 px-4 py-3 bg-[#2563eb] hover:bg-blue-600 text-white font-semibold text-[11px] rounded-xl border border-transparent transition cursor-pointer"
                    >
                      Retry Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTailorAnalysisError(null);
                      }}
                      className="flex-1 px-4 py-3 bg-white hover:bg-neutral-50 text-black font-semibold text-[11px] rounded-xl border border-neutral-200 transition cursor-pointer"
                    >
                      Back to Editing
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1: COMPANY NAME & CHOOSE RESUME */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 1 && (
                <div className="space-y-4 text-left py-1 w-full">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-neutral-800 mb-1.5">Company name</label>
                      <input
                        type="text"
                        placeholder="e.g. Google, Vercel"
                        value={tailorCompany}
                        autoFocus
                        onChange={(e) => { setTailorCompany(e.target.value); setTailorStepError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (!tailorCompany.trim()) { setTailorStepError("Please enter the company name."); return; }
                            setTailorStepError(null);
                            setTailorWizardStep(2);
                          }
                        }}
                        aria-invalid={!!tailorStepError}
                        className={`w-full bg-white border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 ${tailorStepError ? "border-rose-600" : "border-neutral-300"}`}
                      />
                      {tailorStepError ? (
                        <p className="text-xs font-bold text-rose-600 pt-1" role="alert">{tailorStepError}</p>
                      ) : (
                        <p className="text-xs text-neutral-500 font-medium pt-1">Used to name your tailored resume.</p>
                      )}
                    </div>
                    
                    {/* Choose Resume field */}
                    {existingResumes.length >= 2 && (
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-neutral-800 mb-1.5">Resume</label>
                        <select
                          value={tailorSelectedResumeKey}
                          onChange={(e) => setTailorSelectedResumeKey(e.target.value)}
                          className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 cursor-pointer"
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
                    <label className="block text-sm font-medium text-neutral-800 mb-1.5">Job description</label>
                    <textarea
                      placeholder="Paste the full job description text here..."
                      value={tailorJdText}
                      autoFocus
                      onChange={(e) => { setTailorJdText(e.target.value); setTailorStepError(null); }}
                      aria-invalid={!!tailorStepError}
                      className={`w-full bg-white border rounded-lg px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100 h-56 ${tailorStepError ? "border-rose-600" : "border-neutral-300"}`}
                    />
                    {(() => {
                      const wordCount = tailorJdText.trim() ? tailorJdText.trim().split(/\s+/).length : 0;
                      const tooShort = wordCount > 0 && wordCount < 50;
                      return (
                        <div className="flex items-start justify-between gap-3 pt-1">
                          {tailorStepError ? (
                            <p className="text-xs font-bold text-rose-600" role="alert">{tailorStepError}</p>
                          ) : (
                            <p className="text-xs text-neutral-500 font-medium">
                              Paste the whole posting, including requirements and responsibilities.{" "}
                              {!tailorJdText.trim() && (
                                <button type="button" id="btn-sample-jd" onClick={() => { setTailorJdText(SAMPLE_JOB_POST); setTailorStepError(null); }} className="text-blue-700 hover:underline cursor-pointer">
                                  No job post handy? Use a sample
                                </button>
                              )}
                            </p>
                          )}
                          <span className={`text-xs font-bold whitespace-nowrap ${tooShort ? "text-rose-600" : "text-neutral-500"}`}>
                            {wordCount} {wordCount === 1 ? "word" : "words"}{wordCount < 50 ? " · min 50" : ""}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* STEP 3: CHOOSE SKILLS FROM THE JOB DESCRIPTION */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 3 && (() => {
                const have = tailorSkillOptions.filter(o => o.inResume);
                const missing = tailorSkillOptions.filter(o => !o.inResume);
                const isSelected = (name: string) => tailorSelectedSkills.some(n => n.toLowerCase() === name.toLowerCase());
                const toggleSkill = (name: string) =>
                  setTailorSelectedSkills(prev => isSelected(name) ? prev.filter(n => n.toLowerCase() !== name.toLowerCase()) : [...prev, name]);
                const customAdded = tailorSelectedSkills.filter(n => !tailorSkillOptions.some(o => o.name.toLowerCase() === n.toLowerCase()));
                const addCustomSkill = () => {
                  const value = tailorCustomSkill.trim();
                  if (!value) return;
                  const alreadyListed = isSelected(value) || have.some(o => o.name.toLowerCase() === value.toLowerCase());
                  if (!alreadyListed) setTailorSelectedSkills(prev => [...prev, value]);
                  setTailorCustomSkill("");
                };
                return (
                  <div className="space-y-6 text-left animate-fadeIn">
                    {tailorRoleCheck && (
                      <div className="rounded-xl bg-amber-50 p-4 space-y-3" id="career-switch-check">
                        <p className="text-sm text-amber-900 leading-relaxed">
                          This job is in <span className="font-medium">{tailorRoleCheck.jobFamily.label}</span>, but your most recent role is{" "}
                          <span className="font-medium">{tailorRoleCheck.resumeRole}</span> ({tailorRoleCheck.resumeFamily.label}). Are you switching careers?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            id="btn-career-switch-yes"
                            onClick={() => setTailorIsSwitching(true)}
                            aria-pressed={tailorIsSwitching === true}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${tailorIsSwitching === true ? "bg-black border-black text-white" : "bg-white border-amber-200 text-amber-900 hover:bg-amber-100"}`}
                          >
                            Yes, I'm switching
                          </button>
                          <button
                            type="button"
                            id="btn-career-switch-no"
                            onClick={() => setTailorIsSwitching(false)}
                            aria-pressed={tailorIsSwitching === false}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${tailorIsSwitching === false ? "bg-black border-black text-white" : "bg-white border-amber-200 text-amber-900 hover:bg-amber-100"}`}
                          >
                            No, tailor as usual
                          </button>
                        </div>
                        {tailorIsSwitching === true && (
                          <div className="space-y-3">
                            <p className="text-xs text-amber-800 leading-relaxed">
                              We'll frame your resume around transferable skills and won't present you as already working in {tailorRoleCheck.jobFamily.label}. Tick only skills you've really used, even in side projects or courses.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="block">
                                <span className="text-xs font-medium text-amber-900">Courses or certificates for this switch <span className="font-normal text-amber-700">(optional)</span></span>
                                <textarea
                                  id="input-switch-certs"
                                  value={tailorSwitchCerts}
                                  onChange={(e) => setTailorSwitchCerts(e.target.value)}
                                  rows={3}
                                  placeholder={"One per line, links welcome\nGoogle Project Management Certificate - coursera.org/verify/ABC123"}
                                  className="mt-1 w-full p-2 text-sm bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 placeholder:text-neutral-400"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-medium text-amber-900">Side projects for this switch <span className="font-normal text-amber-700">(optional)</span></span>
                                <textarea
                                  id="input-switch-projects"
                                  value={tailorSwitchProjects}
                                  onChange={(e) => setTailorSwitchProjects(e.target.value)}
                                  rows={3}
                                  placeholder={"One per line: name - what you did\nPRD for a habit app - wrote specs and ran 10 user interviews"}
                                  className="mt-1 w-full p-2 text-sm bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400 placeholder:text-neutral-400"
                                />
                              </label>
                            </div>
                            <p className="text-xs text-amber-700">These go on this tailored resume as your own facts. Add only what you've really done.</p>
                          </div>
                        )}
                        {tailorIsSwitching === false && (
                          <p className="text-xs text-amber-800 leading-relaxed">
                            We'll tailor as usual. Expect a lower match, since your experience is mostly in {tailorRoleCheck.resumeFamily.label}.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      {tailorSkillOptions.length > 0
                        ? `This job asks for ${tailorSkillOptions.length} key ${tailorSkillOptions.length === 1 ? "skill" : "skills"}. Tick the ones you really have. Only ticked skills are added to your tailored resume.`
                        : "We couldn't pick out specific skills from this job description. You can add skills you have below, or continue without adding any."}
                    </p>

                    {missing.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-medium text-black">
                            Not in your resume yet <span className="text-neutral-400 font-normal">{missing.length}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setTailorSelectedSkills(prev => {
                              const allOn = missing.every(o => prev.some(n => n.toLowerCase() === o.name.toLowerCase()));
                              return allOn
                                ? prev.filter(n => !missing.some(o => o.name.toLowerCase() === n.toLowerCase()))
                                : [...prev, ...missing.map(o => o.name).filter(n => !prev.some(x => x.toLowerCase() === n.toLowerCase()))];
                            })}
                            className="text-xs text-neutral-500 hover:text-black cursor-pointer"
                          >
                            {missing.every(o => isSelected(o.name)) ? "Clear all" : "Select all"}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                          {missing.map((o, i) => (
                            <label
                              key={o.name}
                              htmlFor={`skill-option-${i}`}
                              className="flex items-center gap-2.5 py-2.5 border-b border-neutral-100 text-sm text-neutral-800 cursor-pointer select-none hover:text-black"
                            >
                              <input
                                id={`skill-option-${i}`}
                                type="checkbox"
                                checked={isSelected(o.name)}
                                onChange={() => toggleSkill(o.name)}
                                className="w-4 h-4 accent-blue-600 cursor-pointer"
                              />
                              {o.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="custom-skill-input" className="block text-sm font-medium text-black">
                        Add another skill from this job
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="custom-skill-input"
                          type="text"
                          value={tailorCustomSkill}
                          onChange={(e) => setTailorCustomSkill(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }}
                          placeholder="e.g. Kafka"
                          className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
                        />
                        <button
                          type="button"
                          onClick={addCustomSkill}
                          className="px-3 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg border border-neutral-200 transition cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                      {customAdded.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {customAdded.map(n => (
                            <span key={n} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium pl-2 pr-1 py-0.5 rounded-md">
                              {n}
                              <button
                                type="button"
                                onClick={() => toggleSkill(n)}
                                className="p-0.5 rounded hover:bg-blue-100 cursor-pointer"
                                aria-label={`Remove ${n}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {have.length > 0 && (
                      <div className="space-y-2 pt-4 border-t border-neutral-200">
                        <p className="text-sm font-medium text-black">
                          Already in your resume <span className="text-neutral-400 font-normal">{have.length}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {have.map(o => (
                            <span key={o.name} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-md">
                              <Check className="w-3 h-3" />
                              {o.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* STEP 4: RESULTS & DOWNLOAD (Tailored Resume only) */}
              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 4 && (
                (() => {
                  const pickedResume = getResumeToTailor();
                  const originalResume = pickedResume && tailorIsSwitching ? addSwitchExtras(pickedResume, tailorSwitchCerts, tailorSwitchProjects) : pickedResume;
                  const tailoredResume = tailoredResultResume;

                  if (!originalResume || !tailoredResume) return null;

                  const tailoredEval = calculateRealisticAtsScore(
                    tailoredResume,
                    tailorAnalysisResult?.simplifiedJdObject || { companyPitch: "", requiredSkills: [], keyResponsibilities: [], candidateExpectations: [], keywordsToTarget: [] }
                  );

                  // How many visible edits the tailoring step made (inline additions, new bullets, skills, sections)
                  const changeCount =
                    (Object.values(tailoredResult?.inlineAdditions || {}) as unknown[][]).reduce((n: number, adds) => n + (adds?.length || 0), 0) +
                    (Object.values(tailoredResult?.newBullets || {}) as unknown[][]).reduce((n: number, bs) => n + (bs?.length || 0), 0) +
                    (tailoredResult?.newSkills?.length || 0) +
                    (tailoredResult?.newSections?.length || 0);
                  // Gemini returns a full rewrite with no highlight data; rules mode returns highlight edits
                  const isFullRewrite = !tailoredResult;
                  const hasChanges = changeCount > 0;
                  const matchedKw = (tailoredEval.matchedKeywords || []).map(k => displaySkillName(k, tailoredResume));
                  const missingKw = (tailoredEval.missingKeywords || []).map(k => displaySkillName(k, tailoredResume));
                  const totalKw = matchedKw.length + missingKw.length;

                  return (
                    <div className="space-y-4 text-left py-2 animate-fadeIn font-sans">
                      {/* Summary: what happened + score */}
                      <div className="flex items-start justify-between gap-6">
                        <p className="text-sm text-neutral-600 leading-relaxed max-w-xl">
                          {isFullRewrite
                            ? (tailorReviews.some(r => !r.resultOnly)
                              ? (() => {
                                const safe = tailorReviews.filter(r => !r.resultOnly && r.status === "accepted").length;
                                const held = tailorReviews.filter(r => !r.resultOnly && r.status === "pending").length;
                                const first = safe ? `${safe} ${safe === 1 ? "edit is" : "edits are"} already in your resume.` : "Your wording is kept as you wrote it.";
                                return `${first}${held ? ` ${held} more ${held === 1 ? "needs" : "need"} your OK (in orange).` : ""} Download when you're happy.`;
                              })()
                              : "Your resume is ready with your ticked skills added. No other changes were suggested.")
                            : hasChanges
                            ? `Your tailored resume is ready with ${changeCount} ${changeCount === 1 ? "change" : "changes"}. Highlighted text shows what changed. Your original resume is not modified.`
                            : "Your resume is ready. No wording changes were needed, so everything is exactly as you wrote it. The keyword check below shows what this job asks for."}
                          {isFullRewrite && (
                            <span className="block mt-1.5 text-xs font-medium text-amber-700">AI can make mistakes. Please recheck every line before you send it.</span>
                          )}
                        </p>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-neutral-500">ATS score</p>
                          <p className="text-2xl font-semibold text-emerald-600 leading-tight" id="ats-score-now">
                            {typeof tailorAnalysisResult?.originalAtsScore === "number" && tailorAnalysisResult.originalAtsScore < tailoredEval.score && (
                              <span className="text-base font-medium text-neutral-400 mr-1.5" id="ats-score-before" title="Your resume before tailoring">{tailorAnalysisResult.originalAtsScore}% →</span>
                            )}
                            {tailoredEval.score}%
                          </p>
                        </div>
                      </div>

                      {/* Keyword match: what the job asks for vs. what the resume shows */}
                      {totalKw > 0 && (
                        <details id="keyword-match" className="border border-neutral-200 rounded-xl bg-white">
                        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-black">
                          Keywords this job asks for: {matchedKw.length} of {totalKw} in your resume
                        </summary>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 px-4 pb-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-black">
                              In your resume <span className="text-neutral-400 font-normal">{matchedKw.length} of {totalKw}</span>
                            </p>
                            {matchedKw.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {matchedKw.map((kw) => (
                                  <span key={kw} className="bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-md">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-neutral-500">None of this job's key skills appear in your resume yet.</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-black">
                              Asked for, not found <span className="text-neutral-400 font-normal">{missingKw.length}</span>
                            </p>
                            {missingKw.length > 0 ? (
                              <>
                                <div className="flex flex-wrap gap-1.5">
                                  {missingKw.map((kw) => (
                                    <span key={kw} className="bg-neutral-100 text-neutral-600 text-xs font-medium px-2 py-0.5 rounded-md">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-neutral-500 leading-snug">
                                  Add these only if you have real experience with them.
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-neutral-500">Your resume covers every key skill this job lists.</p>
                            )}
                          </div>
                        </div>
                        </details>
                      )}

                      {/* Career switch note */}
                      {tailorIsSwitching && tailorRoleCheck && (
                        <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed" id="career-switch-note">
                          {isFullRewrite
                            ? `Career switch: suggestions focus on what carries over from ${tailorRoleCheck.resumeFamily.label} to ${tailorRoleCheck.jobFamily.label}. None of them should claim you've already worked in ${tailorRoleCheck.jobFamily.label}.`
                            : `Career switch tip: add one line to your summary about the move, for example "${tailorRoleCheck.resumeRole} moving into ${tailorRoleCheck.jobFamily.label}, with hands-on experience in …".${aiCredits?.status === "limit-reached" ? ` AI rewrites are back ${resetsInText(aiCredits.resetsAt)}.` : ""}`}
                        </p>
                      )}

                      {/* Basic mode because the AI services were down */}
                      {!isFullRewrite && aiCredits?.aiEnabled && aiCredits.status === "ai-unavailable" && (
                        <p id="ai-down-result-note" className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                          Our AI is busy right now, so this was made in basic mode: your ticked skills were added, but no lines were rewritten. Try again in a few minutes for AI suggestions. This didn't use up one of your AI tailorings.
                        </p>
                      )}

                      {/* Basic mode because today's AI limit is used up */}
                      {!isFullRewrite && aiCredits?.aiEnabled && aiCredits.status === "limit-reached" && (
                        <p id="ai-limit-result-note" className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                          Made in basic mode because today's AI limit is used up: your ticked skills were added, but no lines were rewritten. AI is back {resetsInText(aiCredits.resetsAt)}.
                        </p>
                      )}

                      {/* Before and after, side by side: safe edits already in, claims wait for one click */}
                      {isFullRewrite && tailorReviewBase && (
                        <ResumeReview original={tailorReviewBase.original} current={tailoredResultResume || tailorReviewBase.original} reviews={tailorReviews} onChange={updateEditReviews} />
                      )}

                      {/* Highlight controls, only when something actually changed */}
                      {hasChanges && !isFullRewrite && (
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <label htmlFor="toggle-highlights-cb" className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              id="toggle-highlights-cb"
                              checked={showHighlights}
                              onChange={(e) => setShowHighlights(e.target.checked)}
                              className="w-4 h-4 cursor-pointer accent-blue-600"
                            />
                            Highlight changes
                          </label>
                          {showHighlights && (
                            <div className="flex items-center gap-3 text-xs text-neutral-600">
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#BAE6FD] inline-block"></span> Added</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#FEF08A] inline-block"></span> Improved</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Single Panel Tailored Resume (basic mode; AI mode shows before/after above) */}
                      {!isFullRewrite && <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white w-full">
                        <div className="overflow-y-auto bg-neutral-50" style={{height: '60vh'}}>
                          <ResumePreview
                            resume={isFullRewrite ? tailoredResume : (originalResume && tailoredResultResume
                              // basic mode: show the same trimmed skills row the download will have
                              ? { ...originalResume, skills: (originalResume.skills || []).filter(sk => (tailoredResultResume.skills || []).includes(sk)) }
                              : originalResume)}
                            tailored={tailoredResult || undefined}
                            templateStyle={selectedStyle}
                            id="step-3-preview-tailored"
                            showHighlights={showHighlights}
                          />
                        </div>
                      </div>}
                    </div>
                  );
                })()
              )}

              {!tailorIsAnalyzing && !tailorAnalysisError && tailorWizardStep === 4 && tailoredResultResume && (
                <div className="space-y-3 text-left pb-2 animate-fadeIn font-sans" id="tailor-final-step">
                  {(() => {
                    const current = tailoredResultResume.skills || [];
                    const lower = new Set(current.map(sk => sk.toLowerCase()));
                    // skills left out of the top 10, plus any the person added and then unticked
                    const others = tailorSkillPool.filter(sk => !lower.has(sk.toLowerCase()));
                    const added = current.filter(sk => !tailorSkillPool.slice(0, 10).some(p => p.toLowerCase() === sk.toLowerCase()));
                    const choices = [...added, ...others];
                    const toggle = (sk: string) => setFinalSkills(lower.has(sk.toLowerCase()) ? current.filter(c => c.toLowerCase() !== sk.toLowerCase()) : [...current, sk]);
                    const addOwn = () => {
                      const name = extraSkillInput.trim().replace(/\s+/g, " ");
                      if (!name) return;
                      if (!lower.has(name.toLowerCase())) setFinalSkills([...current, name]);
                      setExtraSkillInput("");
                    };
                    return (
                      <div id="final-skills-note" className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700 leading-relaxed">
                        <p>
                          Skills: we picked your 10 best, the ones this job asks for first, then your others. A short list is easier for recruiters to read.{" "}
                          <button type="button" id="btn-more-skills" onClick={() => setShowMoreSkills(v => !v)} className="font-medium text-blue-700 hover:underline cursor-pointer">
                            {showMoreSkills ? "Done" : "Add more skills"}
                          </button>
                        </p>
                        {showMoreSkills && (
                          <div className="mt-2 space-y-2">
                            {choices.length > 0 && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                {choices.map(sk => (
                                  <label key={sk} className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input type="checkbox" checked={lower.has(sk.toLowerCase())} onChange={() => toggle(sk)} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                                    {sk}
                                  </label>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                id="input-extra-skill"
                                value={extraSkillInput}
                                onChange={(e) => setExtraSkillInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addOwn(); }}
                                placeholder="Add your own skill, e.g. Jira"
                                className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-neutral-400"
                              />
                              <button type="button" onClick={addOwn} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 cursor-pointer">Add</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    // Quick recruiter checks; they only point things out, nothing changes on its own
                    let pages = 1;
                    try { pages = buildResumePdf(tailoredResultResume, "", "classic").getNumberOfPages(); } catch { /* keep 1 */ }
                    const checks = checkResume(tailoredResultResume, pages);
                    const passed = checks.filter(c => c.ok).length;
                    return (
                      <details id="resume-checks" className="mb-3 border border-neutral-200 rounded-xl bg-white" open={passed < checks.length}>
                        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-black flex items-center gap-2">
                          {passed === checks.length ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                          Resume checks: {passed} of {checks.length} look good
                        </summary>
                        <ul className="px-4 pb-3 space-y-2">
                          {checks.map(c => (
                            <li key={c.id} id={`check-${c.id}`} className="flex items-start gap-2 text-sm">
                              {c.ok ? <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />}
                              <div>
                                <p className={c.ok ? "text-neutral-700" : "text-black font-medium"}>{c.label}</p>
                                {!c.ok && c.detail && <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{c.detail}</p>}
                              </div>
                            </li>
                          ))}
                          {passed < checks.length && (
                            <li className="text-xs text-neutral-500 pt-1">To fix one, click the line above and edit it.</li>
                          )}
                        </ul>
                      </details>
                    );
                  })()}
                  <div id="resume-color-picker" className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-black">Colour</span>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Resume colour">
                      {RESUME_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={resumeColor === c.id}
                          id={`color-${c.id}`}
                          title={c.label}
                          onClick={() => setResumeColor(c.id)}
                          className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-xs transition cursor-pointer ${resumeColor === c.id ? "border-black bg-neutral-100 text-black font-semibold" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}
                        >
                          <span className="w-4 h-4 rounded-full inline-block" style={{ background: c.hex }} />
                          {c.id === "classic" ? "Black" : c.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] text-neutral-500">Only the name, headings and lines change. Applies to PDF and Word.</span>
                  </div>
                  {(!feedbackAsked || reviewFeedbackSent) && (
                    <div className="border border-neutral-200 rounded-xl p-4 bg-white" id="review-feedback">
                      <FeedbackBox
                        title="How is this resume?"
                        onSend={async (rating, comment) => { setReviewFeedbackSent(true); await handleSendFeedback(rating, comment, "review_screen"); }}
                        onSkip={markFeedbackAsked}
                      />
                    </div>
                  )}
                  <details id="full-preview" className="border border-neutral-200 rounded-xl overflow-hidden bg-white w-full">
                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold text-black">See the full resume as it will download</summary>
                    <div className="overflow-y-auto bg-neutral-50 resume-accent-preview" style={{height: '62vh', ["--resume-accent" as any]: resumeColor === "classic" ? undefined : resumeColorHex(resumeColor)}}>
                      <ResumePreview
                        resume={tailoredResultResume}
                        templateStyle={selectedStyle}
                        id="step-5-preview-final"
                        showHighlights={false}
                      />
                    </div>
                  </details>
                </div>
              )}

              {/* Small "downloaded" popup with the other format and a way back to editing */}
              {tailorDownloaded && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 animate-fadeIn" onClick={() => setTailorDownloaded(null)}>
                  <div id="download-done-popup" role="dialog" aria-label="Resume downloaded" className="bg-white rounded-2xl border border-neutral-200 p-6 w-full max-w-sm text-left space-y-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-black">Resume downloaded</p>
                        <p className="text-sm text-neutral-600 mt-1 break-all">{tailorDownloaded.fileName}</p>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-600">You can also download it as {tailorDownloaded.format === "pdf" ? "a Word file" : "a PDF"}.</p>
                    {!feedbackAsked && (
                      <div className="border border-neutral-200 rounded-xl p-4">
                        <FeedbackBox onSend={(rating, comment) => handleSendFeedback(rating, comment, "after_download")} onSkip={markFeedbackAsked} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button type="button" onClick={() => downloadTailored(tailorDownloaded.format === "pdf" ? "docx" : "pdf")} className="px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 text-black hover:bg-neutral-50 transition-colors cursor-pointer">
                        Download {tailorDownloaded.format === "pdf" ? "DOCX" : "PDF"}
                      </button>
                      <button type="button" onClick={() => setTailorDownloaded(null)} className="px-3 py-1.5 bg-[#2563eb] hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer">
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {/* Modal Footer */}
            {!tailorIsAnalyzing && !tailorAnalysisError && (
              <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-neutral-100 mt-4 justify-end font-sans">
                {tailorWizardStep === 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => closeTailorWizard()}
                      className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg border border-neutral-200 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tailorCompany.trim()) {
                          setTailorStepError("Please enter the company name.");
                          return;
                        }
                        setTailorStepError(null);
                        setTailorWizardStep(2);
                      }}
                      className="px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg border border-transparent transition cursor-pointer"
                    >
                      Continue
                    </button>
                  </>
                )}

                {tailorWizardStep === 2 && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setTailorStepError(null); setTailorWizardStep(1); }}
                      className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg border border-neutral-200 transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeJd}
                      className="px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg border border-transparent transition cursor-pointer"
                    >
                      Next: choose skills
                    </button>
                  </>
                )}

                {tailorWizardStep === 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setTailorWizardStep(2)}
                      className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg border border-neutral-200 transition cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      id="btn-tailor-with-skills"
                      onClick={handleAnalyzeAndGenerate}
                      className="px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg border border-transparent transition cursor-pointer"
                    >
                      {tailorSelectedSkills.length > 0
                        ? `Tailor resume with ${tailorSelectedSkills.length} new ${tailorSelectedSkills.length === 1 ? "skill" : "skills"}`
                        : "Tailor resume"}
                    </button>
                  </>
                )}

                {tailorWizardStep === 4 && (
                  <>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-semibold mr-auto">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-emerald-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      Original resume unchanged
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadTailored("pdf")}
                      className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200 flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTailored("docx")}
                      className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200 flex items-center justify-center gap-1.5"
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
                      className="px-4 py-2 bg-[#2563eb] hover:bg-blue-600 text-white font-medium text-sm rounded-lg border border-transparent transition cursor-pointer"
                    >
                      Done
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
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full max-w-5xl text-left relative animate-scaleIn flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              id="btn-close-version-preview"
              onClick={() => setShowSavedVersionPreviewModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="mb-5 text-left">
              <h3 className="text-lg font-semibold tracking-tight text-black">{selectedSavedVersion.companyName}</h3>
              <p className="text-sm text-neutral-500 mt-0.5">
                Tailored resume{selectedSavedVersion.jobTitle && selectedSavedVersion.jobTitle !== "Tailored Position" ? ` · ${selectedSavedVersion.jobTitle}` : ""}{selectedSavedVersion.originalResumeData?.fullName ? ` · from ${selectedSavedVersion.originalResumeData.fullName}` : ""}
              </p>
            </div>

            {/* Body: Two columns layout */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-y-auto mb-6 pr-1">
              {/* Left Column: Metrics & Gaps & Diff Log */}
              <div className="w-full md:w-5/12 flex flex-col gap-4 font-sans text-left max-h-[600px] overflow-y-auto pr-1">
                
                {(() => {
                  const v = selectedSavedVersion;
                  const gaps = (v.missingRequirements || []).filter(r => !r.includes("No missing"));
                  const quals = (v.missingQualifications || []).filter(q => !q.includes("No critical"));
                  // Skills that are in the tailored copy but not the original: what was actually added
                  const originalSkills = new Set((v.originalResumeData?.skills || []).map(sk => sk.toLowerCase()));
                  const addedSkills = v.originalResumeData ? (v.resumeData.skills || []).filter(sk => !originalSkills.has(sk.toLowerCase())) : [];
                  return (
                    <div className="flex flex-col gap-5">
                      <div className="flex gap-8">
                        <div>
                          <p className="text-xs text-neutral-500">ATS score</p>
                          <p className="text-2xl font-semibold text-blue-600 leading-tight">
                            {typeof v.atsScore === "number" ? `${v.atsScore}/100` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Keyword match</p>
                          <p className="text-2xl font-semibold text-emerald-600 leading-tight">
                            {typeof v.matchPercentage === "number" ? `${v.matchPercentage}%` : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-4 border-t border-neutral-200">
                        <p className="text-sm font-medium text-black">Asked for, not found</p>
                        {gaps.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {gaps.slice(0, 8).map((req) => (
                              <span key={req} className="bg-neutral-100 text-neutral-600 text-xs font-medium px-2 py-0.5 rounded-md">{req}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">Your resume covers every key skill this job lists.</p>
                        )}
                      </div>

                      {quals.length > 0 && (
                        <div className="space-y-2 pt-4 border-t border-neutral-200">
                          <p className="text-sm font-medium text-black">Missing qualifications</p>
                          <ul className="list-disc pl-4 text-sm text-neutral-600 space-y-1">
                            {quals.slice(0, 5).map((qual) => <li key={qual}>{qual}</li>)}
                          </ul>
                        </div>
                      )}

                      <div className="space-y-2 pt-4 border-t border-neutral-200">
                        <p className="text-sm font-medium text-black">Skills added</p>
                        {addedSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {addedSkills.map((sk) => (
                              <span key={sk} className="bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-md">{sk}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">No skills were added. The content is as you wrote it.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-4 border-t border-neutral-200 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-black">Job description</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-600 bg-neutral-50 rounded-lg p-3">
                    {selectedSavedVersion.originalJobDescription || "Original job description was not stored for this older tailored resume."}
                  </div>
                </div>
              </div>

              {/* Right Column: before/after, or the full resume */}
              <div className="w-full md:w-7/12 flex flex-col gap-2 font-sans text-left">
                {selectedSavedVersion.originalResumeData && (
                  <div className="flex border border-neutral-200 rounded-lg overflow-hidden text-xs self-start" role="tablist" id="version-view-tabs">
                    <button type="button" role="tab" id="tab-version-full" aria-selected={versionView === "full"} onClick={() => setVersionView("full")}
                      className={`px-3 py-1.5 border-r border-neutral-200 cursor-pointer ${versionView === "full" ? "bg-neutral-100 text-black font-medium" : "bg-white text-neutral-500 hover:text-black"}`}>Full resume</button>
                    <button type="button" role="tab" id="tab-version-compare" aria-selected={versionView === "compare"} onClick={() => setVersionView("compare")}
                      className={`px-3 py-1.5 cursor-pointer ${versionView === "compare" ? "bg-neutral-100 text-black font-medium" : "bg-white text-neutral-500 hover:text-black"}`}>Before / After</button>
                  </div>
                )}
                {selectedSavedVersion.originalResumeData && versionView === "compare" ? (
                  <div className="max-h-[520px] overflow-y-auto pr-1" id="version-compare">
                    <SideBySideReview
                      original={selectedSavedVersion.originalResumeData}
                      reviews={changedLines(selectedSavedVersion.originalResumeData, selectedSavedVersion.resumeData)}
                      readOnly
                    />
                  </div>
                ) : (
                  <div className="flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50 max-h-[500px] md:max-h-none">
                    <div className="flex-1 overflow-y-auto p-4 bg-neutral-50 scrollbar-thin">
                      <ResumePreview resume={selectedSavedVersion.resumeData} templateStyle="classic" originalResume={selectedSavedVersion.originalResumeData || undefined} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-end border-t border-neutral-200 mt-2 font-sans">
              <button
                type="button"
                onClick={() => {
                  handlePrintOrSavePDF(selectedSavedVersion.resumeData, selectedSavedVersion.originalResumeData, selectedSavedVersion.jobTitle, undefined, selectedSavedVersion.companyName);
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200 flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadResumeAsDocx(
                    selectedSavedVersion.resumeData,
                    fileBaseName(selectedSavedVersion.resumeData.fullName, selectedSavedVersion.companyName),
                    selectedSavedVersion.originalResumeData,
                    selectedSavedVersion.jobTitle
                  );
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200 flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Download DOCX</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleDownloadSpecificResume(selectedSavedVersion);
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200 flex items-center justify-center gap-1.5"
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-lg transition cursor-pointer border border-transparent flex items-center justify-center gap-1.5"
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
            className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 w-full max-w-md text-center space-y-6 relative animate-scaleIn"
          >
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-rose-50 text-rose-600">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-semibold tracking-tight text-black">Are you sure?</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-lg transition cursor-pointer border border-transparent"
              >
                Yes, Delete
              </button>
              <button
                id="btn-confirm-delete-version-cancel"
                onClick={() => {
                  setShowDeleteSavedVersionConfirmModal(false);
                  setVersionToDeleteId(null);
                }}
                className="px-4 py-2 bg-white hover:bg-neutral-50 text-black font-medium text-sm rounded-lg transition cursor-pointer border border-neutral-200"
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
