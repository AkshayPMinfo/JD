/**
 * Groups job titles into broad role families so we can tell when someone is applying
 * outside their current field (e.g. a product manager applying for a backend engineer job).
 */

export interface RoleFamily {
  id: string;
  label: string; // shown to the user, e.g. "software engineering"
}

// Order matters: more specific families first ("Data Engineer" is data, "Product Designer" is design).
const FAMILIES: { family: RoleFamily; pattern: RegExp }[] = [
  { family: { id: "design", label: "design" }, pattern: /\b(designer|ux|ui\/ux|ux\/ui|ui designer|visual design|interaction design)\b/i },
  { family: { id: "data", label: "data and analytics" }, pattern: /\b(data scientist|data analyst|data engineer|machine learning|ml engineer|ai engineer|business analyst|analytics|bi developer|statistician)\b/i },
  { family: { id: "product", label: "product management" }, pattern: /\b(product manager|product owner|product lead|product management|head of product|apm|associate product)\b/i },
  { family: { id: "engineering", label: "software engineering" }, pattern: /\b(engineer|engineering|developer|sde|programmer|devops|sre|architect|full[\s-]?stack|backend|back[\s-]end|frontend|front[\s-]end|software|qa|tester)\b/i },
  { family: { id: "marketing", label: "marketing" }, pattern: /\b(marketing|marketer|social media|campaign|seo|sem|content|brand|growth|communications|pr executive|copywriter)\b/i },
  { family: { id: "sales", label: "sales" }, pattern: /\b(sales|account executive|business development|bdr|sdr|account manager|inside sales)\b/i },
  { family: { id: "hr", label: "HR and recruiting" }, pattern: /\b(recruiter|recruiting|talent acquisition|human resources|hr|people partner|people operations)\b/i },
  { family: { id: "finance", label: "finance and accounting" }, pattern: /\b(accountant|accounting|finance|financial analyst|auditor|chartered accountant|controller|bookkeeper)\b/i },
  { family: { id: "healthcare", label: "healthcare" }, pattern: /\b(nurse|nursing|doctor|physician|pharmacist|medical|clinical|therapist)\b/i },
  { family: { id: "support", label: "customer support" }, pattern: /\b(customer support|customer success|support specialist|customer service|help ?desk)\b/i },
  { family: { id: "operations", label: "operations" }, pattern: /\b(operations|supply chain|logistics|project manager|program manager|procurement)\b/i },
  { family: { id: "teaching", label: "teaching" }, pattern: /\b(teacher|lecturer|professor|tutor|instructor|educator)\b/i }
];

export function roleFamilyOf(title: string | undefined | null): RoleFamily | null {
  const t = (title || "").trim();
  if (!t || /^tailored position$/i.test(t)) return null;
  for (const { family, pattern } of FAMILIES) {
    if (pattern.test(t)) return family;
  }
  return null;
}

export interface RoleCheck {
  resumeRole: string;
  resumeFamily: RoleFamily;
  jobTitle: string;
  jobFamily: RoleFamily;
}

/**
 * Returns a mismatch when the most recent job title and the target job title fall into
 * different, recognised families. Returns null when they match or either can't be classified.
 */
export function detectRoleMismatch(recentRole: string | undefined, jobTitle: string | undefined): RoleCheck | null {
  const resumeFamily = roleFamilyOf(recentRole);
  const jobFamily = roleFamilyOf(jobTitle);
  if (!resumeFamily || !jobFamily || resumeFamily.id === jobFamily.id) return null;
  return { resumeRole: (recentRole || "").trim(), resumeFamily, jobTitle: (jobTitle || "").trim(), jobFamily };
}
