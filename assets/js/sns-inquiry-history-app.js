    import { createClient } from "/vendor/supabase-esm.js";

    // MUST MATCH YOUR OTHER PAGES
    const SUPABASE_URL = "https://api.kxsaku.com";
    const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI"; // <-- replace with the same anon key used on sns-dashboard

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const who = document.getElementById("who");
    const rows = document.getElementById("rows");
    const empty = document.getElementById("empty");
    const warn = document.getElementById("warn");

    const backBtn = document.getElementById("backBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    backBtn.addEventListener("click", () => window.location.href = "/sns-dashboard/index.html");
    logoutBtn.addEventListener("click", async () => {
      await sb.auth.signOut();
      window.location.href = "/sns-login/index.html";
    });

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
      // 1) session first
      const { data: s1 } = await sb.auth.getSession();
      if (s1?.session?.user) return s1.session.user;

      // 2) tiny wait, try again (session can restore async)
      await new Promise(r => setTimeout(r, 250));
      const { data: s2 } = await sb.auth.getSession();
      if (s2?.session?.user) return s2.session.user;

      // 3) final: getUser() (can trigger refresh internally)
      const { data: u3 } = await sb.auth.getUser();
      if (u3?.user) return u3.user;

      return null;
    }

    async function load() {
      const user = await getUserWithRetry();

      if (!user) {
        who.textContent = "Not signed in";
        showWarn("Please log in to view your inquiry history.");
        // Do NOT bounce back to dashboard. Just stop here.
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
        tr.className = "sns-row";

        const tdDate = document.createElement("td");
        tdDate.textContent = fmtDate(r.created_at);

        const tdWO = document.createElement("td");
        tdWO.appendChild(pill(r.work_order || "—"));

        const tdSvc = document.createElement("td");
        tdSvc.className = "muted";
        tdSvc.textContent = r.services || "—";

        const tdStatus = document.createElement("td");
        tdStatus.appendChild(pill((r.status || "unknown").toString().replaceAll("_", " ")));

        tr.appendChild(tdDate);
        tr.appendChild(tdWO);
        tr.appendChild(tdSvc);
        tr.appendChild(tdStatus);

        rows.appendChild(tr);
      }
    }

    load();
