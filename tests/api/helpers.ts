/**
 * Shared helpers for the API tests: start the app on a free port, post JSON, and record checks.
 *
 * Each test file runs in its own process because api/index.ts reads USE_GEMINI once, when it loads.
 */
import type { AddressInfo } from "net";
import type { Server } from "http";

// The app logs a lot; keep test output readable unless TEST_VERBOSE=1. Our own report uses `out`.
const out = console.log.bind(console);
if (!process.env.TEST_VERBOSE) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}

export interface StartedApp {
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Loads api/index.ts with the given environment and listens on a free port.
 * Values set here win over .env/.env.local, because dotenv never overrides existing variables.
 */
export async function startApp(env: Record<string, string>): Promise<StartedApp> {
  process.env.VERCEL = "1"; // stops api/index.ts from listening on port 3000 itself
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import("../../api/index.ts");
  const app = mod.default;
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

export async function postJson(baseUrl: string, route: string, body: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(baseUrl + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  return { status: r.status, json };
}

interface CheckResult { id: string; name: string; pass: boolean; detail: string; known?: string }

/**
 * Collects pass/fail checks. A check marked `known` is a gap we already know about: it is reported
 * but doesn't fail the run, and we flag it when it starts passing so the marker can be removed.
 */
export class Checks {
  private results: CheckResult[] = [];

  check(id: string, name: string, pass: unknown, detail = "", opts: { known?: string } = {}) {
    this.results.push({ id, name, pass: !!pass, detail, known: opts.known });
  }

  /** Prints the report and returns the process exit code (1 if any unexpected failure). */
  report(title: string): number {
    out(`\n${title}`);
    let failed = 0, known = 0, fixed = 0;
    for (const r of this.results) {
      if (r.pass && r.known) {
        fixed++;
        out(`FIXED ${r.id.padEnd(4)} ${r.name}  (marked as known gap: remove the marker)`);
      } else if (r.pass) {
        out(`PASS  ${r.id.padEnd(4)} ${r.name}`);
      } else if (r.known) {
        known++;
        out(`KNOWN ${r.id.padEnd(4)} ${r.name}\n        → ${r.known}${r.detail ? ` (${r.detail})` : ""}`);
      } else {
        failed++;
        out(`FAIL  ${r.id.padEnd(4)} ${r.name}${r.detail ? `\n        → ${r.detail}` : ""}`);
      }
    }
    const passed = this.results.filter(r => r.pass).length;
    out(`\n${passed}/${this.results.length} passed · ${failed} failed · ${known} known gaps${fixed ? ` · ${fixed} known gaps now passing` : ""}`);
    return failed > 0 ? 1 : 0;
  }
}

export const lc = (v: unknown) => JSON.stringify(v ?? "").toLowerCase();
