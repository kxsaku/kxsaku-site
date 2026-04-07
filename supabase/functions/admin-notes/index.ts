// supabase/functions/admin-notes/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function ensureAdmin(authHeader: string | null) {
  if (!authHeader) throw new Error("Missing Authorization header.");
  const token = authHeader.replace("Bearer", "").trim();
  if (!token) throw new Error("Missing bearer token.");

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY = getEnv("SUPABASE_ANON_KEY");
  const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user?.email) throw new Error("Unauthorized.");

  const email = userData.user.email;

  // Use service role to check admin flag (bypasses RLS)
  const SUPABASE_SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: prof, error: profErr } = await sb
    .from("user_profiles")
    .select("email,is_admin")
    .eq("email", email)
    .maybeSingle();

  if (profErr) throw profErr;
  if (!prof?.is_admin) throw new Error("Forbidden: admin only.");

  return { sb, email };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "admin-notes" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const auth = req.headers.get("authorization");
    const { sb } = await ensureAdmin(auth);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toLowerCase();

    if (!action) return json(req, { error: "Missing action." }, 400);

    // LIST / SEARCH
    if (action === "list") {
      const q = String(body?.q || "").trim();
      const mode = String(body?.mode || "keywords").toLowerCase();
      const limit = Math.min(Math.max(Number(body?.limit || 100), 1), 200);

      let query = sb
        .from("sns_internal_notes")
        .select("id,title,body,client_user_id,client_label,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (q) {
        if (mode === "title") {
          query = query.ilike("title", `%${q}%`);
        } else if (mode === "client") {
          query = query.ilike("client_label", `%${q}%`);
        } else {
          // keywords
          query = query.ilike("body", `%${q}%`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return json(req, { notes: data || [] });
    }

    // UPSERT
    if (action === "upsert") {
      const note = body?.note || {};
      const id = note?.id ? String(note.id) : null;

      const payload = {
        title: String(note?.title || "Untitled").slice(0, 200),
        body: String(note?.body || ""),
        client_user_id: note?.client_user_id ? String(note.client_user_id) : null,
        client_label: note?.client_label ? String(note.client_label).slice(0, 500) : null,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await sb
          .from("sns_internal_notes")
          .update(payload)
          .eq("id", id)
          .select("id,title,body,client_user_id,client_label,created_at,updated_at")
          .single();
        if (error) throw error;
        return json(req, { note: data });
      } else {
        const { data, error } = await sb
          .from("sns_internal_notes")
          .insert({ ...payload })
          .select("id,title,body,client_user_id,client_label,created_at,updated_at")
          .single();
        if (error) throw error;
        return json(req, { note: data });
      }
    }

    // DELETE
    if (action === "delete") {
      const id = String(body?.id || "").trim();
      if (!id) return json(req, { error: "Missing id." }, 400);

      const { error } = await sb.from("sns_internal_notes").delete().eq("id", id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    return json(req, { error: "Unknown action." }, 400);
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
