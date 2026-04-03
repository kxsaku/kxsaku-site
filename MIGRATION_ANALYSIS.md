# Supabase Self-Hosting Migration — Complete Code Analysis

> Generated 2026-03-26 by Phase 1 analysis. Every file listed in the task has been read line-by-line.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Supabase Services Used](#2-supabase-services-used)
3. [Environment Variables Master List](#3-environment-variables-master-list)
4. [Hardcoded URLs — Complete Inventory](#4-hardcoded-urls--complete-inventory)
5. [CSP Directives — Complete Inventory](#5-csp-directives--complete-inventory)
6. [Edge Functions — Detailed Analysis](#6-edge-functions--detailed-analysis)
7. [Frontend Pages — Detailed Analysis](#7-frontend-pages--detailed-analysis)
8. [Mobile App — Detailed Analysis](#8-mobile-app--detailed-analysis)
9. [Database Schema](#9-database-schema)
10. [Storage](#10-storage)
11. [External Service Integrations](#11-external-service-integrations)
12. [Critical Migration Risks](#12-critical-migration-risks)
13. [Migration Change Inventory](#13-migration-change-inventory)

---

## 1. Executive Summary

**kxsaku.com** is a client management platform ("SNS") with:
- **Frontend**: Static HTML pages hosted on GitHub Pages (kxsaku.com)
- **Mobile app**: React Native/Expo app (sns-mobile/)
- **Backend**: 24 Supabase Edge Functions (Deno runtime)
- **Database**: PostgreSQL via Supabase (13 tables)
- **Auth**: Supabase Auth (email/password, 2 users)
- **Storage**: 1 bucket (`chat-attachments`), 44 files, 8.1 MB
- **Realtime**: PostgreSQL changes subscription for chat messages
- **External APIs**: Stripe (payments), Resend (email), Twilio (SMS OTP)

**Key finding**: The edge functions use **3 different env var naming conventions** for the same Supabase URL/keys. All three must be set in self-hosted config.

---

## 2. Supabase Services Used

| Service | Used By | Notes |
|---------|---------|-------|
| **Auth** | Login, invite, admin check, JWT validation | Email/password only. 2 users. `inviteUserByEmail()` for onboarding. |
| **Database** | All edge functions, mobile app, frontend pages | 13 tables + 3 RPC functions + custom types |
| **Storage** | Chat attachments (upload + signed URLs) | Bucket: `chat-attachments`. Presigned upload/download URLs. |
| **Realtime** | Chat messages, presence tracking | `postgres_changes` on `chat_messages` table (INSERT events) |
| **Edge Functions** | 24 functions in Deno runtime | All backend logic lives here |

---

## 3. Environment Variables Master List

### CRITICAL: Three naming conventions exist

The edge functions were written at different times and use **inconsistent env var names**. The self-hosted `.env` MUST define ALL of these:

| Env Var Name | Used By | Maps To |
|---|---|---|
| `SB_URL` | auth.ts, most chat/admin functions | Supabase project URL |
| `SUPABASE_URL` | get-billing-status, system-status-get, system-status-set | Supabase project URL (SAME value as SB_URL) |
| `PROJECT_SUPABASE_URL` | inquiry-otp | Supabase project URL (SAME value as SB_URL) |
| `SB_SERVICE_ROLE_KEY` | auth.ts, most chat/admin functions | Service role key |
| `SUPABASE_SERVICE_ROLE_KEY` | system-status-get, system-status-set | Service role key (SAME value) |
| `PROJECT_SERVICE_ROLE_KEY` | inquiry-otp | Service role key (SAME value) |
| `SUPABASE_ANON_KEY` | auth.ts, get-billing-status, client-chat-send, client-presence, system-status-set | Anon key |
| `CHAT_ENCRYPTION_KEY` | crypto.ts (used by all chat functions) | AES-256-GCM master key, min 32 chars |
| `STRIPE_SECRET_KEY` | admin-client-list, create-checkout-session, create-portal-session, stripe-webhooks | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhooks | Stripe webhook signing secret (whsec_...) |
| `STRIPE_PRICE_ID` | create-checkout-session | Stripe price ID for monthly subscription |
| `RESEND_API_KEY` | admin-chat-send, contact-email | Resend email API key |
| `RESEND_FROM` | admin-chat-send | Sender email address for notifications |
| `CONTACT_TO_EMAIL` | contact-email | Recipient for contact form submissions |
| `CONTACT_FROM_EMAIL` | contact-email | Sender for contact form emails |
| `SITE_URL` | cors.ts, admin-invite, create-checkout-session, create-portal-session | Primary site URL (https://kxsaku.com) |
| `APP_BASE_URL` | admin-chat-send | Base URL for email notification links |
| `ALLOWED_ORIGINS` | cors.ts | Comma-separated additional CORS origins |
| `ADMIN_EMAIL` | chat-attachment-signed-url, chat-attachment-upload-url | Admin identification email |
| `TWILIO_ACCOUNT_SID` | inquiry-otp | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | inquiry-otp | Twilio auth token |
| `TWILIO_VERIFY_SERVICE_SID` | inquiry-otp | Twilio Verify service SID |

### Values needed from Supabase Cloud Dashboard

These must be retrieved from the **Supabase Cloud Edge Functions environment**:
1. `CHAT_ENCRYPTION_KEY` — **CRITICAL**: Without this, all 87 encrypted chat messages become unreadable
2. `STRIPE_SECRET_KEY`
3. `STRIPE_WEBHOOK_SECRET`
4. `STRIPE_PRICE_ID`
5. `RESEND_API_KEY`
6. `RESEND_FROM`
7. `CONTACT_TO_EMAIL`
8. `CONTACT_FROM_EMAIL`
9. `TWILIO_ACCOUNT_SID`
10. `TWILIO_AUTH_TOKEN`
11. `TWILIO_VERIFY_SERVICE_SID`
12. `ADMIN_EMAIL` (likely `brandon.sns@pm.me`)

---

## 4. Hardcoded URLs — Complete Inventory

### 4.1 Supabase Project URL (21 locations)

All occurrences of `https://jgvxmpsjtkedzgygynbl.supabase.co`:

| File | Line | Variable Name |
|------|------|---------------|
| `sns-login/index.html` | 126 | `SUPABASE_URL` |
| `sns-login/mobile.html` | 625 | `SUPABASE_URL` |
| `sns-dashboard/index.html` | 638 | `SUPABASE_URL` |
| `sns-dashboard/mobile.html` | 591 | `SUPABASE_URL` |
| `sns-admin/index.html` | 716 | `SUPABASE_URL` |
| `sns-admin/mobile.html` | 1062 | `SUPABASE_URL` |
| `sns-client-chat/index.html` | 1610 | `SUPABASE_URL` |
| `sns-client-chat/mobile.html` | 1709 | `SUPABASE_URL` |
| `sns-client-list/index.html` | 551 | `SUPABASE_URL` |
| `sns-client-list/mobile.html` | 407 | `SUPABASE_URL` |
| `sns-inquiry/index.html` | 994 | `supabaseUrl` (lowercase) |
| `sns-inquiry/mobile.html` | 1004 | `supabaseUrl` (lowercase) |
| `sns-inquiry-view/index.html` | 305 | `SUPABASE_URL` |
| `sns-inquiry-view/mobile.html` | 722 | `SUPABASE_URL` |
| `sns-inquiry-history/index.html` | 198 | `SUPABASE_URL` |
| `sns-inquiry-history/mobile.html` | 515 | `SUPABASE_URL` |
| `sns-portal-invite/index.html` | 210 | `SUPABASE_URL` |
| `sns-portal-invite/mobile.html` | 790 | `SUPABASE_URL` |
| `contact/index.html` | 646 | `CONTACT_ENDPOINT` (full function URL) |
| `contact/mobile.html` | 681 | `CONTACT_ENDPOINT` (full function URL) |
| `sns-mobile/src/lib/supabase.ts` | 7 | `SUPABASE_URL` (fallback) |

**Note**: `contact/` pages use the full function URL: `https://jgvxmpsjtkedzgygynbl.supabase.co/functions/v1/contact-email`

### 4.2 Anon Key (21 locations)

The anon key `eyJhbGciOiJIUzI1NiIs...OCh23RWm8COtxWuumYvKUmfMOLOW01B1zrbtzcr3w6Y` appears in:

| File | Line | Variable Name |
|------|------|---------------|
| `sns-login/index.html` | 127 | `SUPABASE_ANON_KEY` |
| `sns-login/mobile.html` | 626 | `SUPABASE_ANON_KEY` |
| `sns-dashboard/index.html` | 639 | `SUPABASE_ANON_KEY` |
| `sns-dashboard/mobile.html` | 592 | `SUPABASE_ANON_KEY` |
| `sns-admin/index.html` | ~717 | `SUPABASE_ANON_KEY` |
| `sns-admin/mobile.html` | ~1063 | `SUPABASE_ANON_KEY` |
| `sns-client-chat/index.html` | 1611 | `SUPABASE_ANON_KEY` |
| `sns-client-chat/mobile.html` | 1710 | `SUPABASE_ANON_KEY` |
| `sns-client-list/index.html` | 552 | `SUPABASE_ANON_KEY` |
| `sns-client-list/mobile.html` | 408 | `SUPABASE_ANON_KEY` |
| `sns-inquiry/index.html` | ~995 | (used in fetch headers) |
| `sns-inquiry/mobile.html` | ~1005 | (used in fetch headers) |
| `sns-inquiry-view/index.html` | 306 | `SUPABASE_ANON_KEY` |
| `sns-inquiry-view/mobile.html` | 723 | `SUPABASE_ANON_KEY` |
| `sns-inquiry-history/index.html` | 199 | `SUPABASE_ANON_KEY` |
| `sns-inquiry-history/mobile.html` | 516 | `SUPABASE_ANON_KEY` |
| `sns-portal-invite/index.html` | 211 | `SUPABASE_ANON_KEY` |
| `sns-portal-invite/mobile.html` | 791 | `SUPABASE_ANON_KEY` |
| `contact/index.html` | 647 | `SUPABASE_ANON_KEY` (used in apikey header) |
| `contact/mobile.html` | ~682 | `SUPABASE_ANON_KEY` |
| `sns-mobile/src/lib/supabase.ts` | 8 | `SUPABASE_ANON_KEY` (fallback) |

### 4.3 External API URLs (in edge functions only)

| URL | Used By | Purpose |
|-----|---------|---------|
| `https://api.stripe.com/v1/` | admin-client-list, create-checkout-session, create-portal-session, stripe-webhooks | Stripe payments |
| `https://api.resend.com/emails` | admin-chat-send, contact-email | Email delivery |
| `https://verify.twilio.com/v2/Services/` | inquiry-otp | SMS OTP verification |

These do NOT need to change during migration.

---

## 5. CSP Directives — Complete Inventory

### 18 HTML files have CSP meta tags

All use the same pattern:
```
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com
img-src 'self' data: blob: https://*.supabase.co
```

Files with CSP (all need updating):

| File | Notes |
|------|-------|
| `sns-login/index.html` | Line 7 |
| `sns-login/mobile.html` | Line 7 |
| `sns-dashboard/index.html` | Line 7 |
| `sns-dashboard/mobile.html` | Line 6 |
| `sns-admin/index.html` | Line 7 |
| `sns-admin/mobile.html` | Line 7 |
| `sns-client-chat/index.html` | Line 7 (extra: quilljs CDN) |
| `sns-client-chat/mobile.html` | Line 7 |
| `sns-client-list/index.html` | Line 7 |
| `sns-client-list/mobile.html` | Line 7 |
| `sns-inquiry/index.html` | Line 7 |
| `sns-inquiry/mobile.html` | Line 7 |
| `sns-inquiry-view/index.html` | Line 7 |
| `sns-inquiry-view/mobile.html` | Line 7 |
| `sns-inquiry-history/index.html` | Line 7 |
| `sns-inquiry-history/mobile.html` | Line 7 |
| `sns-portal-invite/index.html` | Line 7 |
| `sns-portal-invite/mobile.html` | Line 7 |

**Migration action**: Replace `https://*.supabase.co wss://*.supabase.co` with the new self-hosted domain (e.g., `https://api.kxsaku.com wss://api.kxsaku.com`). Also update `img-src`.

### Pages with NO CSP / NO Supabase (no changes needed):

- `index.html` (root redirect)
- `home/index.html`, `home/mobile.html`
- `credibility/index.html`, `credibility/mobile.html`
- `resources/index.html`, `resources/mobile.html`
- `sns/index.html`, `sns/mobile.html`
- `sns-inquiry-success/index.html`, `sns-inquiry-success/mobile.html`
- `sns-subscribe-success/index.html`, `sns-subscribe-success/mobile.html`
- `sns-subscribe-cancel/index.html`, `sns-subscribe-cancel/mobile.html`

---

## 6. Edge Functions — Detailed Analysis

### 6.1 Shared Modules (`_shared/`)

#### `_shared/auth.ts`
- **Env vars**: `SB_URL`, `SUPABASE_ANON_KEY`, `SB_SERVICE_ROLE_KEY`
- **Supabase services**: Auth (getUser), DB (user_profiles)
- **Exports**: `ensureAdmin()`, `ensureAuthenticated()`
- **Logic**: Validates JWT, checks `is_admin` flag in user_profiles table

#### `_shared/crypto.ts`
- **Env vars**: `CHAT_ENCRYPTION_KEY`
- **Supabase services**: None
- **Exports**: `encryptMessage()`, `decryptMessage()`, `getEncryptionKey()`, `isEncrypted()`
- **Logic**: AES-256-GCM with PBKDF2 key derivation, salt `"sns-chat-encryption-v1"`, 100k iterations
- **Format**: `enc:base64(iv):base64(ciphertext)`

#### `_shared/cors.ts`
- **Env vars**: `SITE_URL`, `ALLOWED_ORIGINS`
- **Hardcoded origins**: `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`
- **Exports**: `getCorsHeaders()`, `handleCorsPreflight()`, `jsonResponse()`

#### `_shared/audit.ts`
- **Env vars**: None (receives supabase client)
- **Supabase services**: DB (audit_logs table)
- **Exports**: `logAuditEvent()`
- **Logic**: Logs admin actions, extracts IP from cf-connecting-ip/x-forwarded-for/x-real-ip

#### `_shared/rate-limit.ts`
- **Env vars**: None
- **Supabase services**: None
- **Exports**: `checkRateLimit()`
- **Logic**: In-memory IP-based rate limiting. Presets: admin(30/min), auth(10/min), public(20/min), chat(60/min), webhook(100/min)

### 6.2 Edge Functions (24 total)

| Function | Auth | DB Tables | Storage | Ext APIs | Env Vars |
|----------|------|-----------|---------|----------|----------|
| **admin-broadcast** | Admin | chat_threads, chat_messages | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY |
| **admin-chat-client-list** | Admin | client_profiles, chat_threads | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY |
| **admin-chat-history** | Admin | chat_threads, chat_messages, chat_attachments | Signed URLs | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY |
| **admin-chat-send** | Admin | chat_threads, chat_messages, chat_attachments, client_profiles | Signed URLs | Resend | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY, RESEND_API_KEY, RESEND_FROM, APP_BASE_URL |
| **admin-chat-view-original** | Admin | chat_messages | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY |
| **admin-client-list** | Admin | client_profiles, billing_subscriptions | - | Stripe | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY |
| **admin-invite** | Admin | billing_subscriptions, client_profiles | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SITE_URL |
| **admin-notes** | Admin | sns_internal_notes | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY |
| **chat-attachment-signed-url** | Auth | chat_attachments, chat_threads | Signed download URLs | - | SB_URL, SB_SERVICE_ROLE_KEY, ADMIN_EMAIL |
| **chat-attachment-upload-url** | Auth | chat_threads, chat_attachments | Signed upload URLs | - | SB_URL, SB_SERVICE_ROLE_KEY, ADMIN_EMAIL |
| **client-chat-delete** | Auth | chat_threads, chat_messages | - | - | SB_URL, SB_SERVICE_ROLE_KEY |
| **client-chat-edit** | Auth | chat_threads, chat_messages | - | - | SB_URL, SB_SERVICE_ROLE_KEY, CHAT_ENCRYPTION_KEY |
| **client-chat-history** | Auth | chat_threads, client_profiles, chat_messages, chat_attachments | Signed URLs | - | SB_URL, SB_SERVICE_ROLE_KEY, CHAT_ENCRYPTION_KEY |
| **client-chat-mark-read** | Auth | chat_threads, chat_messages | - | - | SB_URL, SB_SERVICE_ROLE_KEY |
| **client-chat-send** | Auth | chat_threads, chat_messages, chat_attachments | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, CHAT_ENCRYPTION_KEY |
| **client-presence** | Auth | chat_threads | - | - | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY |
| **contact-email** | None | - | - | Resend | RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL |
| **create-checkout-session** | Auth | billing_subscriptions | - | Stripe | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SITE_URL |
| **create-portal-session** | Auth | billing_subscriptions | - | Stripe | SB_URL, SB_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, SITE_URL |
| **get-billing-status** | Auth | billing_subscriptions | - | - | SUPABASE_URL, SUPABASE_ANON_KEY |
| **inquiry-otp** | None | inquiries | - | Twilio | PROJECT_SUPABASE_URL, PROJECT_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID |
| **stripe-webhooks** | Stripe sig | billing_subscriptions | - | Stripe | SB_URL, SB_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET |
| **system-status-get** | None | sns_system_status | - | - | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY |
| **system-status-set** | Admin | user_profiles, sns_system_status | - | - | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY |

---

## 7. Frontend Pages — Detailed Analysis

### Pages WITH Supabase integration (need URL/key/CSP changes)

| Page | Supabase URL | Anon Key | CSP | createClient | Edge Functions Called | DB Direct |
|------|:---:|:---:|:---:|:---:|---|---|
| `sns-login/` (desktop+mobile) | Yes | Yes | Yes | Yes | - | auth.signInWithPassword |
| `sns-dashboard/` (desktop+mobile) | Yes | Yes | Yes | Yes | get-billing-status, create-checkout-session, create-portal-session | billing_subscriptions |
| `sns-admin/` (desktop+mobile) | Yes | Yes | Yes | Yes | admin-client-list, admin-chat-client-list, admin-invite, admin-broadcast, system-status-get/set | inquiries |
| `sns-client-chat/` (desktop+mobile) | Yes | Yes | Yes | Yes | client-chat-history/send/edit/delete/mark-read, chat-attachment-upload-url/signed-url, client-presence | Realtime: chat_messages |
| `sns-client-list/` (desktop+mobile) | Yes | Yes | Yes | Yes | admin-chat-history, admin-chat-send | - |
| `sns-inquiry/` (desktop+mobile) | Yes | Yes | Yes | - | inquiry-otp | - |
| `sns-inquiry-view/` (desktop+mobile) | Yes | Yes | Yes | Yes | - | inquiries (direct query) |
| `sns-inquiry-history/` (desktop+mobile) | Yes | Yes | Yes | Yes | - | inquiries (direct query) |
| `sns-portal-invite/` (desktop+mobile) | Yes | Yes | Yes | Yes | - | auth.signUp, auth.verifyOtp |
| `contact/` (desktop+mobile) | Yes | Yes | Yes | - | contact-email (direct fetch) | - |

### Pages WITHOUT Supabase integration (NO changes needed)

| Page | Purpose |
|------|---------|
| `index.html` | Root redirect to /home/ |
| `home/` (desktop+mobile) | Homepage / landing page |
| `credibility/` (desktop+mobile) | About / credibility page |
| `resources/` (desktop+mobile) | Resources / documentation |
| `sns/` (desktop+mobile) | Services overview |
| `sns-inquiry-success/` (desktop+mobile) | Inquiry submission confirmation |
| `sns-subscribe-success/` (desktop+mobile) | Subscription success confirmation |
| `sns-subscribe-cancel/` (desktop+mobile) | Subscription cancellation confirmation |

---

## 8. Mobile App — Detailed Analysis

### `sns-mobile/src/lib/supabase.ts`
- **Hardcoded URL**: `https://jgvxmpsjtkedzgygynbl.supabase.co` (fallback for `EXPO_PUBLIC_SUPABASE_URL`)
- **Hardcoded anon key**: Full key (fallback for `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- Creates Supabase client with SecureStore adapter (native) or localStorage (web)
- Auth config: autoRefreshToken + persistSession enabled

### `sns-mobile/src/lib/api.ts`
- Builds edge function URLs as `${SUPABASE_URL}/functions/v1/${functionName}`
- Calls 18 edge functions via typed wrappers
- Direct DB queries for `inquiries` table
- File upload: 2-stage presigned URL flow

### `sns-mobile/src/stores/authStore.ts`
- Zustand store for auth state
- Queries `user_profiles` table for email/is_admin
- Subscribes to `auth.onAuthStateChange()`

### `sns-mobile/src/stores/chatStore.ts`
- Zustand store for chat messages
- All operations via edge function wrappers (no direct DB)

### `sns-mobile/src/hooks/useRealtime.ts`
- Subscribes to `postgres_changes` on `chat_messages` table
- Channel naming: `chat-${threadId}`
- Filter: `thread_id=eq.${threadId}`

### `sns-mobile/src/hooks/usePresence.ts`
- 30-second heartbeat interval via `client-presence` edge function
- Sends offline signal on app background

### Mobile App Pages
- `login.tsx`: Auth via `signInWithPassword()`
- `invite-accept.tsx`: Queries `invites` table, calls `auth.signUp()`
- `chat.tsx`: Real-time chat + attachments + presence
- `dashboard.tsx`: Billing status + dashboard data
- `subscription.tsx`: Queries `billing_subscriptions`, Stripe checkout/portal
- `clients/[id].tsx`: Admin chat + client details + real-time
- `inquiries/[id].tsx`: Direct DB queries on `inquiries` table
- `notes/[id].tsx`: Edge function for notes CRUD
- `settings.tsx`: System status, invites, broadcast

---

## 9. Database Schema

### Tables (13 total)

| Table | Used By | Key Columns |
|-------|---------|-------------|
| `user_profiles` | auth.ts, authStore | id, email, is_admin |
| `client_profiles` | admin-chat-client-list, admin-chat-send, admin-client-list, admin-invite | user_id, email, contact_name, business_name, phone |
| `chat_threads` | Most chat functions | id, user_id, is_online, last_seen, admin_unread_count, client_unread_count, last_message_preview |
| `chat_messages` | All chat functions + Realtime | id, thread_id, sender_role, body, original_body, edited_at, deleted_at, read_by_client_at |
| `chat_attachments` | Attachment functions | id, message_id, thread_id, storage_path, file_name, file_type, file_size, uploader_user_id, uploader_role |
| `chat_notification_prefs` | (empty) | - |
| `chat_notification_state` | (empty) | - |
| `chat_presence` | (empty) | - |
| `billing_subscriptions` | Stripe/billing functions | user_id, stripe_customer_id, status, current_period_end, last_payment_status/amount/currency |
| `inquiries` | inquiry-otp, admin pages | id, name, email, phone, message, phone_verified, status, priority |
| `sns_internal_notes` | admin-notes | id, title, body, client_user_id, client_label |
| `sns_system_status` | system-status-get/set | id(=1), mode, message, updated_at |
| `audit_logs` | audit.ts | id, action, admin_email, target_table, target_id, details, ip_address |

### Custom Types
- `inquiry_priority` — enum for inquiry priority levels
- `inquiry_status` — enum for inquiry status

### RPC Functions
- `is_sns_admin()` — checks if current user is admin
- `refresh_chat_thread(p_thread_id)` — refreshes thread metadata
- `reset_work_orders()` — resets work order state

### Row-Level Security (RLS)
- `get-billing-status` explicitly uses anon key + user JWT for RLS enforcement
- Other functions use service role key to bypass RLS
- RLS policies need to be recreated on self-hosted instance

---

## 10. Storage

### Bucket: `chat-attachments`
- **44 files**, ~8.1 MB total
- **Path format**: `thread/48e6749b-2db7-4459-9000-85245715f896/{timestamp}_{hash}_{filename}`
- **File types**: JPG, PNG, TXT
- **Not yet downloaded** — storage export directory exists but is empty
- **Download requires**: Service role key in Authorization header

### Storage Operations in Code
- **Upload**: `chat-attachment-upload-url` generates presigned upload URLs
- **Download**: `chat-attachment-signed-url` generates presigned download URLs (10 min expiry)
- **Admin chat history**: Generates 1-hour signed URLs for inline display
- **Storage config** (config.toml): 50 MiB max file size, S3 protocol enabled

---

## 11. External Service Integrations

### Stripe
- **Pricing**: $100 one-time initiation fee + $75/mo subscription with 30-day trial
- **Webhook events handled**: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.payment_succeeded/paid/failed
- **Webhook signature**: HMAC-SHA256 timing-safe verification
- **API version**: 2023-10-16
- **Migration action**: Update Stripe webhook URL to new self-hosted endpoint

### Resend (Email)
- **Used by**: admin-chat-send (client notifications), contact-email (contact form)
- **Notification throttle**: 2-hour minimum interval per thread
- **Migration action**: None (Resend is external SaaS, just needs env vars)

### Twilio (SMS)
- **Used by**: inquiry-otp (phone OTP verification)
- **Service**: Twilio Verify
- **Migration action**: None (Twilio is external SaaS, just needs env vars)

---

## 12. Critical Migration Risks

### Risk 1: CHAT_ENCRYPTION_KEY (SEVERITY: CRITICAL)
- All 87 chat messages are AES-256-GCM encrypted at rest
- Encryption uses PBKDF2 with salt `"sns-chat-encryption-v1"` and 100k iterations
- If the key doesn't match, ALL messages become `[Decryption Error]`
- **Action**: Retrieve exact key from Supabase Cloud → Edge Functions → Environment Variables

### Risk 2: Environment Variable Naming Inconsistency (SEVERITY: HIGH)
- 3 different naming conventions for the same Supabase URL:
  - `SB_URL` (most functions)
  - `SUPABASE_URL` (system-status, billing)
  - `PROJECT_SUPABASE_URL` (inquiry-otp)
- Same for service role key: `SB_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PROJECT_SERVICE_ROLE_KEY`
- **Action**: Set ALL 6 URL/key vars to the same values in .env

### Risk 3: Auth User UUID Preservation (SEVERITY: HIGH)
- Frontend and database foreign keys reference specific UUIDs
- `4f33551e-14d0-46a1-94c7-53d611eafd4a` (brandon.sns@pm.me, admin)
- `0b0631fa-d2c2-4622-8ac4-54bd9b788639` (therealboltgamez@gmail.com, client)
- **Action**: Import auth users with exact UUIDs preserved

### Risk 4: Public Internet Access (SEVERITY: HIGH)
- kxsaku.com is on GitHub Pages (static, public)
- Browsers connect directly to Supabase from the client side
- Self-hosted instance MUST be publicly accessible via HTTPS
- **Action**: Set up Cloudflare Tunnel (recommended) or port forwarding

### Risk 5: Stripe Webhook URL (SEVERITY: MEDIUM)
- Stripe sends webhooks to the current Supabase cloud function URL
- Must update webhook endpoint URL in Stripe Dashboard
- **Action**: Brandon updates Stripe Dashboard after migration

### Risk 6: Docker-Host Resource Constraints (SEVERITY: MEDIUM)
- Self-hosted Supabase runs ~15 containers (PostgreSQL, GoTrue, Realtime, Kong, Storage, Studio, etc.)
- Estimated RAM: 2-3 GB additional
- Current usage: ~5.4 GB of 12 GB max
- **Action**: Check resources before deploying, may need to increase Hyper-V max RAM

### Risk 7: Supabase Client Import Method (SEVERITY: LOW)
- HTML pages import Supabase client via `https://esm.sh/@supabase/supabase-js@2`
- Some pages use `window.supabase.createClient()` (loaded via CDN script tag)
- Self-hosted Supabase uses the same client library — no change needed for imports

---

## 13. Migration Change Inventory

### Files that need Supabase URL replacement (21 files)
See Section 4.1 for complete list with line numbers.

### Files that need anon key replacement (21 files)
See Section 4.2 for complete list with line numbers.

### Files that need CSP updates (18 files)
See Section 5 for complete list.
- Replace: `https://*.supabase.co wss://*.supabase.co` in connect-src
- Replace: `https://*.supabase.co` in img-src
- Add: New self-hosted domain (e.g., `https://api.kxsaku.com wss://api.kxsaku.com`)

### Mobile app files that need updates (1 file)
- `sns-mobile/src/lib/supabase.ts`: Update fallback URL and anon key

### Edge functions (0 changes needed)
- All edge functions use environment variables — no code changes required
- Just set the correct env vars in self-hosted config

### Config files (0 changes needed for migration)
- `supabase/config.toml`: Local dev config only, not used in production
- `package.json` files: No Supabase-related changes needed

### External services that need URL updates
1. **Stripe Dashboard**: Update webhook endpoint URL
2. **Supabase Auth email templates**: Configure invite/reset email templates with correct URLs

---

## Appendix: Exported Data Summary

| Table | Rows | File Size |
|-------|------|-----------|
| audit_logs | 9 | 3.0 KB |
| auth_users | 2 | 1.1 KB |
| billing_subscriptions | 1 | 438 B |
| chat_attachments | 44 | 23.8 KB |
| chat_messages | 87 | 37.5 KB |
| chat_notification_prefs | 0 | 2 B |
| chat_notification_state | 0 | 2 B |
| chat_presence | 0 | 2 B |
| chat_threads | 2 | 1.3 KB |
| client_profiles | 1 | 399 B |
| inquiries | 1 | 1.2 KB |
| sns_internal_notes | 3 | 822 B |
| sns_system_status | 1 | 86 B |
| user_profiles | 1 | 253 B |
| **Storage files** | **44** | **~8.1 MB** (not yet downloaded) |
