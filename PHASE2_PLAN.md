# Phase 2: Self-Hosted Supabase — Architecture Plan

> **Status**: PLAN ONLY — no deployment yet. Awaiting Brandon's approval.

---

## 1. New VM: supabase-vm

| Setting | Value |
|---------|-------|
| **Hyper-V Host** | saku-server (192.168.10.36) |
| **VM Name** | Supabase-VM |
| **OS** | Ubuntu Server 24.04 LTS |
| **Generation** | 2 (UEFI) |
| **vCPU** | 2 |
| **RAM** | 4 GB min, 8 GB max (dynamic memory) |
| **Startup RAM** | 4 GB |
| **Disk** | 40 GB VHDX on D:\Hyper-V\Supabase-VM\ |
| **Network** | External-LAN switch (VLAN 10) |
| **Static IP** | 192.168.10.115 |
| **Gateway** | 192.168.10.1 |
| **DNS** | 192.168.10.114 (Pi-hole) |
| **Hostname** | supabase-vm |
| **SSH** | Key-only auth (copy docker-host's authorized_keys) |

### Why these specs?
- **4-8 GB RAM**: Supabase stack runs ~15 containers (PostgreSQL, GoTrue, Realtime, Kong, PostgREST, Storage, Meta, Edge Runtime, Studio, Vector, Imgproxy, etc.). 4 GB min handles idle/light load; 8 GB max allows burst during heavy queries.
- **40 GB disk**: Supabase images ~5-8 GB, PostgreSQL data is tiny (< 1 MB of actual data), plus OS + logs.
- **2 vCPU**: Sufficient for the workload (2 auth users, ~100 rows total).

### RAM Impact on saku-server
- Current: 32 GB total, ~20 GB assigned to running VMs, ~4 GB free
- After: Dynamic memory will reclaim from idle VMs. Docker-Host (12 GB max) and OSINT-VM (12 GB max) rarely use their full allocation. The new VM at 4-8 GB should fit within the dynamic pool.
- **Risk**: If multiple VMs spike simultaneously, memory pressure could occur. Monitor after deployment.

---

## 2. VM Creation Steps

```powershell
# On saku-server (Hyper-V host) via SSH

# 1. Create VM directory
New-Item -ItemType Directory -Path "D:\Hyper-V\Supabase-VM" -Force

# 2. Download Ubuntu 24.04 Server ISO (if not already present)
# Check D:\ISOs\ first — may already have it from OSINT-VM creation

# 3. Create VM
New-VM -Name "Supabase-VM" -Generation 2 -MemoryStartupBytes 4GB -NewVHDPath "D:\Hyper-V\Supabase-VM\Supabase-VM.vhdx" -NewVHDSizeBytes 40GB -SwitchName "External-LAN"

# 4. Configure dynamic memory
Set-VMMemory -VMName "Supabase-VM" -DynamicMemoryEnabled $true -MinimumBytes 4GB -MaximumBytes 8GB -StartupBytes 4GB

# 5. Set CPU
Set-VMProcessor -VMName "Supabase-VM" -Count 2

# 6. Disable Secure Boot for Ubuntu (Generation 2 VMs)
Set-VMFirmware -VMName "Supabase-VM" -EnableSecureBoot Off

# 7. Attach ISO
Add-VMDvdDrive -VMName "Supabase-VM" -Path "D:\ISOs\ubuntu-24.04-live-server-amd64.iso"

# 8. Set boot order (DVD first for install)
$dvd = Get-VMDvdDrive -VMName "Supabase-VM"
Set-VMFirmware -VMName "Supabase-VM" -FirstBootDevice $dvd

# 9. Start VM
Start-VM -VMName "Supabase-VM"
```

### Ubuntu Install Choices
- **Hostname**: supabase-vm
- **User**: saku / [standard password]
- **Install OpenSSH server**: Yes
- **Network**: Configure static IP post-install via Netplan

### Post-Install Network Config (Netplan)
```yaml
# /etc/netplan/01-static.yaml
network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - 192.168.10.115/24
      routes:
        - to: default
          via: 192.168.10.1
      nameservers:
        addresses:
          - 192.168.10.114
        search:
          - saku.local
```

### Post-Install Software
```bash
# Update
sudo apt update && sudo apt upgrade -y

# Docker
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker saku

# Cloudflared
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflare-deno $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Git (for cloning Supabase)
sudo apt install -y git
```

---

## 3. Supabase Docker Stack

### Directory Structure
```
/home/saku/supabase/
├── docker-compose.yml    # Official Supabase docker-compose (customized)
├── .env                  # All secrets and config
├── volumes/
│   ├── db/               # PostgreSQL data
│   │   └── init/         # SQL init scripts (schema + data import)
│   ├── functions/        # Edge functions (mounted from repo)
│   └── storage/          # File storage
```

### Setup Method
```bash
# Clone official Supabase Docker setup
git clone --depth 1 https://github.com/supabase/supabase /home/saku/supabase-repo
cp -r /home/saku/supabase-repo/docker/* /home/saku/supabase/

# Copy edge functions from kxsaku-site repo
# (scp from docker-host or clone the repo)
```

### Port Mapping (all internal to VM, Kong is the single entry point)

| Service | Container Port | Host Port | Notes |
|---------|---------------|-----------|-------|
| Kong (API Gateway) | 8000 | 8000 | Main API entry point — Cloudflare Tunnel points here |
| Supabase Studio | 3000 | 8401 | Admin UI (internal access only) |
| PostgreSQL | 5432 | 5432 | Internal only |
| GoTrue (Auth) | 9999 | — | Behind Kong, not exposed directly |
| Realtime | 4000 | — | Behind Kong, not exposed directly |
| PostgREST | 3000 | — | Behind Kong, not exposed directly |
| Storage | 5000 | — | Behind Kong, not exposed directly |
| Edge Functions | 9000 | — | Behind Kong, not exposed directly |

Kong consolidates all services behind a single port (8000). This is the standard Supabase self-hosted architecture.

### Environment Variables (.env)

```bash
############
# Secrets
############
POSTGRES_PASSWORD=<generate-strong-40-char>
JWT_SECRET=<generate-64-char-secret>
ANON_KEY=<generated-from-JWT_SECRET>
SERVICE_ROLE_KEY=<generated-from-JWT_SECRET>
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=<generate-strong-password>

############
# General
############
SITE_URL=https://kxsaku.com
API_EXTERNAL_URL=https://api.kxsaku.com
STUDIO_DEFAULT_ORGANIZATION=SNS
STUDIO_DEFAULT_PROJECT=kxsaku

############
# Database
############
POSTGRES_HOST=db
POSTGRES_DB=postgres
POSTGRES_PORT=5432

############
# Auth (GoTrue)
############
GOTRUE_SITE_URL=https://kxsaku.com
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_SMS_AUTOCONFIRM=false
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_JWT_EXP=3600

############
# Edge Functions (carried from Supabase Cloud — Brandon provides values)
############
# These are the env vars that edge functions read via Deno.env.get()
# Three naming conventions must ALL be set:

# Convention 1 (most functions)
SB_URL=https://api.kxsaku.com
SB_SERVICE_ROLE_KEY=<same-as-SERVICE_ROLE_KEY>

# Convention 2 (system-status, billing)
SUPABASE_URL=https://api.kxsaku.com
SUPABASE_ANON_KEY=<same-as-ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<same-as-SERVICE_ROLE_KEY>

# Convention 3 (inquiry-otp)
PROJECT_SUPABASE_URL=https://api.kxsaku.com
PROJECT_SERVICE_ROLE_KEY=<same-as-SERVICE_ROLE_KEY>

# Encryption (generate NEW key since old data is being discarded)
CHAT_ENCRYPTION_KEY=<generate-new-64-char-key>

# External services (Brandon provides these)
STRIPE_SECRET_KEY=<placeholder>
STRIPE_WEBHOOK_SECRET=<placeholder>
STRIPE_PRICE_ID=<placeholder>
RESEND_API_KEY=<placeholder>
RESEND_FROM=<placeholder>
CONTACT_TO_EMAIL=<placeholder>
CONTACT_FROM_EMAIL=<placeholder>
APP_BASE_URL=https://kxsaku.com
ADMIN_EMAIL=brandon.sns@pm.me
TWILIO_ACCOUNT_SID=<placeholder>
TWILIO_AUTH_TOKEN=<placeholder>
TWILIO_VERIFY_SERVICE_SID=<placeholder>
ALLOWED_ORIGINS=https://kxsaku.com
```

### JWT Key Generation
The ANON_KEY and SERVICE_ROLE_KEY are JWTs signed with JWT_SECRET. Generate them using:
```bash
# After choosing a JWT_SECRET, generate keys using the Supabase JWT tool
# or manually create JWTs with these payloads:

# ANON_KEY payload:
# { "role": "anon", "iss": "supabase", "iat": <now>, "exp": <now+10years> }

# SERVICE_ROLE_KEY payload:
# { "role": "service_role", "iss": "supabase", "iat": <now>, "exp": <now+10years> }
```

---

## 4. Cloudflare Tunnel

### Approach
Run `cloudflared` directly on the new VM, creating a tunnel for `api.kxsaku.com`.

Since `kxsaku.com` is already on Cloudflare DNS, we can add the subdomain via the tunnel.

### Setup Steps
```bash
# 1. Authenticate cloudflared (requires browser — do via SSH port forward or token)
cloudflared tunnel login

# 2. Create tunnel
cloudflared tunnel create supabase-vm

# 3. Configure tunnel
cat > /home/saku/.cloudflared/config.yml << 'EOF'
tunnel: <tunnel-id>
credentials-file: /home/saku/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: api.kxsaku.com
    service: http://localhost:8000
  - service: http_status:404
EOF

# 4. Route DNS
cloudflared tunnel route dns supabase-vm api.kxsaku.com

# 5. Install as systemd service
sudo cloudflared service install

# 6. Start
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### Result
- `https://api.kxsaku.com` → Cloudflare Tunnel → VM:8000 (Kong) → Supabase services
- WebSocket support: `wss://api.kxsaku.com/realtime/v1/...` works through Cloudflare Tunnel
- No port forwarding needed on router

### Internal Access
- `supabase.saku.local` → 192.168.10.115 (Pi-hole DNS entry)
- Studio (admin UI): `http://192.168.10.115:8401` (internal only, no Cloudflare exposure)

---

## 5. DNS Configuration

### Pi-hole (for internal .saku.local)
Add to Pi-hole custom DNS:
```
192.168.10.115  supabase.saku.local
```

### Cloudflare (for public access)
The `cloudflared tunnel route dns` command automatically creates:
```
api.kxsaku.com  CNAME  <tunnel-id>.cfargotunnel.com
```

---

## 6. Database Schema & Data Import

### Approach
Since all chat messages are test data, we'll:
1. Create the full schema (13 tables, types, RPC functions, RLS policies)
2. Import only essential data (user profiles, client profiles, system status)
3. Skip chat messages (test data)
4. Recreate auth users with same UUIDs

### Init Script Location
```
/home/saku/supabase/volumes/db/init/
├── 01-schema.sql          # Table definitions, types, triggers
├── 02-rpc-functions.sql   # RPC functions
├── 03-rls-policies.sql    # Row-level security policies
├── 04-seed-data.sql       # Essential data import
├── 05-auth-users.sql      # Auth user recreation
```

### Auth Users to Recreate
| Email | UUID | Role |
|-------|------|------|
| brandon.sns@pm.me | 4f33551e-14d0-46a1-94c7-53d611eafd4a | Admin |
| therealboltgamez@gmail.com | 0b0631fa-d2c2-4622-8ac4-54bd9b788639 | Client (test) |

### Data to Import
| Table | Rows | Import? | Reason |
|-------|------|---------|--------|
| user_profiles | 1 | Yes | Admin profile |
| client_profiles | 1 | Yes | Test client profile |
| billing_subscriptions | 1 | Yes | Subscription state |
| sns_system_status | 1 | Yes | System config |
| inquiries | 1 | Yes | Test inquiry |
| sns_internal_notes | 3 | Yes | Admin notes |
| audit_logs | 9 | Skip | Test logs, not critical |
| chat_messages | 87 | Skip | Test data (encrypted, key discarded) |
| chat_threads | 2 | Skip | Will be recreated on first message |
| chat_attachments | 44 | Skip | Test attachments |
| chat_notification_prefs | 0 | Skip | Empty |
| chat_notification_state | 0 | Skip | Empty |
| chat_presence | 0 | Skip | Empty |

### Storage
- Skip importing the 44 test files (all test chat attachments)
- Create empty `chat-attachments` bucket

---

## 7. Edge Functions Deployment

### Method
Self-hosted Supabase uses the Edge Runtime container. Functions are mounted as volumes.

```yaml
# In docker-compose.yml, the edge-functions service mounts:
volumes:
  - /home/saku/supabase/functions:/home/deno/functions
```

### Steps
1. Copy edge functions from the kxsaku-site repo to the VM
2. Mount the functions directory into the Edge Runtime container
3. All 24 functions + 5 shared modules will be available

```bash
# On supabase-vm:
scp -r saku@192.168.10.114:/home/saku/kxsaku-site/supabase/functions /home/saku/supabase/functions
```

---

## 8. Frontend Changes (Phase 5 Preview)

### What changes in every affected file

**Old** → **New**:
| Find | Replace |
|------|---------|
| `https://jgvxmpsjtkedzgygynbl.supabase.co` | `https://api.kxsaku.com` |
| `eyJhbGciOiJIUzI1NiIs...cr3w6Y` (old anon key) | `<new-anon-key>` |
| `https://*.supabase.co` (in CSP) | `https://api.kxsaku.com` |
| `wss://*.supabase.co` (in CSP) | `wss://api.kxsaku.com` |

### Mobile app
- `sns-mobile/src/lib/supabase.ts`: Update fallback URL and anon key

### 21 files need URL changes, 21 need key changes, 18 need CSP changes
(Full list in MIGRATION_ANALYSIS.md)

---

## 9. Stripe Webhook Update

Brandon must update the Stripe Dashboard:
- **Old webhook URL**: `https://jgvxmpsjtkedzgygynbl.supabase.co/functions/v1/stripe-webhooks`
- **New webhook URL**: `https://api.kxsaku.com/functions/v1/stripe-webhooks`
- A new webhook signing secret will be generated — update `STRIPE_WEBHOOK_SECRET` env var

---

## 10. Deployment Order

1. Create VM on saku-server (Hyper-V)
2. Install Ubuntu 24.04, configure static IP, install Docker + cloudflared
3. Set up Supabase Docker stack with .env
4. Create database schema + import essential data
5. Deploy edge functions (mount volume)
6. Set up Cloudflare Tunnel (`api.kxsaku.com`)
7. Add Pi-hole DNS entry (`supabase.saku.local`)
8. Test all endpoints from internal network
9. Brandon provides external service env vars (Stripe, Resend, Twilio)
10. Test external integrations
11. Create git branch with frontend URL/key changes
12. Brandon reviews + pushes frontend changes
13. Brandon updates Stripe webhook URL
14. Final verification

---

## 11. Questions for Brandon Before Proceeding

1. **VM name**: `Supabase-VM` — OK?
2. **IP**: `192.168.10.115` — OK? (next to docker-host at .114)
3. **Cloudflare subdomain**: `api.kxsaku.com` — OK? (alternative: `supabase.kxsaku.com`)
4. **Should Studio be accessible?** I've kept it internal-only (192.168.10.115:8401). Want it behind a Cloudflare Tunnel too?
5. **Ubuntu ISO**: Is there already one on saku-server (D:\ISOs\)? If not, I'll need you to download one or I can download via SSH.
6. **VM creation**: Can I proceed to create the VM via SSH to saku-server, or do you want to create it manually via Hyper-V Manager?
7. **Cloudflare auth**: `cloudflared tunnel login` requires a browser. Options:
   a. Brandon runs it via AnyDesk/vmconnect
   b. Use a pre-existing Cloudflare API token (same one used for alexa.kxsaku.com?)
   c. Set up token-based auth instead of browser login

---

## Cost Summary

| Resource | Cost |
|----------|------|
| VM (Hyper-V) | Free (existing hardware) |
| Supabase self-hosted | Free (open source) |
| Cloudflare Tunnel | Free tier |
| Domain (api.kxsaku.com) | Free (subdomain of existing domain) |
| **Total** | **$0/month** |
