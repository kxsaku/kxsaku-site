    /**************************************************************
     * REQUIRED: Paste your Supabase details below
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
    const errEl = document.getElementById("err");
    const content = document.getElementById("content");

    const loginOverlay = document.getElementById("loginOverlay");
    const loginBtn = document.getElementById("loginBtn");
    const loginEmail = document.getElementById("loginEmail");
    const loginPass = document.getElementById("loginPass");
    const loginErr = document.getElementById("loginErr");
    const loginHint = document.getElementById("loginHint");

    function showErr(msg) { errEl.style.display = "block"; errEl.textContent = msg; }
    function clearErr() { errEl.style.display = "none"; errEl.textContent = ""; }

    function showLogin(msg) {
      loginOverlay.style.display = "flex";
      loginErr.style.display = "none";
      loginErr.textContent = "";
      loginHint.textContent = msg || "";
    }
    function hideLogin() { loginOverlay.style.display = "none"; }

    function sanitize(s) {
      return (s ?? "").toString().replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
    }

    function fmtDate(iso) {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
    }

    function qp(name) {
      const u = new URL(location.href);
      return u.searchParams.get(name);
    }

    const inquiryId = qp("id");




    async function requireAdminSession() {
      const { data: { user } } = await sb.auth.getUser();

      if (!user) {
        whoami.textContent = "Not signed in";
        showLogin("Sign in to view this inquiry.");
        return null;
      }

      if (!(await checkIsAdmin(user.id))) {
        await sb.auth.signOut();
        whoami.textContent = "Wrong account";
        showLogin("Use your admin email to sign in.");
        return null;
      }

      whoami.textContent = "Signed in: " + user.email;
      hideLogin();
      return user;
    }

    let current = null;

    function setText(id, value) {
      document.getElementById(id).textContent = value || "-";
    }

    async function loadInquiry() {
      clearErr();
      content.style.display = "none";

      if (!inquiryId) {
        showErr("Missing inquiry id in URL.");
        return;
      }




      const user = await requireAdminSession();
      if (!user) return;

      const { data, error } = await sb
        .from("inquiries")
        .select("*")
        .eq("id", inquiryId)
        .single();

      if (error || !data) {
        showErr("Unable to load inquiry.");
        return;
      }

      // Populate internal notes (NOW data exists)
      const notesBoxEl = document.getElementById("notesBox");
      if (notesBoxEl) notesBoxEl.value = data.notes || "";


      current = data;

      setText("createdAt", fmtDate(data.created_at));
      setText("status", data.status || "assigned");
      setText("priority", data.priority_flag || "none");

      setText("contactName", data.contact_name);
      setText("businessName", data.business_name);
      setText("email", data.email);
      setText("phone", data.phone);

      setText("location", data.location);
      setText("companySize", data.company_size);

      const services = Array.isArray(data.services) ? data.services.join(", ") : (data.services || "");
      setText("services", services);

      setText("currentSetup", data.current_setup);
      setText("goals", data.goals);

      setText("budget", data.budget);
      setText("timeline", data.timeline);

      setText("extraNotes", data.extra_notes);

      content.style.display = "block";
    }

    async function updateInquiry(patch) {
      clearErr();
      const user = await requireAdminSession();
      if (!user) return;

      const { error } = await sb.from("inquiries").update(patch).eq("id", inquiryId);
      if (error) { showErr(error.message); return; }
      await loadInquiry();
    }

    async function deleteInquiry() {
      clearErr();
      const user = await requireAdminSession();
      if (!user) return;

      const ok = confirm("Delete this inquiry? This cannot be undone.");
      if (!ok) return;

      const { error } = await sb.from("inquiries").delete().eq("id", inquiryId);
      if (error) { showErr(error.message); return; }

      location.href = "sns-admin.html";
    }

    document.getElementById("markWorkingBtn").addEventListener("click", () => updateInquiry({ status: "working" }));
    document.getElementById("markCompletedBtn").addEventListener("click", () => updateInquiry({ status: "completed" }));
    document.getElementById("resetAssignedBtn").addEventListener("click", () => updateInquiry({ status: "assigned" }));

    document.getElementById("flagRedBtn").addEventListener("click", () => updateInquiry({ priority_flag: "red" }));
    document.getElementById("flagYellowBtn").addEventListener("click", () => updateInquiry({ priority_flag: "yellow" }));
    document.getElementById("flagGreenBtn").addEventListener("click", () => updateInquiry({ priority_flag: "green" }));
    document.getElementById("flagClearBtn").addEventListener("click", () => updateInquiry({ priority_flag: "none" }));


    document.getElementById("refreshBtn").addEventListener("click", loadInquiry);

// Only enable delete if you actually added <button id="deleteBtn">
const del = document.getElementById("deleteBtn");
if (del) del.addEventListener("click", deleteInquiry);

const notesBoxEl = document.getElementById("notesBox");
const saveNotesBtn = document.getElementById("saveNotesBtn");
const notesOk = document.getElementById("okBox");
const notesErr = document.getElementById("errBox");

function notesShowErr(msg){
  if (!notesErr) return;
  notesErr.style.display = "block";
  notesErr.textContent = msg;
}
function notesClearErr(){
  if (!notesErr) return;
  notesErr.style.display = "none";
  notesErr.textContent = "";
}
function notesShowOk(msg){
  if (!notesOk) return;
  notesOk.style.display = "block";
  notesOk.textContent = msg;
  setTimeout(() => (notesOk.style.display = "none"), 1400);
}

if (saveNotesBtn && notesBoxEl) {
  saveNotesBtn.addEventListener("click", async () => {
    notesClearErr();

    const user = await requireAdminSession();
    if (!user) return;

    if (!inquiryId) { notesShowErr("Missing inquiry id."); return; }

    saveNotesBtn.disabled = true;
    saveNotesBtn.style.opacity = "0.6";

    const newNotes = notesBoxEl.value || "";

    const { data, error } = await sb
      .from("inquiries")
      .update({ notes: newNotes })
      .eq("id", inquiryId)
      .select("notes")
      .single();

    saveNotesBtn.disabled = false;
    saveNotesBtn.style.opacity = "1";

    if (error) {
      notesShowErr("Save notes failed: " + error.message);
      return;
    }

    // keep textarea consistent with DB response
    notesBoxEl.value = data?.notes || "";
    notesShowOk("Notes saved.");
  });
}


    loginBtn.addEventListener("click", async () => {
      loginErr.style.display = "none";
      loginErr.textContent = "";

      try {
        const email = loginEmail.value.trim();
        const password = loginPass.value;

        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        await loadInquiry();
      } catch (e) {
        loginErr.style.display = "block";
        loginErr.textContent = e.message || "Login failed.";
      }
    });

    sb.auth.onAuthStateChange(() => { loadInquiry(); });

    loadInquiry();
