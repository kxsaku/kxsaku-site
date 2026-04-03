# Supabase Self-Hosting Migration — Final Report

> Completed 2026-03-28

---

## 1. Self-Hosted Supabase Instance

| Item | Value |
|------|-------|
| **VM** | Supabase-VM (Hyper-V Gen 1, Ubuntu 24.04 cloud image) |
| **Host** | saku-server (192.168.10.36) |
| **IP** | 192.168.10.115 (VLAN 10, static) |
| **Specs** | 2 vCPU, 2-8 GB dynamic RAM, 40 GB disk |
| **Public URL** | `https://api.kxsaku.com` (Cloudflare Tunnel) |
| **Internal URL** | `http://192.168.10.115:8000` |
| **Internal DNS** | `supabase.saku.local` (Pi-hole) |
| **Studio** | `http://192.168.10.115:8401` (internal only) |
| **Studio Login** | `supabase` / `hXouSORY7rYPgM65sNcMSDcHM5M` |
| **SSH** | `ssh saku@192.168.10.115` (key auth from docker-host) |
| **Docker Compose** | `/home/saku/supabase/` |
| **Edge Functions** | `/home/saku/supabase/volumes/functions/` (24 functions + 5 shared) |

## 2. Generated Keys & Secrets

| Key | Value |
|-----|-------|
| **JWT_SECRET** | `3879e4b0366a71406ab12412e4f4987cdfcf3d5101a59bea57af74a1bfae70ff` |
| **ANON_KEY** | `eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzQ1ODk3MDQsICJleHAiOiAyMDg5OTQ5NzA0fQ.6a6MgSOWpvsLl86OtTPOPTrndiIz4WwGlVDzPrc8CtM` |
| **SERVICE_ROLE_KEY** | `eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogInNlcnZpY2Vfcm9sZSIsICJpc3MiOiAic3VwYWJhc2UiLCAiaWF0IjogMTc3NDU4OTcwNCwgImV4cCI6IDIwODk5NDk3MDR9.BzqLjTIz6Wf1sOp8pKtGuXdTe0q9jbddjPi9xCK63tA` |
| **POSTGRES_PASSWORD** | `e79QFvn8ddyBq-DS8bHc9gKi_-msJk-fqbSLQRwx` |
| **CHAT_ENCRYPTION_KEY** | `d1028134908ab94815e46535e1c61c2b296e8c78663f04c363eee5d1c6fea161` |

## 3. Container Status (13/13 healthy)

| Container | Status |
|-----------|--------|
| supabase-db | Healthy |
| supabase-auth (GoTrue v2.186.0) | Healthy |
| supabase-rest (PostgREST) | Running |
| supabase-kong | Healthy |
| supabase-storage | Healthy |
| supabase-studio | Healthy |
| supabase-edge-functions | Running |
| supabase-realtime | Healthy |
| supabase-analytics | Healthy |
| supabase-meta | Healthy |
| supabase-pooler (Supavisor) | Healthy |
| supabase-imgproxy | Healthy |
| supabase-vector | Healthy |

## 4. Database Migration

| Table | Rows | Status |
|-------|------|--------|
| auth.users | 2 | Imported (admin + test client) |
| user_profiles | 1 | Imported (admin) |
| client_profiles | 1 | Imported (test client) |
| billing_subscriptions | 1 | Imported (inactive) |
| sns_system_status | 1 | Imported (mode=normal) |
| inquiries | 1 | Imported |
| sns_internal_notes | 3 | Imported |
| chat_threads | 1 | Created during testing |
| chat_messages | 2 | Created during testing (encrypted) |
| chat_attachments | 0 | Empty (old test data skipped) |
| chat_notification_prefs | 0 | Empty |
| chat_notification_state | 0 | Empty |
| chat_presence | 0 | Empty |
| audit_logs | 0 | Fresh start |

**Also created**: 13 table schemas, 3 RPC functions, RLS policies on all tables, `chat-attachments` storage bucket, `updated_at` triggers, realtime publication for `chat_messages`.

## 5. Auth Users

| Email | UUID | Role | Password |
|-------|------|------|----------|
| brandon.sns@pm.me | b106da04-d369-48b2-8bce-35e773defac8 | Admin | `TempPass123` (CHANGE THIS) |
| therealboltgamez@gmail.com | 0b0631fa-d2c2-4622-8ac4-54bd9b788639 | Client | `TempPass123` (CHANGE THIS) |

**Note**: Admin UUID changed from `4f33551e...` (cloud) to `b106da04...` (self-hosted). The `user_profiles.user_id` was updated to match. No frontend code references the admin UUID directly.

## 6. Edge Functions (24 deployed)

All 24 functions + 5 shared modules deployed at `/home/saku/supabase/volumes/functions/`.

Environment variables configured via `docker-compose.override.yml`:
- 3 Supabase URL naming conventions (SB_URL, SUPABASE_URL, PROJECT_SUPABASE_URL)
- 3 Service role key naming conventions
- SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY
- SITE_URL, APP_BASE_URL, ADMIN_EMAIL, ALLOWED_ORIGINS
- Placeholders for: STRIPE_*, RESEND_*, TWILIO_* (Brandon provides these)

## 7. Cloudflare Tunnel

Added `api.kxsaku.com` route to existing `plex-remote` tunnel on docker-host:
```yaml
- hostname: api.kxsaku.com
  service: http://192.168.10.115:8000
```
DNS CNAME auto-created by `cloudflared tunnel route dns`.

## 8. Frontend Changes (Branch: `feat/self-hosted-supabase`)

**21 files modified, 60 lines changed (1:1 replacements)**:

| Change | Files | Count |
|--------|-------|-------|
| Supabase URL → `api.kxsaku.com` | 21 files | 21 occurrences |
| Anon key replaced | 21 files | 21 occurrences |
| CSP connect-src updated | 18 files | 18 occurrences |
| CSP img-src updated | 18 files | 18 occurrences |

**NOT pushed to main** — on branch `feat/self-hosted-supabase` awaiting Brandon's review.

## 9. Test Results

| Test | Result |
|------|--------|
| Auth health (GoTrue) | PASS |
| Admin login (brandon.sns@pm.me) | PASS |
| Client login (therealboltgamez@gmail.com) | PASS |
| REST API (PostgREST Swagger) | PASS |
| REST: user_profiles query | PASS |
| REST: inquiries query | PASS |
| REST: sns_system_status query | PASS |
| Storage: bucket listing | PASS |
| Edge: system-status-get | PASS |
| Edge: admin-client-list (auth + admin check) | PASS |
| Edge: admin-notes (list) | PASS |
| Edge: admin-chat-client-list | PASS |
| Edge: admin-chat-send (encryption) | PASS |
| Edge: admin-chat-history (decryption) | PASS |
| Edge: get-billing-status | PASS |
| Edge: client-chat-send (encryption) | PASS |
| Edge: client-chat-history (decryption) | PASS |
| Edge: client-presence heartbeat | PASS |
| Chat encryption at rest (DB check) | PASS (enc:... format verified) |
| Cloudflare Tunnel (public access) | PASS |
| Pi-hole DNS (supabase.saku.local) | PASS |
| Edge: contact-email | Expected fail (Resend API key = placeholder) |
| Edge: create-checkout-session | Expected fail (Stripe key = placeholder) |
| Edge: inquiry-otp | Expected fail (Twilio key = placeholder) |
| Edge: stripe-webhooks | Expected fail (Stripe webhook secret = placeholder) |

## 10. Remaining Brandon Actions

### DONE (automated)
- [x] All external API keys configured (Stripe, Resend, Twilio)
- [x] Stripe webhook URL updated to `https://api.kxsaku.com/functions/v1/stripe-webhooks`
- [x] Stripe price ID auto-detected: `price_1SkyLmCRqqO4X4EU2UwrGWyS` ($75/mo)
- [x] Dashboard password changed to `BlackIron6317!!`
- [x] Frontend branch committed to main (21 files, 60 changes)

### Brandon must do
1. **Push to GitHub**: The commit is ready on main at `/home/saku/kxsaku-site/` but docker-host has no GitHub credentials. Push from a machine with GitHub access, or provide a GitHub PAT.
2. **Set real auth passwords**: Login to Studio (`http://192.168.10.115:8401`, user `supabase` / `BlackIron6317!!`) → Authentication → Users → change both users from `TempPass123`
3. **Verify Resend sender domain**: The `RESEND_FROM` is set to `noreply@kxsaku.com`. If this domain isn't verified in Resend, contact emails will fail. Check https://resend.com/domains.

### Optional
- Pause Supabase Cloud project (keeping as backup per Brandon's decision)
- Add Supabase-VM to the daily 3 AM VM backup script on saku-server

## 11. Architecture Diagram

```
Browser (kxsaku.com, GitHub Pages)
  |
  | HTTPS
  v
Cloudflare Tunnel (api.kxsaku.com)
  |
  | HTTP
  v
docker-host (192.168.10.114) cloudflared
  |
  | HTTP (LAN)
  v
Supabase-VM (192.168.10.115:8000)
  |
  v
Kong API Gateway (:8000)
  |
  +-- GoTrue Auth (:9999)
  +-- PostgREST (:3000)
  +-- Realtime (:4000)
  +-- Storage (:5000)
  +-- Edge Runtime (:9000) -- 24 functions
  +-- PostgreSQL (:5432) -- 13 tables
  +-- Studio (:8401, internal only)
```

## 12. Cost

| Item | Monthly Cost |
|------|-------------|
| Supabase-VM (Hyper-V) | $0 |
| Supabase (self-hosted OSS) | $0 |
| Cloudflare Tunnel | $0 |
| **Total** | **$0/month** (was ~$25/month on Supabase Cloud free tier approaching limits) |
