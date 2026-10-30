/**
 * Daily AI limit, stored in Supabase (supabase/migrations/20261027000000_ai_daily_limit.sql):
 * 5 AI tailorings a day for signed-in users (20261031000000_ai_limit_5.sql), 1 for guests. Past the limit the app uses the
 * no-AI (rules) mode instead.
 *
 * The count is tied to the person's Supabase sign-in, so the browser sends its access token
 * and Supabase works out who they are. If the SQL hasn't been run yet, or Supabase can't be
 * reached, AI stays on (we don't want a setup gap to break the app); a missing or invalid
 * sign-in means no AI.
 */
export type AiUsageStatus = "ok" | "limit-reached" | "not-signed-in" | "not-set-up" | "error";

export type AiUsage = {
  status: AiUsageStatus;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string | null;
};

const supabaseConfig = () => ({
  url: String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, ""),
  anonKey: String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "")
});

const open = (status: AiUsageStatus): AiUsage => ({ status, used: 0, limit: 0, remaining: 0, resetsAt: null });

/** True when this usage lets the request use AI. */
export const aiAllowed = (usage: AiUsage) => usage.status === "ok" ? usage.remaining > 0 : usage.status === "not-set-up" || usage.status === "error";

async function callRpc(fn: "jd_ai_credits" | "jd_use_ai_credit", token: string | null): Promise<AiUsage & { allowed?: boolean }> {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return open("not-set-up");
  if (!token) return open("not-signed-in");
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5000)
    });
    const text = await r.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      const code = body?.code || "";
      const message = String(body?.message || body || "");
      // Function or table missing: the SQL hasn't been run in Supabase yet
      if (r.status === 404 || code === "PGRST202" || code === "42883" || code === "42P01") {
        console.warn("[ai-limit] Daily limit isn't set up in Supabase yet; AI stays on.", code || r.status);
        return open("not-set-up");
      }
      if (r.status === 401 || r.status === 403 || /jwt|not signed in/i.test(message)) return open("not-signed-in");
      console.warn("[ai-limit] Supabase error; AI stays on.", r.status, message.slice(0, 200));
      return open("error");
    }
    const used = Number(body?.used ?? 0);
    const limit = Number(body?.limit ?? 0);
    const remaining = Number(body?.remaining ?? Math.max(limit - used, 0));
    const reached = fn === "jd_use_ai_credit" ? body?.allowed === false : remaining <= 0;
    return { status: reached ? "limit-reached" : "ok", used, limit, remaining, resetsAt: body?.resets_at ?? null, allowed: body?.allowed };
  } catch (err: any) {
    console.warn("[ai-limit] Couldn't reach Supabase; AI stays on.", err?.message || err);
    return open("error");
  }
}

/** How many AI tailorings are left today (doesn't use one). */
export const getAiCredits = (token: string | null) => callRpc("jd_ai_credits", token);

/** Use one AI tailoring. */
export const useAiCredit = (token: string | null) => callRpc("jd_use_ai_credit", token);

/** The Supabase access token the browser sent, if any. */
export const bearerToken = (req: { headers: Record<string, any> }): string | null => {
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};
