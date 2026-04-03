// /shared.js — Shared utilities for all kxsaku.com pages
//
// Usage (ES module):
//   import { SUPABASE_URL, sanitize, fmtDate, ... } from "/shared.js";
//
// Usage (classic script — load shared.js first as type="module"):
//   <script src="/shared.js" type="module"></script>
//   Then access window.SNS.SUPABASE_URL, window.SNS.sanitize(), etc.

// ─── Supabase Config ────────────────────────────────────────────────
export const SUPABASE_URL = "https://api.kxsaku.com";
export const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzQ1ODk3MDQsICJleHAiOiAyMDg5OTQ5NzA0fQ.6a6MgSOWpvsLl86OtTPOPTrndiIz4WwGlVDzPrc8CtM";
export const FN_BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Create a Supabase client. Requires supabase-js.min.js to be loaded first.
 * @param {object} [opts] - Additional options merged into createClient config
 * @returns Supabase client instance
 */
export function createSupabaseClient(opts = {}) {
  const { createClient } = window.supabase;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts);
}

// ─── Auth Guard ─────────────────────────────────────────────────────
/**
 * Require an authenticated user. Redirects to login if not found.
 * @param {object} sb - Supabase client instance
 * @param {string} [loginUrl="/sns-login/"] - URL to redirect to
 * @returns {Promise<object|null>} The user object, or null (after redirect)
 */
export async function requireUser(sb, loginUrl = "/sns-login/") {
  let { data: { session } } = await sb.auth.getSession();

  if (session) {
    const { data: refreshData, error: refreshError } = await sb.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      session = refreshData.session;
    }
  }

  const user = session?.user;
  if (!user) {
    window.location.href = loginUrl;
    return null;
  }
  return user;
}

// ─── HTML Sanitization ──────────────────────────────────────────────
const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} s - Value to escape
 * @returns {string} Escaped string
 */
export function sanitize(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, m => ESC_MAP[m]);
}

// Alias for pages that use esc() instead of sanitize()
export const esc = sanitize;

/**
 * Escape for use in HTML attributes (also escapes backticks).
 * @param {*} s - Value to escape
 * @returns {string} Escaped string
 */
export function escapeAttr(s) {
  return sanitize(s).replaceAll("`", "&#096;");
}

// ─── Date Formatting ────────────────────────────────────────────────
/**
 * Format an ISO date string for display (with options).
 * @param {string} iso - ISO date string
 * @returns {string} Formatted date string
 */
export function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return iso || "";
  }
}

/**
 * Simple date format (just toLocaleString, no options).
 * @param {string} iso - ISO date string
 * @returns {string} Formatted date string
 */
export function fmtDateSimple(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
}

// ─── Edge Function Caller ───────────────────────────────────────────
/**
 * Call a Supabase Edge Function with auth.
 * @param {object} sb - Supabase client instance
 * @param {string} fnName - Function name
 * @param {object} [payload={}] - Request body
 * @returns {Promise<object>} Response JSON
 */
export async function callEdgeFn(sb, fnName, payload = {}) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not logged in.");

  const res = await fetch(`${FN_BASE}/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "Request failed");
  return j;
}

// ─── Expose on window for non-module scripts ────────────────────────
window.SNS = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  FN_BASE,
  createSupabaseClient,
  requireUser,
  sanitize,
  esc,
  escapeAttr,
  fmtDate,
  fmtDateSimple,
  callEdgeFn,
};
