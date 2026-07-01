type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type SupabaseAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: SupabaseAuthUser;
  error?: string;
  error_description?: string;
  msg?: string;
};

type SavedResumePayload = {
  id: string;
  user_id: string;
  name: string;
  data: unknown;
  fileBase64?: string;
  originalFileName?: string;
  fileType?: string;
  extractedText?: string;
  uploadedAt: string;
};

type SavedTailoredResumePayload = {
  id: string;
  user_id: string;
  companyName: string;
  jobTitle: string;
  savedAt: string;
  resumeData: unknown;
  originalResumeData?: unknown;
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
};

type SupabaseDiagnosticResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  requestId?: string | null;
  payload?: unknown;
};

export type SupabaseSession = {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
  };
};

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const SUPABASE_URL = String(viteEnv.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = String(viteEnv.VITE_SUPABASE_ANON_KEY || "");

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const assertSupabaseConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.");
  }
};

const authHeaders = () => ({
  apikey: SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
});

const readDiagnosticResponse = async (response: Response): Promise<SupabaseDiagnosticResponse> => {
  const text = await response.text().catch(() => "");
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    requestId: response.headers.get("x-request-id") || response.headers.get("cf-ray"),
    payload,
  };
};

const parseAuthResponse = async (
  response: Response,
  options: { allowEmailConfirmation?: boolean } = {}
): Promise<SupabaseSession> => {
  const payload = (await response.json().catch(() => ({}))) as SupabaseAuthResponse;
  if (!response.ok) {
    const message = payload.error_description || payload.msg || payload.error || "Supabase authentication failed.";
    if (/invalid login credentials/i.test(message)) {
      throw new Error("Incorrect email or password.");
    }
    if (/email not confirmed/i.test(message)) {
      throw new Error("Please verify your email before signing in.");
    }
    if (/already registered|already exists|user_already_exists/i.test(message)) {
      throw new Error("An account already exists for this email. Please sign in.");
    }
    if (response.status === 429 || /rate limit|too many requests|only request this after/i.test(message)) {
      throw new Error("Too many signup attempts. Please wait a few minutes and try again.");
    }
    if (/unable to validate email|invalid format/i.test(message)) {
      throw new Error("Please provide a valid email address.");
    }
    if (/network|fetch failed/i.test(message)) {
      throw new Error("Network connection failed. Please check your connection and try again.");
    }
    throw new Error(message);
  }
  if (!payload.access_token || !payload.user?.id) {
    if (options.allowEmailConfirmation) {
      throw new Error("Account created. Please verify your email, then sign in.");
    }
    throw new Error("Supabase did not return a valid session.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    user: {
      id: payload.user.id,
      email: payload.user.email || "",
    },
  };
};

export const supabaseAuth = {
  async signIn(email: string, password: string): Promise<SupabaseSession> {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    return parseAuthResponse(response);
  },

  async signUp(email: string, password: string): Promise<SupabaseSession> {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    return parseAuthResponse(response, { allowEmailConfirmation: true });
  },

  async signInAnonymously(): Promise<SupabaseSession> {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return parseAuthResponse(response);
  },

  async sendPasswordReset(email: string, redirectTo: string): Promise<SupabaseDiagnosticResponse> {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email }),
    }).catch(() => {
      console.error("Supabase Password Reset Network Failure", {
        email,
        redirectTo,
        reason: "fetch_failed",
      });
      throw new Error("Email sending failed. Please check your connection and try again.");
    });
    const diagnostic = await readDiagnosticResponse(response);
    console.info("Supabase Password Reset Response", {
      email,
      redirectTo,
      status: diagnostic.status,
      ok: diagnostic.ok,
      requestId: diagnostic.requestId,
      payload: diagnostic.payload,
      emailDeliveryStatus: "not exposed by Supabase client response",
    });
    if (!response.ok) {
      const payload = (diagnostic.payload || {}) as { error_description?: string; msg?: string; error?: string; error_code?: string; code?: string | number };
      const message = payload.error_description || payload.msg || payload.error || "Could not send password reset email.";
      console.error("Supabase Password Reset Error", {
        email,
        status: diagnostic.status,
        requestId: diagnostic.requestId,
        payload: diagnostic.payload,
      });
      if (/not found|no user|user_not_found/i.test(message)) {
        throw new Error("No account was found for this email address.");
      }
      if (diagnostic.status === 429 || /rate limit|too many requests/i.test(message)) {
        throw new Error("Too many reset attempts. Please wait a few minutes and try again.");
      }
      if (/invalid/i.test(message)) {
        throw new Error("Please provide a valid email address.");
      }
      if (/network|fetch failed|failed to fetch/i.test(message)) {
        throw new Error("Email sending failed. Please check your connection and try again.");
      }
      throw new Error(message);
    }
    return diagnostic;
  },

  async updatePassword(accessToken: string, password: string): Promise<SupabaseDiagnosticResponse> {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password }),
    }).catch(() => {
      console.error("Supabase Password Update Network Failure", {
        reason: "fetch_failed",
      });
      throw new Error("Network connection failed. Please check your connection and try again.");
    });
    const diagnostic = await readDiagnosticResponse(response);
    console.info("Supabase Password Update Response", {
      status: diagnostic.status,
      ok: diagnostic.ok,
      requestId: diagnostic.requestId,
      payload: diagnostic.payload,
    });
    if (!response.ok) {
      const payload = (diagnostic.payload || {}) as { error_description?: string; msg?: string; error?: string };
      const message = payload.error_description || payload.msg || payload.error || "Could not update password.";
      console.error("Supabase Password Update Error", {
        status: diagnostic.status,
        requestId: diagnostic.requestId,
        payload: diagnostic.payload,
      });
      if (/expired|invalid|jwt/i.test(message)) {
        throw new Error("This reset link is invalid or expired. Please request a new password reset link.");
      }
      if (/rate limit|too many requests/i.test(message)) {
        throw new Error("Too many reset attempts. Please wait a few minutes and try again.");
      }
      throw new Error(message);
    }
    return diagnostic;
  },

  async signOut(accessToken?: string): Promise<void> {
    if (!isSupabaseConfigured || !accessToken) return;
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => undefined);
  },
};

const restHeaders = (accessToken: string) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

const assertDataResponse = async (response: Response, fallbackMessage: string) => {
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  const detail = payload?.message || payload?.hint || payload?.details || payload?.code;
  throw new Error(detail ? `${fallbackMessage} ${detail}` : fallbackMessage);
};

export const supabaseData = {
  async upsertUser(accessToken: string, user: { id: string; email: string }) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_users`, {
      method: "POST",
      headers: {
        ...restHeaders(accessToken),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error("Could not save app user.");
    return response.json();
  },

  async getProfile(accessToken: string, userId: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
      headers: restHeaders(accessToken),
    });
    if (!response.ok) throw new Error("Could not load profile.");
    const rows = await response.json();
    return rows?.[0] || null;
  },

  async upsertProfile(accessToken: string, profile: Record<string, unknown>) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_profiles`, {
      method: "POST",
      headers: {
        ...restHeaders(accessToken),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(profile),
    });
    if (!response.ok) throw new Error("Could not save profile.");
    return response.json();
  },

  async createJobDescription(accessToken: string, payload: {
    user_id: string;
    company_name: string;
    job_role: string;
    description: string;
    source?: string;
  }) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_job_descriptions`, {
      method: "POST",
      headers: restHeaders(accessToken),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Could not save job description.");
    return response.json();
  },

  async listJobDescriptions(accessToken: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_job_descriptions?select=*&order=created_at.desc`, {
      headers: restHeaders(accessToken),
    });
    if (!response.ok) throw new Error("Could not load job descriptions.");
    return response.json();
  },

  async upsertResume(accessToken: string, resume: SavedResumePayload) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_resumes`, {
      method: "POST",
      headers: {
        ...restHeaders(accessToken),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: resume.id,
        user_id: resume.user_id,
        name: resume.name,
        resume_data: resume.data,
        file_base64: resume.fileBase64 || null,
        original_file_name: resume.originalFileName || null,
        file_type: resume.fileType || null,
        extracted_text: resume.extractedText || null,
        uploaded_at: resume.uploadedAt,
      }),
    });
    await assertDataResponse(response, "Could not save resume.");
    return response.json();
  },

  async listResumes(accessToken: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_resumes?select=*&order=created_at.desc`, {
      headers: restHeaders(accessToken),
    });
    await assertDataResponse(response, "Could not load resumes.");
    return response.json();
  },

  async deleteResume(accessToken: string, id: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_resumes?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: restHeaders(accessToken),
    });
    await assertDataResponse(response, "Could not delete resume.");
  },

  async upsertTailoredResume(accessToken: string, version: SavedTailoredResumePayload) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_tailored_resumes`, {
      method: "POST",
      headers: {
        ...restHeaders(accessToken),
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: version.id,
        user_id: version.user_id,
        company_name: version.companyName,
        job_title: version.jobTitle,
        saved_at: version.savedAt,
        resume_data: version.resumeData,
        original_resume_data: version.originalResumeData || null,
        original_job_description: version.originalJobDescription || null,
        applied_suggestions_count: version.appliedSuggestionsCount || 0,
        ats_score: version.atsScore ?? null,
        match_percentage: version.matchPercentage ?? null,
        improvements: version.improvements || [],
        missing_requirements: version.missingRequirements || [],
        missing_qualifications: version.missingQualifications || [],
        diff_added: version.diffAdded || [],
        diff_modified: version.diffModified || [],
        diff_unchanged: version.diffUnchanged || [],
      }),
    });
    await assertDataResponse(response, "Could not save tailored resume.");
    return response.json();
  },

  async listTailoredResumes(accessToken: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_tailored_resumes?select=*&order=created_at.desc`, {
      headers: restHeaders(accessToken),
    });
    await assertDataResponse(response, "Could not load tailored resumes.");
    return response.json();
  },

  async deleteTailoredResume(accessToken: string, id: string) {
    assertSupabaseConfigured();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jd_tailored_resumes?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: restHeaders(accessToken),
    });
    await assertDataResponse(response, "Could not delete tailored resume.");
  },
};
