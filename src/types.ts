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
  summary: string;
  workExperience: ResumeWorkExperience[];
  education: ResumeEducation[];
  skills: string[]; // List of skill tags
}

export interface SimplifiedJD {
  companyPitch: string; // What the company is looking for in plain language
  requiredSkills: { name: string; priority: 'high' | 'medium' }[];
  keyResponsibilities: string[];
  candidateExpectations: string[];
  keywordsToTarget: string[];
}

export interface ResumeSuggestion {
  id: string;
  type: 'rewrite' | 'missing' | 'ats' | 'general';
  section: 'summary' | 'experience' | 'skills' | 'education' | 'general';
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
  appliedSuggestionsCount: number;
}
