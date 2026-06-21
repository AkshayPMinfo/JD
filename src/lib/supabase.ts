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

const parseAuthResponse = async (response: Response): Promise<SupabaseSession> => {
  const payload = (await response.json().catch(() => ({}))) as SupabaseAuthResponse;
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || payload.error || "Supabase authentication failed.");
  }
  if (!payload.access_token || !payload.user?.id) {
    if (payload.user?.id && payload.user?.email) {
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
    return parseAuthResponse(response);
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
};
