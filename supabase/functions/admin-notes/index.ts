// supabase/functions/admin-notes/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getCorsHeaders, handleCorsPrefllight } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { ensureAdmin } from "../_shared/auth.ts";
import { logAuditEvent } from "../_shared/audit.ts";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrefllight(req);

  // Rate limiting for admin endpoints
  const rateLimitResponse = checkRateLimit(req, { ...RATE_LIMITS.admin, keyPrefix: "admin-notes" }, getCorsHeaders(req));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const auth = req.headers.get("authorization");
    const { sb, email: adminEmail } = await ensureAdmin(auth);

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
        await logAuditEvent(sb, adminEmail, {
          action: "note_update",
          targetTable: "sns_internal_notes",
          targetId: id,
          details: { title: payload.title },
        }, req);
        return json(req, { note: data });
      } else {
        const { data, error } = await sb
          .from("sns_internal_notes")
          .insert({ ...payload })
          .select("id,title,body,client_user_id,client_label,created_at,updated_at")
          .single();
        if (error) throw error;
        await logAuditEvent(sb, adminEmail, {
          action: "note_create",
          targetTable: "sns_internal_notes",
          targetId: data.id,
          details: { title: payload.title },
        }, req);
        return json(req, { note: data });
      }
    }

    // DELETE
    if (action === "delete") {
      const id = String(body?.id || "").trim();
      if (!id) return json(req, { error: "Missing id." }, 400);

      const { error } = await sb.from("sns_internal_notes").delete().eq("id", id);
      if (error) throw error;
      await logAuditEvent(sb, adminEmail, {
        action: "note_delete",
        targetTable: "sns_internal_notes",
        targetId: id,
      }, req);
      return json(req, { ok: true });
    }

    return json(req, { error: "Unknown action." }, 400);
  } catch (e) {
    return json(req, { error: (e as any)?.message || String(e) }, 500);
  }
});
