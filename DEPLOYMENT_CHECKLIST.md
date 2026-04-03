# Supabase Self-Hosting — Final Deployment Checklist

> **Status**: AWAITING BRANDON'S GREEN LIGHT — nothing runs until approved.

---

## Pre-Flight Summary

| Item | Value |
|------|-------|
| **VM Name** | Supabase-VM |
| **Hyper-V Host** | saku-server (192.168.10.36) |
| **VM Location** | D:\VMs\Supabase-VM\ |
| **OS** | Ubuntu Server 24.04 LTS |
| **Specs** | 2 vCPU, 4-8 GB dynamic RAM, 40 GB VHDX |
| **IP** | 192.168.10.115 (VLAN 10, static) |
| **Public URL** | https://api.kxsaku.com |
| **Internal URL** | http://supabase.saku.local:8000 (API), http://192.168.10.115:8401 (Studio) |
| **Tunnel** | Reuse existing `plex-remote` tunnel on docker-host (add api.kxsaku.com route) |
| **Ubuntu ISO** | Must download (~2.6 GB) to D:\ISOs\ on saku-server |
| **Total cost** | $0/month |

---

## Deployment Steps (in exact order)

### Step 1: Download Ubuntu ISO
**What**: Download Ubuntu 24.04.2 Server ISO to saku-server
**Where**: `D:\ISOs\ubuntu-24.04-live-server-amd64.iso`
**How**: PowerShell `Invoke-WebRequest` or `curl` on saku-server via SSH
**Risk**: None. Downloads a file. ~2.6 GB, takes a few minutes on gigabit.
**Reversible**: Yes (delete the file)

### Step 2: Create Hyper-V VM
**What**: Create the VM shell via PowerShell Hyper-V cmdlets over SSH
**Commands** (summary):
```
New-VM "Supabase-VM" -Generation 2 -Memory 4GB -NewVHDPath "D:\VMs\Supabase-VM\disk.vhdx" -NewVHDSizeBytes 40GB -Switch "External-LAN"
Set-VMMemory -DynamicMemoryEnabled $true -Min 4GB -Max 8GB
Set-VMProcessor -Count 2
Set-VMFirmware -EnableSecureBoot Off
Attach DVD, set boot order
Start-VM
```
**Risk**: None to existing infrastructure. Creates new, isolated VM.
**Reversible**: `Remove-VM "Supabase-VM" -Force; Remove-Item D:\VMs\Supabase-VM -Recurse`

### Step 3: Install Ubuntu (REQUIRES BRANDON)
**What**: Brandon connects to VM console via Hyper-V Manager (vmconnect) to complete Ubuntu installer
**Why Claude can't do this**: Gen 2 VM console requires vmconnect GUI. No SSH until OS is installed.
**Brandon does**:
1. Open Hyper-V Manager → Connect to Supabase-VM
2. Walk through Ubuntu Server installer:
   - Language: English
   - Keyboard: US
   - Network: DHCP is fine (we'll set static after)
   - Storage: Use entire disk (40 GB)
   - Profile: Name `saku`, hostname `supabase-vm`, password: [standard]
   - Install OpenSSH server: **YES**
   - No snaps
3. Reboot when done
4. Tell Claude the VM is ready

**Estimated time**: ~10 minutes hands-on

### Step 4: Configure VM (Claude via SSH)
**What**: Once Ubuntu is installed and SSH-able, Claude configures:
1. Set static IP via Netplan (192.168.10.115/24, gw .10.1, dns .10.114)
2. Add SSH authorized keys (key-only auth)
3. Install Docker + Docker Compose
4. Install git
5. Basic hardening (UFW, disable password SSH)

**Risk**: Low. Standard server setup.
**Reversible**: Yes (reconfigure or destroy VM)

### Step 5: Deploy Supabase Docker Stack
**What**: Clone official Supabase Docker setup, configure .env, start containers
**Details**:
1. Clone Supabase Docker repo
2. Generate secrets (JWT_SECRET, POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY, CHAT_ENCRYPTION_KEY)
3. Configure .env with all environment variables (placeholders for Stripe/Resend/Twilio)
4. Set all 3 naming conventions for Supabase URL/keys
5. `docker compose up -d`
6. Verify all ~15 containers are healthy

**Risk**: Isolated to the new VM. No impact on existing services.
**Reversible**: `docker compose down -v`

### Step 6: Database Schema + Data
**What**: Create tables, import essential data, recreate auth users
**Details**:
1. Run SQL init scripts (13 tables, custom types, RPC functions, RLS policies)
2. Import essential data (user_profiles, client_profiles, billing_subscriptions, system_status, inquiries, notes)
3. Skip test data (chat messages, attachments, audit logs)
4. Create auth users with preserved UUIDs
5. Create empty `chat-attachments` storage bucket

**Risk**: None to production. Fresh database.
**Reversible**: Drop and recreate

### Step 7: Deploy Edge Functions
**What**: Copy 24 edge functions + 5 shared modules to VM, mount in Docker
**How**: SCP from docker-host → supabase-vm, configure Docker volume mount
**Risk**: None. File copy operation.
**Reversible**: Yes

### Step 8: Add Cloudflare Tunnel Route (on docker-host)
**What**: Add `api.kxsaku.com` → `http://192.168.10.115:8000` to existing `plex-remote` tunnel
**Current tunnel config** (`~/.cloudflared/config.yml` on docker-host):
```yaml
tunnel: plex-remote
credentials-file: /home/saku/.cloudflared/8ba51d98-0433-4845-865e-1f8a5fef1864.json

ingress:
  - hostname: plex.kxsaku.com
    service: http://192.168.10.36:32400
  - hostname: alexa.kxsaku.com
    service: http://127.0.0.1:5560
  - service: http_status:404
```
**Change**: Add one rule:
```yaml
  - hostname: api.kxsaku.com
    service: http://192.168.10.115:8000
```
Then: `cloudflared tunnel route dns plex-remote api.kxsaku.com` + restart cloudflared service.

**Risk**: LOW — adding a new route to an existing tunnel. Existing plex.kxsaku.com and alexa.kxsaku.com routes are unchanged. But a cloudflared restart briefly interrupts ALL tunnel routes (Plex remote + SakuVoice) for ~2-3 seconds.
**Reversible**: Remove the route line, restart again.

### Step 9: Add Pi-hole DNS Entry
**What**: Add `supabase.saku.local → 192.168.10.115` to Pi-hole
**How**: Pi-hole v6 uses `pihole.toml` hosts array
**Risk**: None. Adding a DNS entry.
**Reversible**: Remove the entry

### Step 10: Verify Internal Connectivity
**What**: Test from docker-host:
- `curl http://192.168.10.115:8000/rest/v1/` (PostgREST)
- `curl http://192.168.10.115:8000/auth/v1/health` (GoTrue)
- `curl http://192.168.10.115:8000/storage/v1/` (Storage)
- Access Studio at `http://192.168.10.115:8401`
- Test edge function: `curl http://192.168.10.115:8000/functions/v1/system-status-get`

### Step 11: Verify Public Connectivity
**What**: Test `https://api.kxsaku.com` from external network (or via curl with Cloudflare)
- API health check
- WebSocket connectivity (wss://api.kxsaku.com/realtime/v1/...)
- Auth login test

### Step 12: Brandon Provides External Service Keys
**What**: Brandon fills in placeholder env vars:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `RESEND_API_KEY`, `RESEND_FROM`
- `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`

### Step 13: Create Frontend Branch
**What**: Create git branch `feat/self-hosted-supabase` with all URL/key/CSP changes
**Changes**: 21 files URL swap, 21 files key swap, 18 files CSP update, 1 mobile file
**Risk**: None. Branch only — no push to main.
**Reversible**: Delete branch

### Step 14: Brandon Reviews + Deploys
**Brandon does**:
1. Review git diff on the branch
2. Push branch + merge to main (GitHub Pages auto-deploys)
3. Update Stripe webhook URL in Stripe Dashboard
4. Test login at kxsaku.com
5. Verify end-to-end flow

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| cloudflared restart interrupts Plex remote + SakuVoice for ~3s | LOW | Schedule during low-usage time |
| Supabase stack uses more RAM than expected | MEDIUM | Dynamic memory caps at 8 GB; monitor after deploy |
| Edge functions fail on self-hosted runtime | MEDIUM | Test each function individually before frontend switch |
| Frontend switch breaks client access | LOW | Old cloud Supabase stays untouched as fallback; can revert branch |

## What Claude Does vs. What Brandon Does

| Task | Who |
|------|-----|
| Download Ubuntu ISO | Claude (SSH) |
| Create Hyper-V VM | Claude (SSH + PowerShell) |
| **Install Ubuntu via console** | **Brandon (vmconnect)** |
| Configure VM (SSH, Docker, static IP) | Claude |
| Deploy Supabase stack | Claude |
| Database schema + data import | Claude |
| Deploy edge functions | Claude |
| Add Cloudflare tunnel route | Claude (with Brandon's OK on timing) |
| Add Pi-hole DNS | Claude |
| All verification testing | Claude |
| **Provide external API keys** | **Brandon** |
| Create frontend git branch | Claude |
| **Review + push frontend changes** | **Brandon** |
| **Update Stripe webhook URL** | **Brandon** |

---

## Give the green light?

Reply with approval to start Step 1 (downloading Ubuntu ISO to saku-server). Steps 1-2 are fully automated. Step 3 will need you at the Hyper-V console for ~10 minutes.
