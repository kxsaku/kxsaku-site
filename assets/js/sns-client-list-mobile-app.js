    /**************************************************************
     * Supabase (matches your other SNS pages)
     **************************************************************/
    const SUPABASE_URL = "https://api.kxsaku.com";
    const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
    /**************************************************************/

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function checkIsAdmin(userId) {
      const { data } = await sb.from("user_profiles").select("is_admin").eq("user_id", userId).maybeSingle();
      return data?.is_admin === true;
    }

    const whoami = document.getElementById("whoami");
    const logoutBtn = document.getElementById("logoutBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const errBox = document.getElementById("errBox");
    const okBox = document.getElementById("okBox");
    const summaryPill = document.getElementById("summaryPill");
    const listEl = document.getElementById("list");
    const searchBox = document.getElementById("searchBox");
    const chips = document.getElementById("chips");

    const sheet = document.getElementById("sheet");
    const sheetClose = document.getElementById("sheetClose");
    const closeBtn2 = document.getElementById("closeBtn2");
    const sheetSub = document.getElementById("sheetSub");
    const sheetGrid = document.getElementById("sheetGrid");
    const copyJsonBtn = document.getElementById("copyJsonBtn");

    const loginOverlay = document.getElementById("loginOverlay");
    const loginBtn = document.getElementById("loginBtn");
    const loginEmail = document.getElementById("loginEmail");
    const loginPass = document.getElementById("loginPass");
    const loginErr = document.getElementById("loginErr");
    const loginHint = document.getElementById("loginHint");
    const loginCloseBtn = document.getElementById("loginCloseBtn");

    let allClients = [];
    let activeFilter = "all";
    let selectedClient = null;

    function showErr(msg){ errBox.style.display="block"; errBox.textContent = msg; }
    function clearErr(){ errBox.style.display="none"; errBox.textContent = ""; }
    function showOk(msg){ okBox.style.display="block"; okBox.textContent = msg; setTimeout(() => okBox.style.display="none", 1800); }

    function sanitize(str){
      return String(str ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }
    function includesCI(hay, needle){
      return (hay ?? "").toString().toLowerCase().includes((needle ?? "").toString().toLowerCase());
    }

    function fmtDateTime(ts){
      if (!ts) return "—";
      try{ return new Date(ts).toLocaleString(); }catch{ return "—"; }
    }
    function fmtMoneyCents(cents, currency){
      if (cents == null) return "—";
      const cur = (currency || "usd").toUpperCase();
      const dollars = Number(cents) / 100;
      try{ return new Intl.NumberFormat(undefined, { style:"currency", currency: cur }).format(dollars); }
      catch{ return `${dollars.toFixed(2)} ${cur}`; }
    }

    function dotClass(cat){
      if (cat === "active") return "dot-green";
      if (cat === "trialing") return "dot-blue";
      if (cat === "inactive") return "dot-yellow";
      if (cat === "never") return "dot-gray";
      return "dot-gray";
    }
    function labelCat(cat){
      if (cat === "active") return "ACTIVE";
      if (cat === "trialing") return "TRIALING";
      if (cat === "inactive") return "INACTIVE";
      if (cat === "never") return "NEVER PURCHASED";
      return (cat || "UNKNOWN").toString().toUpperCase();
    }

    async function callEdge(fnName, payload = {}){
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      let res;
      try{
        res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
          method: "POST",
          headers: { "Content-Type":"application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }catch(fetchErr){
        throw new Error(fetchErr?.message || "NetworkError when attempting to fetch resource.");
      }

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Request failed");
      return j;
    }

    function lock(isLocked, hintMsg){
      if (isLocked){
        loginOverlay.style.display = "flex";
        loginErr.style.display = "none";
        loginErr.textContent = "";
        loginHint.textContent = hintMsg || "Admin-only";
        document.getElementById("mainCard").style.display = "none";
      } else {
        loginOverlay.style.display = "none";
        document.getElementById("mainCard").style.display = "block";
      }
    }

    async function ensureAdminOrShowLogin(){
      const { data: sess } = await sb.auth.getSession();
      const session = sess?.session;

      if (!session){
        lock(true);
        return;
      }

      const email = (session.user?.email || "").toLowerCase();
      whoami.textContent = `Signed in: ${session.user?.email || "—"}`;

      if (!(await checkIsAdmin(session.user.id))){
        await sb.auth.signOut();
        lock(true, "Not an admin account.");
        return;
      }

      lock(false);
    }

    async function login(){
      loginErr.style.display = "none";
      loginErr.textContent = "";

      const email = (loginEmail.value || "").trim();
      const pass = (loginPass.value || "").trim();
      if (!email || !pass){
        loginErr.style.display = "block";
        loginErr.textContent = "Enter email and password.";
        return;
      }

      loginBtn.disabled = true;
      try{
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;

        await ensureAdminOrShowLogin();
        if (loginOverlay.style.display === "none"){
          await loadClients();
          showOk("Signed in.");
        }
      }catch(e){
        loginErr.style.display = "block";
        loginErr.textContent = e?.message || String(e);
      }finally{
        loginBtn.disabled = false;
      }
    }

    async function logout(){
      await sb.auth.signOut();
      whoami.textContent = "Signed in: —";
      allClients = [];
      render();
      lock(true);
    }

    async function loadClients(){
      clearErr();
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing…";

      try{
        const data = await callEdge("admin-client-list", {});
        allClients = Array.isArray(data?.clients) ? data.clients : [];
        render();
        showOk("Refreshed.");
      }catch(e){
        showErr(e?.message || String(e));
      }finally{
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh";
      }
    }

    function applyFilters(){
      const q = (searchBox.value || "").trim().toLowerCase();

      let items = allClients.map(x => ({
        profile: x?.profile || {},
        subscription: x?.subscription || {},
        raw: x
      }));

      if (activeFilter !== "all"){
        items = items.filter(x => (x.subscription?.category || "unknown") === activeFilter);
      }

      if (q){
        items = items.filter(x => {
          const p = x.profile || {};
          const s = x.subscription || {};
          return (
            includesCI(p.full_name, q) ||
            includesCI(p.name, q) ||
            includesCI(p.business_name, q) ||
            includesCI(p.phone, q) ||
            includesCI(p.email, q) ||
            includesCI(s.category, q) ||
            includesCI(s.status, q)
          );
        });
      }

      return items;
    }

    function render(){
      const items = applyFilters();
      summaryPill.textContent = `${items.length} client${items.length === 1 ? "" : "s"}`;

      if (!items.length){
        listEl.innerHTML = `
          <div class="client" style="text-align:center; color: rgba(244,240,255,.72);">
            No clients found.
          </div>
        `;
        return;
      }

      listEl.innerHTML = items.map((x, idx) => {
        const p = x.profile || {};
        const s = x.subscription || {};
        const name = p.full_name || p.name || "—";
        const biz = p.business_name || "—";
        const phone = p.phone || "—";
        const cat = s.category || "unknown";

        const tag = `<span class="tag"><span class="dot ${dotClass(cat)}"></span>${labelCat(cat)}</span>`;

        return `
          <div class="client">
            <div class="client-top">
              <div>
                <div class="name">${sanitize(name)}</div>
                <div class="biz">${sanitize(biz)}</div>
                <div class="phone">${sanitize(phone)}</div>
              </div>
              <div>${tag}</div>
            </div>

            <div class="client-actions">
              <button class="btn btn-soft" type="button" data-view="${idx}">View</button>
              <button class="btn btn-primary" type="button" data-copy="${idx}">Copy</button>
            </div>
          </div>
        `;
      }).join("");
    }

    function openSheet(clientObj){
      selectedClient = clientObj;
      const p = clientObj?.profile || {};
      const s = clientObj?.subscription || {};

      const titleName = p.full_name || p.name || "Client";
      const titleBiz = p.business_name ? ` · ${p.business_name}` : "";
      const cat = s.category || "unknown";

      sheetSub.innerHTML =
        `<span class="tag"><span class="dot ${dotClass(cat)}"></span>${labelCat(cat)}</span>
         <span style="color: rgba(244,240,255,.70);"> ${sanitize(titleName)}${sanitize(titleBiz)}</span>`;

      const kv = [];

      kv.push(["Full Name", p.full_name || p.name]);
      kv.push(["Email", p.email]);
      kv.push(["Phone", p.phone]);
      kv.push(["Business Name", p.business_name]);

      kv.push(["Business Location", p.business_location || p.location || p.city || ""]);
      kv.push(["Address", p.address || p.street_address || ""]);
      kv.push(["Address (2)", p.address2 || p.street_address_2 || ""]);
      kv.push(["City", p.city || ""]);
      kv.push(["State", p.state || ""]);
      kv.push(["ZIP", p.zip || p.postal_code || ""]);

      kv.push(["Stripe Status", s.status]);
      kv.push(["Subscription Category", s.category]);
      kv.push(["Subscription Started", fmtDateTime(s.subscription_created_ts)]);
      kv.push(["Next Payment Due", fmtDateTime(s.current_period_end_ts)]);
      kv.push(["Lifetime Paid", fmtMoneyCents(s.total_paid_cents, s.currency)]);
      kv.push(["First Paid", fmtDateTime(s.first_paid_ts)]);
      kv.push(["Stripe Customer ID", s.stripe_customer_id]);
      kv.push(["Stripe Subscription ID", s.stripe_subscription_id]);

      kv.push(["User ID", p.user_id || p.id || s.user_id]);
      kv.push(["Profile Created", fmtDateTime(p.created_at)]);
      kv.push(["Profile Updated", fmtDateTime(p.updated_at)]);

      sheetGrid.innerHTML = kv
        .filter(([k, v]) => v != null && String(v).trim() !== "")
        .map(([k,v]) => `
          <div class="kv">
            <div class="k">${sanitize(k)}</div>
            <div class="v">${sanitize(v)}</div>
          </div>
        `).join("") || `
          <div class="kv">
            <div class="k">No details</div>
            <div class="v">No stored fields found for this client.</div>
          </div>
        `;

      sheet.classList.add("open");
    }

    function closeSheet(){
      sheet.classList.remove("open");
      selectedClient = null;
    }

    function copyClient(clientObj){
      const raw = clientObj?.raw ?? clientObj;
      const text = JSON.stringify(raw, null, 2);
      navigator.clipboard?.writeText(text);
      showOk("Copied.");
    }

    refreshBtn.addEventListener("click", loadClients);
    searchBox.addEventListener("input", () => render());

    chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const f = btn.getAttribute("data-filter") || "all";
      activeFilter = f;

      [...chips.querySelectorAll(".chip")].forEach(b => b.classList.toggle("active", b === btn));
      render();
    });

    listEl.addEventListener("click", (e) => {
      const v = e.target.closest("[data-view]");
      const c = e.target.closest("[data-copy]");
      if (!v && !c) return;

      const items = applyFilters();
      const idx = Number((v || c).getAttribute(v ? "data-view" : "data-copy"));
      const clientObj = items[idx];
      if (!clientObj) return;

      if (v) openSheet(clientObj);
      if (c) copyClient(clientObj);
    });

    sheetClose.addEventListener("click", closeSheet);
    closeBtn2.addEventListener("click", closeSheet);
    sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

    copyJsonBtn.addEventListener("click", () => {
      if (!selectedClient) return;
      copyClient(selectedClient);
    });

    logoutBtn.addEventListener("click", logout);

    loginBtn.addEventListener("click", login);
    loginPass.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    loginEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

    loginCloseBtn.addEventListener("click", () => { window.location.href = "/sns/"; });

    (async function init(){
      await ensureAdminOrShowLogin();
      const { data: sess } = await sb.auth.getSession();
      if (sess?.session){
        if (await checkIsAdmin(sess.session.user.id)){
          await loadClients();
        }
      }
    })();
