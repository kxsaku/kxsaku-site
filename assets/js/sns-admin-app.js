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

const inviteEmailEl = document.getElementById("inviteEmail");
const inviteBtn = document.getElementById("inviteBtn");
const inviteMsg = document.getElementById("inviteMsg");

async function callEdge(fnName, payload = {}) {
  const { data: sess } = await sb.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not logged in.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "Request failed");
  return j;
}

inviteBtn?.addEventListener("click", async () => {
  inviteMsg.textContent = "";
  const email = (inviteEmailEl.value || "").trim().toLowerCase();
  if (!email) return (inviteMsg.textContent = "Enter an email.");

  inviteBtn.disabled = true;
  try {
    await callEdge("admin-invite", { email });
    inviteMsg.textContent = `Invite sent to ${email}`;
  } catch (e) {
    inviteMsg.textContent = e?.message || String(e);
  } finally {
    inviteBtn.disabled = false;
  }
});


const searchBox = document.getElementById("searchBox");



let allInquiries = [];
let filteredInquiries = [];


function fmtWO(n){
  if (n == null) return "";
  return "WO-" + String(n).padStart(6, "0");
}

function includesCI(haystack, needle){
  return (haystack || "").toString().toLowerCase().includes((needle || "").toString().toLowerCase());
}
const rowsEl = document.getElementById("rows");
const errBox = document.getElementById("errBox");
const okBox = document.getElementById("okBox");
const whoami = document.getElementById("whoami");
const logoutBtn = document.getElementById("logoutBtn");
const loginCloseBtn = document.getElementById("loginCloseBtn");

const loginOverlay = document.getElementById("loginOverlay");
const loginBtn = document.getElementById("loginBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPass = document.getElementById("loginPass");
const loginErr = document.getElementById("loginErr");
const loginHint = document.getElementById("loginHint");

const selectAll = document.getElementById("selectAll");
const refreshBtn = document.getElementById("refreshBtn");
const resetWorkOrdersBtn = document.getElementById("resetWorkOrdersBtn");

function showErr(msg) { errBox.style.display = "block"; errBox.textContent = msg; }
function clearErr() { errBox.style.display = "none"; errBox.textContent = ""; }
function showOk(msg) { okBox.style.display = "block"; okBox.textContent = msg; setTimeout(() => okBox.style.display="none", 2000); }

const adminCard = document.getElementById("adminCard");

function getEmail(r){
  return (r?.contact_email ?? r?.email ?? r?.contactEmail ?? r?.contact_email_address ?? r?.contactEmailAddress ?? "");
}
function getPhone(r){
  return (r?.contact_phone ?? r?.phone ?? r?.contactPhone ?? r?.contact_phone_number ?? r?.contactPhoneNumber ?? "");
}

function setLocked(isLocked){
if (isLocked){
    adminCard.style.display = "none";   // nothing visible behind overlay
} else {
    adminCard.style.display = "block";
  }
}

function applySearchAndRender(){
  const q = (searchBox?.value || "").trim().toLowerCase();

  filteredInquiries = !q ? allInquiries : allInquiries.filter(r => {
    const wo = fmtWO(r.work_order);
    const services = Array.isArray(r.services) ? r.services.join(", ") : (r.services || "");
    return (
      includesCI(r.contact_name, q) ||
      includesCI(getEmail(r), q) ||
      includesCI(getPhone(r), q) ||
      includesCI(r.business_name, q) ||
      includesCI(services, q) ||
      includesCI(wo, q) ||
      includesCI(r.work_order, q)
    );
  });

  rowsEl.innerHTML = filteredInquiries.map(r => `
    <tr data-rowid="${sanitize(r.id)}">
      <td><input type="checkbox" data-id="${sanitize(r.id)}"></td>
      <td>${sanitize(fmtDate(r.created_at))}</td>
      <td>${sanitize(fmtWO(r.work_order))}</td>
      <td><span class="flag ${flagClass(r.priority_flag)}"></span>${sanitize(r.priority_flag || "none")}</td>
      <td class="status ${statusClass(r.status)}">${sanitize(r.status || "assigned")}</td>
      <td>${sanitize(r.contact_name || "")}</td>
      <td>${sanitize(r.business_name || "")}</td>
      <td>${sanitize(Array.isArray(r.services) ? r.services.join(", ") : (r.services || ""))}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button class="btn btn-soft" data-eye="${sanitize(r.id)}" type="button" title="Quick look">👁️</button>
        <button class="btn btn-soft" data-view="${sanitize(r.id)}" type="button">View</button>
        <button class="btn btn-danger" data-del="${sanitize(r.id)}" type="button">Delete</button>
      </td>
    </tr>
  `).join("");

  // keep "select all" sane after rerender
  selectAll.checked = false;
}


if (resetWorkOrdersBtn) {
  resetWorkOrdersBtn.addEventListener("click", async () => {
    clearErr();

    const user = await requireAdminSession();
    if (!user) return;

    const ok1 = confirm("Are you sure you want to RESET ALL work order numbers? This will renumber every inquiry.");
    if (!ok1) return;

    const ok2 = confirm("Last warning: This cannot be undone. Proceed?");
    if (!ok2) return;

    resetWorkOrdersBtn.disabled = true;
    resetWorkOrdersBtn.style.opacity = "0.6";

    const { error } = await sb.rpc("reset_work_orders");

    resetWorkOrdersBtn.disabled = false;
    resetWorkOrdersBtn.style.opacity = "1";

    if (error) {
      showErr("Reset failed: " + error.message);
      return;
    }

    showOk("Work order numbers reset.");
    await loadInquiries();
  });
}

loginCloseBtn.addEventListener("click", () => {
hideLogin();

// Go back to the page you were on before clicking Admin (best UX)
if (history.length > 1) history.back();
else window.location.href = "/"; // fallback
});



function showLogin(msg) {
// Hide the admin UI entirely (no blurred "leak" behind the modal)
if (adminCard) adminCard.style.display = "none";

loginOverlay.style.display = "flex";
loginErr.style.display = "none";
loginErr.textContent = "";
loginHint.textContent = msg || "";

// DO NOT prefill email
loginEmail.value = "";
loginPass.value = "";
}

function hideLogin() {
  loginOverlay.style.display = "none";
  loginErr.style.display = "none";
  loginErr.textContent = "";
  loginHint.textContent = "";
}

function sanitize(s) {
  return (s ?? "").toString().replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function flagClass(v) {
  if (v === "red") return "f-red";
  if (v === "yellow") return "f-yellow";
  if (v === "green") return "f-green";
  return "f-none";
}

function statusClass(v) {
  if (v === "working") return "s-working";
  if (v === "completed") return "s-completed";
  return "s-assigned";
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll("input[data-id]:checked")).map(x => x.getAttribute("data-id"));
}

async function requireAdminSession() {
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    whoami.textContent = "Not signed in";
    logoutBtn.style.display = "none";
    setLocked(true);
    showLogin("Sign in to load inquiries.");
    return null;
  }

  if (!(await checkIsAdmin(user.id))) {
    await sb.auth.signOut();
    whoami.textContent = "Wrong account";
    logoutBtn.style.display = "none";
    setLocked(true);
    showLogin("Use your admin email to sign in.");
    return null;
  }

  whoami.textContent = "Signed in: " + user.email;
  logoutBtn.style.display = "inline-flex";
  setLocked(false);
  hideLogin();
  if (adminCard) adminCard.style.display = "block";
  return user;
}

// Prevent overlapping renders (this fixes the duplicates/refresh weirdness)
let loadNonce = 0;

async function loadInquiries() {
  const myNonce = ++loadNonce;
  clearErr();

  refreshBtn.disabled = true;
  refreshBtn.style.opacity = "0.6";

  // Require admin first
  const user = await requireAdminSession();
  if (!user) {
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = "1";
    return;
  }

  // Query
  const { data, error } = await sb
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);


  // If another load started after this one, ignore this result
  if (myNonce !== loadNonce) return;

  refreshBtn.disabled = false;
  refreshBtn.style.opacity = "1";

  if (error) {
    rowsEl.innerHTML = "";
    showErr("Could not load inquiries: " + error.message);
    return;
  }

  if (!data || data.length === 0) {
    rowsEl.innerHTML = `<tr><td colspan="9" class="muted" style="padding:1.2rem .6rem;">
      No inquiries returned.
    </td></tr>`;
    return;
  }


  // Build rows once (avoids duplicate append behavior)
  allInquiries = data;
  applySearchAndRender();



  selectAll.checked = false;
}

async function updateMany(patch) {
  clearErr();
  const ids = getSelectedIds();
  if (ids.length === 0) { showErr("Select at least one inquiry."); return; }

  const { error } = await sb.from("inquiries").update(patch).in("id", ids);
  if (error) { showErr(error.message); return; }

  showOk("Updated " + ids.length + " inquiry(s).");
  await loadInquiries();
}

    async function deleteMany(ids) {
  clearErr();
  if (!ids || ids.length === 0) { showErr("Select at least one inquiry."); return; }

  const ok = confirm(`Delete ${ids.length} inquiry(s)? This cannot be undone.`);
  if (!ok) return;

  const { error, count } = await sb
    .from("inquiries")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    showErr("Delete failed: " + error.message);
    return;
  }

  if (!count || count === 0) {
    showErr("Delete request returned 0 deleted rows. This usually means RLS is blocking DELETE.");
    return;
  }

  showOk(`${count} inquiry deleted.`);
  await loadInquiries();
}



// Toolbar events

// --- Tooltip helpers (global floating tooltip; not clipped) ---
const qlTooltip = document.getElementById("qlTooltip");

function showTooltip(html, x, y) {
  qlTooltip.innerHTML = html;
  qlTooltip.style.display = "block";

  const pad = 14;
  // Force layout so rect is accurate after innerHTML change
  const rect = qlTooltip.getBoundingClientRect();

  let left = x + 14;
  let top  = y + 14;

  if (left + rect.width + pad > window.innerWidth) left = window.innerWidth - rect.width - pad;
  if (top + rect.height + pad > window.innerHeight) top = window.innerHeight - rect.height - pad;

  qlTooltip.style.left = left + "px";
  qlTooltip.style.top  = top + "px";
}

function hideTooltip() {
  qlTooltip.style.display = "none";
  qlTooltip.innerHTML = "";
}

// --- Row-level actions + tooltip (event delegation) ---



document.addEventListener("click", async (e) => {
  const viewBtn = e.target.closest("[data-view]");
  if (viewBtn) {
    const id = viewBtn.getAttribute("data-view");
    window.location.href = `/sns-inquiry-view/index.html?id=${encodeURIComponent(id)}`;
    return;
  }

  const delBtn = e.target.closest("[data-del]");
  if (delBtn) {
    const id = delBtn.getAttribute("data-del");
    await deleteMany([id]);
    return;
  }
});

// Keep tooltip near cursor when visible
document.addEventListener("mousemove", (e) => {
  if (qlTooltip.style.display === "block") {
    showTooltip(qlTooltip.innerHTML, e.clientX, e.clientY);
  }
});

// IMPORTANT: use mouseover/mouseout (mouseenter doesn't bubble reliably for delegation)
document.addEventListener("mouseover", (e) => {
  const eyeBtn = e.target.closest("[data-eye]");
  if (!eyeBtn) return;

  const row = eyeBtn.closest("tr");
  if (!row) return;

  const tds = row.querySelectorAll("td");
  const date     = tds[1]?.textContent?.trim() || "";
  const workOrder= tds[2]?.textContent?.trim() || "";
  const priority = tds[3]?.textContent?.trim() || "";
  const status   = tds[4]?.textContent?.trim() || "";
  const contact  = tds[5]?.textContent?.trim() || "";
  const business = tds[6]?.textContent?.trim() || "";
  const services = tds[7]?.textContent?.trim() || "";

  const html = `
    <div style="letter-spacing:.14em; text-transform:uppercase; font-size:.78rem; color:#cfc8ff; margin-bottom:.5rem;">
      Quick Look
    </div>
    <div style="font-size:.92rem; line-height:1.45;">
      <div><span style="color:#bdb7ff;">Date:</span> ${sanitize(date)}</div>
      <div><span style="color:#bdb7ff;">Work Order:</span> ${sanitize(workOrder)}</div>
      <div><span style="color:#bdb7ff;">Status:</span> ${sanitize(status)}</div>
      <div><span style="color:#bdb7ff;">Priority:</span> ${sanitize(priority)}</div>
      <div style="margin-top:.45rem;"><span style="color:#bdb7ff;">Contact:</span> ${sanitize(contact)}</div>
      <div><span style="color:#bdb7ff;">Business:</span> ${sanitize(business)}</div>
      <div style="margin-top:.45rem;"><span style="color:#bdb7ff;">Services:</span> ${sanitize(services)}</div>
    </div>
  `;

  showTooltip(html, e.clientX, e.clientY);
});

// Search
searchBox.addEventListener("input", () => applySearchAndRender());




document.addEventListener("mouseout", (e) => {
  const eyeBtn = e.target.closest("[data-eye]");
  if (!eyeBtn) return;

  // If you're still inside the same eye button, ignore
  if (e.relatedTarget && eyeBtn.contains(e.relatedTarget)) return;

  hideTooltip();
});

document.getElementById("refreshBtn").addEventListener("click", () => loadInquiries());
document.getElementById("markWorkingBtn").addEventListener("click", () => updateMany({ status: "working" }));
document.getElementById("markCompletedBtn").addEventListener("click", () => updateMany({ status: "completed" }));
document.getElementById("resetAssignedBtn").addEventListener("click", () => updateMany({ status: "assigned" }));

document.getElementById("flagRedBtn").addEventListener("click", () => updateMany({ priority_flag: "red" }));
document.getElementById("flagYellowBtn").addEventListener("click", () => updateMany({ priority_flag: "yellow" }));
document.getElementById("flagGreenBtn").addEventListener("click", () => updateMany({ priority_flag: "green" }));
document.getElementById("flagNoneBtn").addEventListener("click", () => updateMany({ priority_flag: "none" }));


document.getElementById("deleteSelectedBtn").addEventListener("click", () => deleteMany(getSelectedIds()));




selectAll.addEventListener("change", (e) => {
  document.querySelectorAll("input[data-id]").forEach(cb => cb.checked = e.target.checked);
});

// Row-level delete (event delegation)

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  showOk("Signed out.");
  await loadInquiries();
});

loginBtn.addEventListener("click", async () => {
  loginErr.style.display = "none";
  loginErr.textContent = "";

  try {
    const email = loginEmail.value.trim();
    const password = loginPass.value;

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await loadInquiries();
  } catch (e) {
    loginErr.style.display = "block";
    loginErr.textContent = e.message || "Login failed.";
  }
});

// Important: This can fire during session restore. With nonce guard above, it won't duplicate rows.
sb.auth.onAuthStateChange(() => { loadInquiries(); });

loadInquiries();
