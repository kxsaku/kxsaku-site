    const SUPABASE_URL = "https://api.kxsaku.com";
    const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function checkIsAdmin(userId) {
      const { data } = await sb.from("user_profiles").select("is_admin").eq("user_id", userId).maybeSingle();
      return data?.is_admin === true;
    }

    const adminCard = document.getElementById("adminCard");
    const whoami = document.getElementById("whoami");
    const logoutBtn = document.getElementById("logoutBtn");

    const errBox = document.getElementById("errBox");
    const okBox = document.getElementById("okBox");
    const rowsEl = document.getElementById("rows");
    const metaEl = document.getElementById("meta");
    const summaryPill = document.getElementById("summaryPill");

    const searchBox = document.getElementById("searchBox");
    const refreshBtn = document.getElementById("refreshBtn");

    const loginOverlay = document.getElementById("loginOverlay");
    const loginEmail = document.getElementById("loginEmail");
    const loginPass  = document.getElementById("loginPass");
    const loginBtn   = document.getElementById("loginBtn");
    const loginErr   = document.getElementById("loginErr");
    const loginHint  = document.getElementById("loginHint");
    const loginCloseBtn = document.getElementById("loginCloseBtn");

    const detailsModal = document.getElementById("detailsModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const closeModalBtn2 = document.getElementById("closeModalBtn2");
    const detailsTitle = document.getElementById("detailsTitle");
    const detailsSub = document.getElementById("detailsSub");
    const detailsGrid = document.getElementById("detailsGrid");
    const copyJsonBtn = document.getElementById("copyJsonBtn");

    let allClients = [];
    let currentFilter = "all";
    let selectedClientForCopy = null;

    function showErr(msg){ errBox.style.display = "block"; errBox.textContent = msg || "Unknown error"; okBox.style.display = "none"; }
    function showOk(msg){ okBox.style.display = "block"; okBox.textContent = msg || "OK"; errBox.style.display = "none"; }
    function clearMsgs(){ errBox.style.display = "none"; okBox.style.display = "none"; errBox.textContent = ""; okBox.textContent = ""; }

    function fmtDate(ts){ if (!ts) return "—"; const d = new Date(ts * 1000); return d.toLocaleString([], { year:"numeric", month:"short", day:"2-digit" }); }
    function fmtMoney(amountCents, currency){
      if (amountCents == null) return "—";
      const cur = (currency || "usd").toUpperCase();
      const dollars = Number(amountCents) / 100;
      try { return new Intl.NumberFormat(undefined, { style:"currency", currency: cur }).format(dollars); }
      catch { return `${dollars.toFixed(2)} ${cur}`; }
    }
    function fmtAge(createdTs){
      if (!createdTs) return "—";
      const ms = Date.now() - (createdTs * 1000);
      const days = Math.max(0, Math.floor(ms / 86400000));
      if (days < 1) return "Today";
      if (days === 1) return "1 day";
      if (days < 30) return `${days} days`;
      const months = Math.floor(days / 30);
      if (months === 1) return "1 month";
      if (months < 24) return `${months} months`;
      const years = Math.floor(months / 12);
      return years === 1 ? "1 year" : `${years} years`;
    }

    function normalize(s){ return (s || "").toString().trim(); }
    function includesCI(hay, needle){ return normalize(hay).toLowerCase().includes(normalize(needle).toLowerCase()); }

    function getCategory(client){
      const cat = normalize(client?.subscription?.category).toLowerCase();
      if (["active","trialing","inactive","never"].includes(cat)) return cat;

      const st = normalize(client?.subscription?.status).toLowerCase();
      if (st === "active") return "active";
      if (st === "trialing") return "trialing";

      const hasStripe = !!(client?.subscription?.stripe_customer_id || client?.subscription?.stripe_subscription_id);
      const hasPaid = (client?.subscription?.total_paid_cents ?? null) != null && Number(client.subscription.total_paid_cents) > 0;
      if (hasStripe || hasPaid) return "inactive";
      return "never";
    }

    function statusTag(client){
      const cat = getCategory(client);
      if (cat === "active")   return `<span class="tag"><span class="dot dot-green"></span>Active</span>`;
      if (cat === "trialing") return `<span class="tag"><span class="dot dot-yellow"></span>Trialing</span>`;
      if (cat === "inactive") return `<span class="tag"><span class="dot dot-red"></span>Inactive</span>`;
      return `<span class="tag"><span class="dot dot-gray"></span>Never Purchased</span>`;
    }

    async function callEdge(fnName, payload = {}){
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      let res;
      try{
        res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }catch(fetchErr){
        // Most common causes: missing Edge Function deployment, network/CORS error, adblock, or blocked third-party requests.
        throw new Error(fetchErr?.message || "NetworkError when attempting to fetch resource.");
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Request failed");
      return j;
    }

    function escapeHtml(s){
      return (s ?? "").toString()
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll("\"","&quot;")
        .replaceAll("'","&#039;");
    }
    function escapeAttr(s){ return escapeHtml(s).replaceAll("`","&#096;"); }

    function render(){
      const q = normalize(searchBox.value);
      let list = allClients.slice();

      if (currentFilter !== "all") list = list.filter(c => getCategory(c) === currentFilter);

      if (q){
        list = list.filter(c => {
          const p = c.profile || c;
          return (
            includesCI(p.full_name, q) ||
            includesCI(p.business_name, q) ||
            includesCI(p.email, q) ||
            includesCI(p.phone, q)
          );
        });
      }

      rowsEl.innerHTML = list.map(c => {
        const p = c.profile || c;
        const id = p.user_id || c.user_id || "";
        const name = normalize(p.full_name) || normalize(p.name) || "—";
        const biz  = normalize(p.business_name) || "—";
        const phone = normalize(p.phone) || "—";

        return `
          <tr>
            <td>${statusTag(c)}</td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(biz)}</td>
            <td>${escapeHtml(phone)}</td>
            <td style="text-align:right;">
              <button class="btn btn-primary" data-view="${escapeAttr(id)}">View</button>
            </td>
          </tr>
        `;
      }).join("");

      summaryPill.textContent = `${list.length} client${list.length === 1 ? "" : "s"}`;
      metaEl.textContent = allClients.length ? `Loaded ${allClients.length} total. Filter: ${currentFilter.toUpperCase()}` : "";
    }

    function openModal(client){
      selectedClientForCopy = client;
      const p = client.profile || client;
      const cat = getCategory(client).toUpperCase();
      const st = normalize(client?.subscription?.status).toUpperCase() || cat;

      detailsTitle.textContent = "Client details";
      detailsSub.textContent = `${normalize(p.full_name) || "Client"} · ${cat} (${st})`;

      const sub = client.subscription || {};
      const fields = [
        ["Subscription category", cat],
        ["Stripe status", normalize(sub.status) || "—"],
        ["Subscription started", fmtDate(sub.created_ts)],
        ["Next payment due", fmtDate(sub.current_period_end_ts)],
        ["Total paid (lifetime)", fmtMoney(sub.total_paid_cents, sub.currency)],
        ["Subscription age", fmtAge(sub.created_ts)],

        ["Full name", normalize(p.full_name) || "—"],
        ["Business name", normalize(p.business_name) || "—"],
        ["Phone", normalize(p.phone) || "—"],
        ["Email", normalize(p.email) || "—"],

        ["Business location", normalize(p.business_location) || normalize(p.location) || "—"],
        ["Address", normalize(p.address) || "—"],
        ["City", normalize(p.city) || "—"],
        ["State", normalize(p.state) || "—"],
        ["ZIP", normalize(p.zip) || "—"],

        ["User ID", normalize(p.user_id || client.user_id) || "—"],
        ["Stripe customer id", normalize(sub.stripe_customer_id) || "—"],
        ["Stripe subscription id", normalize(sub.stripe_subscription_id) || "—"],
      ];

      detailsGrid.innerHTML = fields.map(([k,v]) => `
        <div class="kv">
          <div class="k">${escapeHtml(k)}</div>
          <div class="v">${escapeHtml(v)}</div>
        </div>
      `).join("");

      detailsModal.classList.add("open");
      detailsModal.setAttribute("aria-hidden","false");
    }

    function closeModal(){
      detailsModal.classList.remove("open");
      detailsModal.setAttribute("aria-hidden","true");
      selectedClientForCopy = null;
    }

    rowsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-view]");
      if (!btn) return;
      const id = btn.getAttribute("data-view");
      const client = allClients.find(c => {
        const p = c.profile || c;
        return (p.user_id || c.user_id) === id;
      });
      if (client) openModal(client);
    });

    closeModalBtn.addEventListener("click", closeModal);
    closeModalBtn2.addEventListener("click", closeModal);
    detailsModal.addEventListener("click", (e) => { if (e.target === detailsModal) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && detailsModal.classList.contains("open")) closeModal(); });

    copyJsonBtn.addEventListener("click", async () => {
      if (!selectedClientForCopy) return;
      try { await navigator.clipboard.writeText(JSON.stringify(selectedClientForCopy, null, 2)); showOk("Copied client JSON to clipboard."); }
      catch { showErr("Copy failed (browser blocked clipboard)." ); }
    });

    document.querySelectorAll("[data-filter]").forEach(b => {
      b.addEventListener("click", () => { currentFilter = b.getAttribute("data-filter"); render(); });
    });

    searchBox.addEventListener("input", render);
    refreshBtn.addEventListener("click", () => loadClients(true));

    async function loadClients(force=false){
      clearMsgs();
      metaEl.textContent = force ? "Refreshing…" : "Loading…";
      rowsEl.innerHTML = "";

      try{
        const resp = await callEdge("admin-client-list", {});
        const list = Array.isArray(resp?.clients) ? resp.clients : [];
        allClients = list;
        render();
        metaEl.textContent = `Last sync: ${new Date().toLocaleString()}`;
      }catch(e){
        metaEl.textContent = "";
        showErr((e?.message || String(e)) + " — This page requires the Edge Function: admin-client-list.");
      }
    }

    async function ensureAdminOrShowLogin(){
      const { data: sess } = await sb.auth.getSession();
      const s = sess?.session;

      if (!s){ showLogin(); return; }

      if (!(await checkIsAdmin(s.user.id))){
        whoami.textContent = `Forbidden: ${s.user?.email || "unknown"}`;
        logoutBtn.style.display = "inline-flex";
        logoutBtn.onclick = async () => { await sb.auth.signOut(); location.reload(); };
        showErr("Forbidden. This page is admin-only.");
        return;
      }

      whoami.textContent = `Signed in: ${s.user.email}`;
      logoutBtn.style.display = "inline-flex";
      logoutBtn.onclick = async () => { await sb.auth.signOut(); location.reload(); };

      adminCard.style.display = "block";
      await loadClients(false);
    }

    function showLogin(){
      loginOverlay.style.display = "flex";
      loginErr.style.display = "none";
      loginHint.textContent = "";
      adminCard.style.display = "none";
      logoutBtn.style.display = "none";
      whoami.textContent = "Not signed in";
    }

    function hideLogin(){ loginOverlay.style.display = "none"; }

    loginCloseBtn.addEventListener("click", () => { location.href = "/sns/index.html"; });

    loginBtn.addEventListener("click", async () => {
      loginErr.style.display = "none";
      loginHint.textContent = "Signing in…";
      try{
        const email = normalize(loginEmail.value).toLowerCase();
        const pass  = normalize(loginPass.value);
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        hideLogin();
        loginHint.textContent = "";
        await ensureAdminOrShowLogin();
      }catch(e){
        loginHint.textContent = "";
        loginErr.style.display = "block";
        loginErr.textContent = e?.message || String(e);
      }
    });

    ensureAdminOrShowLogin();
