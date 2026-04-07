    import { createClient } from "/vendor/supabase-esm.js";

    // MUST MATCH YOUR OTHER PAGES
    const SUPABASE_URL = "https://api.kxsaku.com";
    const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const who = document.getElementById("who");
    const rows = document.getElementById("rows");
    const empty = document.getElementById("empty");
    const warn = document.getElementById("warn");

    const backBtn = document.getElementById("backBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutBtnMenu = document.getElementById("logoutBtnMenu");

    function gotoDashboard(){ window.location.href = "/sns-dashboard/"; }

    backBtn.addEventListener("click", gotoDashboard);

    async function doLogout(){
      await sb.auth.signOut();
      window.location.href = "/sns-login/";
    }

    logoutBtn.addEventListener("click", doLogout);
    if (logoutBtnMenu) logoutBtnMenu.addEventListener("click", doLogout);

    function showWarn(msg) {
      warn.style.display = "block";
      warn.textContent = msg;
    }

    function fmtDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
      } catch {
        return iso ?? "";
      }
    }

    function pill(text) {
      const span = document.createElement("span");
      span.className = "pill";
      span.textContent = text ?? "—";
      return span;
    }

    // IMPORTANT: Wait for session restore before deciding "not signed in"
    async function getUserWithRetry() {
      const { data: s1 } = await sb.auth.getSession();
      if (s1?.session?.user) return s1.session.user;
      await new Promise(r => setTimeout(r, 250));
      const { data: s2 } = await sb.auth.getSession();
      if (s2?.session?.user) return s2.session.user;
      const { data: u3 } = await sb.auth.getUser();
      if (u3?.user) return u3.user;
      return null;
    }

    async function load() {
      const user = await getUserWithRetry();

      if (!user) {
        who.textContent = "Not signed in";
        showWarn("Please log in to view your inquiry history.");
        return;
      }

      who.textContent = user.email;

      const { data, error } = await sb
        .from("inquiries")
        .select("created_at, work_order, services, status")
        .eq("email", user.email)
        .order("created_at", { ascending: false });

      if (error) {
        showWarn(error.message || "Failed to load inquiries.");
        return;
      }

      rows.innerHTML = "";
      if (!data || data.length === 0) {
        empty.style.display = "block";
        return;
      }

      empty.style.display = "none";

      for (const r of data) {
        const tr = document.createElement("tr");

        const tdDate = document.createElement("td");
        tdDate.setAttribute("data-label", "Date");
        tdDate.textContent = fmtDate(r.created_at);

        const tdWO = document.createElement("td");
        tdWO.setAttribute("data-label", "Work Order");
        tdWO.appendChild(pill(r.work_order || "—"));

        const tdSvc = document.createElement("td");
        tdSvc.setAttribute("data-label", "Services");
        tdSvc.className = "muted";
        tdSvc.textContent = r.services || "—";

        const tdStatus = document.createElement("td");
        tdStatus.setAttribute("data-label", "Status");
        tdStatus.appendChild(pill((r.status || "unknown").toString().replaceAll("_", " ")));

        tr.appendChild(tdDate);
        tr.appendChild(tdWO);
        tr.appendChild(tdSvc);
        tr.appendChild(tdStatus);

        rows.appendChild(tr);
      }
    }

    load();
