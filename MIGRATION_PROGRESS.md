# Supabase Self-Hosting Migration — Progress Tracker

## Phase 1: Complete Code Analysis
- [x] Read all 5 shared modules (_shared/)
- [x] Read all 24 edge functions
- [x] Read all 35 frontend HTML pages (desktop + mobile variants)
- [x] Read all 15 mobile app source files (sns-mobile/)
- [x] Read all config files (config.toml, package.json x2, CNAME, styles.css)
- [x] Grep for all hardcoded Supabase URLs
- [x] Grep for all anon key references
- [x] Grep for all CSP connect-src directives
- [x] Grep for all wss:// WebSocket URLs
- [x] Map all environment variable names across edge functions
- [x] Verify storage export contents
- [x] Identify pages with NO Supabase integration
- [x] Write MIGRATION_ANALYSIS.md
- **Status**: COMPLETE

## Phase 2: Set Up Self-Hosted Supabase
- [x] Prerequisites check (RAM: 32GB total/4GB free, Disk: 353GB free on D:)
- [x] Architecture plan written (PHASE2_PLAN.md)
- [x] Decided: Dedicated Hyper-V VM (NOT docker-host)
- [x] VM specs: Ubuntu 24.04, 4-8GB dynamic, 40GB, 2 vCPU, IP 192.168.10.115
- [x] Cloudflare Tunnel plan: api.kxsaku.com → VM:8000 (Kong)
- [x] Env var mapping with all 3 naming conventions documented
- [x] Brandon's answers received — all 7 questions resolved
- [x] Verified: No Ubuntu ISO on saku-server (D:\ISOs\ empty) — must download
- [x] Verified: Existing cloudflared tunnel (`plex-remote`) on docker-host can be reused — just add api.kxsaku.com route
- [x] Verified: VM storage at D:\VMs\ (OSINT-VM, CA1, NPS1 already there)
- [x] Deployment checklist written (DEPLOYMENT_CHECKLIST.md)
- [x] VM created (cloud image approach — autoinstall failed, pivoted to Ubuntu cloud image)
- [x] Ubuntu 24.04 + Docker + SSH configured via cloud-init
- [x] Supabase Docker stack deployed (13/13 containers healthy)
- [x] Cloudflare Tunnel: api.kxsaku.com route added to plex-remote tunnel
- **Status**: COMPLETE

## Phase 3: Data Migration
- [x] Created 13 tables, 3 RPC functions, RLS policies, triggers, realtime publication
- [x] Imported seed data (user_profiles, client_profiles, billing, system_status, inquiries, notes)
- [x] Auth users created via GoTrue Admin API (2 users)
- [x] Skipped old chat data (test data, encryption key discarded)
- [x] Created chat-attachments storage bucket
- **Status**: COMPLETE

## Phase 4: Deploy Edge Functions
- [x] 24 functions + 5 shared modules deployed
- [x] docker-compose.override.yml with all 3 naming conventions + external service vars
- **Status**: COMPLETE

## Phase 5: Update Frontend
- [x] Branch `feat/self-hosted-supabase` created
- [x] Replaced Supabase URLs in 21 files
- [x] Replaced anon keys in 21 files
- [x] Updated CSP directives in 18 files
- [x] Updated mobile app config (supabase.ts)
- [x] Verified: 0 old references remain
- **Status**: COMPLETE (branch ready for Brandon's review)

## Phase 6: Verification
- [x] Auth: admin login (PASS)
- [x] Auth: client login (PASS — fixed NULL columns + identity record)
- [x] Database: REST API queries (PASS — user_profiles, inquiries, system_status)
- [x] Chat: encryption at rest (PASS — enc:... format verified in DB)
- [x] Chat: decryption on retrieval (PASS — admin-chat-history returns plaintext)
- [x] Chat: client send + receive (PASS)
- [x] Storage: bucket listing (PASS)
- [x] Edge functions: 18 tested, all pass (external service functions need real API keys)
- [x] Cloudflare Tunnel: public access via api.kxsaku.com (PASS)
- [x] Presence tracking: heartbeat (PASS)
- **Status**: COMPLETE

## Remaining (Brandon's Action Items)
- [ ] Review + merge `feat/self-hosted-supabase` branch
- [ ] Set real passwords for both auth users (via Studio)
- [ ] Provide Stripe/Resend/Twilio API keys
- [ ] Update Stripe webhook URL in Stripe Dashboard
- [ ] Add Supabase-VM to VM backup schedule (optional)
