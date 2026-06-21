/**
 * Shared Type Definitions for JD to Resume Customizer
 */

export interface ResumeWorkExperience {
  id: string;
  role: string;
  company: string;
  duration: string;
  description: string[]; // List of bullet points
}

export interface ResumeProject {
  id: string;
  name: string;
  description: string[]; // List of bullet points
  duration?: string;
}

export interface ResumeEducation {
  id: string;
  degree: string;
  school: string;
  duration: string;
  gpa?: string;
}

export interface ResumeStructure {
  fullName: string;
  email: string;
  phone: string;
  linkedin?: string;
  website?: string;
  location?: string;
  summary: string;
  workExperience: ResumeWorkExperience[];
  education: ResumeEducation[];
  skills: string[]; // List of skill tags
  languages?: string[]; // List of languages
  projects?: ResumeProject[];
  certifications?: string[];
}

export interface SimplifiedJD {
  jobTitle?: string;
  companyPitch: string; // What the company is looking for in plain language
  requiredSkills: { name: string; priority: 'high' | 'medium' }[];
  keyResponsibilities: string[];
  candidateExpectations: string[];
  keywordsToTarget: string[];
  requiredQualifications?: string[];
}

export interface ResumeSuggestion {
  id: string;
  type: 'rewrite' | 'missing' | 'ats' | 'general';
  section: 'summary' | 'experience' | 'skills' | 'education' | 'projects' | 'general';
  targetId?: string; // e.g. experience bullet ID or specific detail ID
  originalText?: string;
  suggestedText: string;
  reason: string;
  applied: boolean;
}

export interface TailoredResponse {
  suggestions: ResumeSuggestion[];
  tailoredResume: ResumeStructure;
}

export interface ATSCheckResult {
  passed: boolean;
  score: number; // 0 to 100
  criteria: {
    name: string;
    description: string;
    passed: boolean;
    feedback: string;
    category: 'formatting' | 'language' | 'content';
  }[];
}

export interface SavedResumeVersion {
  id: string;
  companyName: string;
  jobTitle: string;
  savedAt: string;
  resumeData: ResumeStructure;
  originalResumeData?: ResumeStructure;
  originalJobDescription?: string;
  appliedSuggestionsCount: number;
  atsScore?: number;
  matchPercentage?: number;
  improvements?: string[];
  missingRequirements?: string[];
  missingQualifications?: string[];
  diffAdded?: string[];
  diffModified?: string[];
  diffUnchanged?: string[];
}

export interface SavedResume {
  id: string;
  name: string;           // display name: file name or fullName
  data: ResumeStructure;
  fileBase64?: string;    // original uploaded file, stored for preview
  originalFileName?: string;
  fileType?: 'pdf' | 'docx' | 'manual' | 'json';
  extractedText?: string; // readable text extracted during validation
  pdfBase64?: string;     // legacy PDF preview storage
  uploadedAt: string;     // ISO date string
}
