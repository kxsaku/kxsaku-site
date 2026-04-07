import { createClient } from "/vendor/supabase-esm.js";

const SUPABASE_URL = "https://api.kxsaku.com";
const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});


const who = document.getElementById("who");
const logoutBtn = document.getElementById("logout");

const inqStatus = document.getElementById("inqStatus");
const inqBox = document.getElementById("inqBox");
const viewHistory = document.getElementById("viewHistory");

const subState = document.getElementById("subState");
const subscribeBtn = document.getElementById("subscribeBtn");
const manageBtn = document.getElementById("manageBtn");
const elSubStatus  = document.getElementById("subStatus");
const elPayStatus  = document.getElementById("payStatus");
const elPeriodEnd  = document.getElementById("periodEnd");
const elPaidAmount = document.getElementById("paidAmount");


async function requireUser() {
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;

  if (!user) {
    window.location.href = "/sns-login/";
    return null;
  }

  who.textContent = user.email;
  return user;
}


logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  window.location.href = "/sns-login/";
});

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtDate(iso){
  try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
}

async function loadInquiry(email){
  const { data, error } = await sb
    .from("inquiries")
    .select("created_at,contact_name,business_name,location,services,timeline,budget,goals,phone")
    .eq("email", email)
    .order("created_at", { ascending:false })
    .limit(1);

  if (error) {
    inqStatus.textContent = "Could not load inquiry.";
    inqBox.innerHTML = "";
    return;
  }

  if (!data || !data[0]) {
    inqStatus.textContent = "No inquiries found for your email yet.";
    inqBox.innerHTML = "";
    return;
  }

  const r = data[0];
  inqStatus.textContent = "Loaded";
  inqBox.innerHTML = `
    <div class="pillrow" style="margin-top:0;">
      <div class="pill"><strong>Submitted</strong>: ${fmtDate(r.created_at)}</div>
    </div>

    <div style="margin-top:12px;" class="inqMeta">
      <div class="kv"><div class="k">Contact</div><div class="v">${esc(r.contact_name) || "—"}</div></div>
      <div class="kv"><div class="k">Business</div><div class="v">${esc(r.business_name) || "—"}</div></div>
      <div class="kv"><div class="k">Location</div><div class="v">${esc(r.location) || "—"}</div></div>
      <div class="kv"><div class="k">Phone</div><div class="v">${esc(r.phone) || "—"}</div></div>
      <div class="kv" style="grid-column:1 / -1;"><div class="k">Services</div><div class="v">${esc((r.services || []).join(", ")) || "—"}</div></div>
      <div class="kv"><div class="k">Timeline</div><div class="v">${esc(r.timeline) || "—"}</div></div>
      <div class="kv"><div class="k">Budget</div><div class="v">${esc(r.budget) || "—"}</div></div>
    </div>
  `;

  inqBox.classList.remove("fadeIn");
  void inqBox.offsetWidth;
  inqBox.classList.add("fadeIn");


}

viewHistory.addEventListener("click", () => {
  // Uses your existing inquiry view page
  window.location.href = "/sns-inquiry-history/index.html";
});

async function loadSubscription(userId) {
  // Pull subscription snapshot from the Edge Function
  let resp;
  try {
    resp = await callFn("get-billing-status");
  } catch (e) {
    console.error("get-billing-status failed:", e);

    // Safe UI fallback
    subState.innerHTML = `<div class="muted">Subscription unavailable.</div>`;
    elSubStatus.textContent = "Status: Unknown";
    elPayStatus.textContent = "Payment: —";
    elPaidAmount.textContent = "Paid: —";
    elPeriodEnd.textContent = "Current Period End: —";
    manageBtn.style.display = "none";
    return;
  }

  const sub = resp?.subscription ?? null;

  // No subscription record yet
  if (!sub) {
    subState.innerHTML = `<div class="muted">No subscription record found yet.</div>`;
    elSubStatus.textContent = "Status: —";
    elPayStatus.textContent = "Payment: —";
    elPaidAmount.textContent = "Paid: —";
    elPeriodEnd.textContent = "Current Period End: —";
    manageBtn.style.display = "none";
    return;
  }

  // Normalize + present
  const statusRaw = (sub.status || "unknown").toString();
  const statusPretty = statusRaw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const paymentRaw = (sub.last_payment_status || "unknown").toString();
  const paymentPretty = paymentRaw.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const paid = (sub.last_payment_amount != null)
    ? `$${Number(sub.last_payment_amount).toFixed(2)}`
    : "—";

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleString()
    : "—";

  elSubStatus.textContent = `Status: ${statusPretty}`;
  elPayStatus.textContent = `Payment: ${paymentPretty}`;
  elPaidAmount.textContent = `Paid: ${paid}`;
  elPeriodEnd.textContent = `Current Period End: ${periodEnd}`;

  const activeish = ["active", "trialing", "past_due", "unpaid"].includes(statusRaw);
  manageBtn.style.display = activeish ? "inline-flex" : "none";

  subState.innerHTML = `<div class="muted">${
    statusRaw === "active" ? "Subscription is active."
    : statusRaw === "trialing" ? "Trial is active."
    : statusRaw === "past_due" ? "Payment is past due — update billing to restore service."
    : "No active subscription."
  }</div>`;
}



async function callFn(name, body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error("Not logged in.");

  const { data, error } = await sb.functions.invoke(name, {
    body: body || {},
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw new Error(error.message || "Edge function error");
  return data;
}




subscribeBtn.addEventListener("click", async () => {
  subscribeBtn.disabled = true;
  try {
    const j = await callFn("create-checkout-session");
    if (!j.url) throw new Error("No checkout URL returned.");
    window.location.href = j.url;
  } catch (e) {
    alert(e.message || String(e));
    subscribeBtn.disabled = false;
  }
});

manageBtn.addEventListener("click", async () => {
  manageBtn.disabled = true;
  try {
    const j = await callFn("create-portal-session");
    if (!j.url) throw new Error("No portal URL returned.");
    window.location.href = j.url;
  } catch (e) {
    alert(e.message || String(e));
    manageBtn.disabled = false;
  }
});

const user = await requireUser();
if (user) {
  await loadInquiry(user.email);

  try {
    await loadSubscription();
  } catch (e) {
    console.error("loadSubscription failed:", e);

    // Hard-fail UI so it doesn't sit on Loading forever
    subState.innerHTML = `<div class="muted">Subscription unavailable.</div>`;
    elSubStatus.textContent = "Status: Unknown";
    elPayStatus.textContent = "Payment: —";
    elPaidAmount.textContent = "Paid: —";
    elPeriodEnd.textContent = "Current Period End: —";
    manageBtn.style.display = "none";
  }
}

// ============================================================
// Mobile menu (consistent across your mobile pages)
// ============================================================
(function(){
  const menu = document.getElementById("menu");
  const scrim = document.getElementById("scrim");
  const openBtn = document.getElementById("openMenu");
  const closeBtn = document.getElementById("closeMenu");

  if(!menu || !scrim || !openBtn || !closeBtn) return;

  function open(){
    menu.classList.add("open");
    scrim.classList.add("open");
    menu.setAttribute("aria-hidden","false");
    scrim.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }
  function close(){
    menu.classList.remove("open");
    scrim.classList.remove("open");
    menu.setAttribute("aria-hidden","true");
    scrim.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();

// ============================================================
// View Desktop Site preference
// ============================================================
(function(){
  const a = document.getElementById("viewDesktop");
  if (!a) return;
  a.addEventListener("click", function(e){
    e.preventDefault();
    localStorage.setItem("sns_force_desktop", "1");
    location.replace("/sns-dashboard/");
  });
})();
