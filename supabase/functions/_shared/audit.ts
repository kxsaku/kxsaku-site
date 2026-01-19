// supabase/functions/_shared/audit.ts
// Audit logging utility for tracking admin actions

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuditAction =
  | "admin_login"
  | "client_invite"
  | "client_view"
  | "chat_send"
  | "chat_view"
  | "chat_broadcast"
  | "note_create"
  | "note_update"
  | "note_delete"
  | "inquiry_update"
  | "inquiry_delete";

export interface AuditLogEntry {
  action: AuditAction;
  targetTable?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Logs an admin action to the audit_logs table.
 * Fails silently to avoid breaking the main operation.
 */
export async function logAuditEvent(
  sb: SupabaseClient,
  adminEmail: string,
  entry: AuditLogEntry,
  req?: Request
): Promise<void> {
  try {
    // Extract IP address from request headers
    let ipAddress: string | null = null;
    if (req) {
      ipAddress =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null;
    }

    await sb.from("audit_logs").insert({
      admin_email: adminEmail,
      action: entry.action,
      target_table: entry.targetTable || null,
      target_id: entry.targetId || null,
      details: entry.details || null,
      ip_address: ipAddress,
    });
  } catch (e) {
    // Log to console but don't throw - audit failure shouldn't break operations
    console.error("Audit log failed:", e);
  }
}
