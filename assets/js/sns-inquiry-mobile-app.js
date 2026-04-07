import { createClient } from "/vendor/supabase-esm.js";

// Keep your current values (as you already had working before)
const supabaseUrl = "https://api.kxsaku.com";
const supabaseAnonKey = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const form = document.getElementById("sns-inquiry-form");
const msgEl = document.getElementById("sns-message");
const submitBtn = document.getElementById("submitBtn");

const toasts = document.getElementById("toasts");
function toast(title, message, type="good", ms=3000){
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="ic">
      ${type === "good"
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="rgba(122,249,196,.95)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="rgba(255,148,148,.95)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      }
    </div>
    <div>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;
  toasts.appendChild(el);

  window.setTimeout(() => {
    el.classList.add("fade");
    window.setTimeout(() => el.remove(), 320);
  }, ms);
}

let isSubmitting = false;

function showInline(text, isError = true){
  msgEl.style.display = "block";
  msgEl.classList.toggle("bad", isError);
  msgEl.classList.toggle("good", !isError);
  msgEl.textContent = text;
}
function clearInline(){
  msgEl.style.display = "none";
  msgEl.textContent = "";
  msgEl.classList.add("bad");
  msgEl.classList.remove("good");
}

// OTP elements
const otpModal = document.getElementById("otpModal");
const otpCode = document.getElementById("otpCode");
const otpCancel = document.getElementById("otpCancel");
const otpVerify = document.getElementById("otpVerify");
const otpResend = document.getElementById("otpResend");
const otpMsg = document.getElementById("otpMsg");

function otpShowMsg(text, isErr){
  otpMsg.style.display = "block";
  otpMsg.classList.toggle("bad", !!isErr);
  otpMsg.classList.toggle("good", !isErr);
  otpMsg.textContent = text;
}
function otpClearMsg(){
  otpMsg.style.display = "none";
  otpMsg.textContent = "";
  otpMsg.classList.remove("bad","good");
}

function openOtpModal(phoneForResend, onVerify){
  if (!otpModal || !otpCode || !otpCancel || !otpVerify || !otpResend || !otpMsg) {
    showInline("OTP UI failed to load. Refresh the page.", true);
    return;
  }

  otpModal.classList.add("open");
  otpModal.setAttribute("aria-hidden","false");
  otpCode.value = "";
  otpClearMsg();
  otpCode.focus();

  const cleanup = () => {
    otpModal.classList.remove("open");
    otpModal.setAttribute("aria-hidden","true");
    otpCancel.onclick = null;
    otpVerify.onclick = null;
    otpResend.onclick = null;
  };

  otpCancel.onclick = () => cleanup();

  otpVerify.onclick = async () => {
    const code = (otpCode.value || "").trim();
    if (!/^\d{6}$/.test(code)) {
      otpShowMsg("Enter the 6-digit code.", true);
      return;
    }
    otpVerify.disabled = true;
    try{
      await onVerify(code);
      cleanup();
    } catch(e){
      otpShowMsg(e?.message || "Verification failed.", true);
    } finally{
      otpVerify.disabled = false;
    }
  };

  otpResend.onclick = async () => {
    otpResend.disabled = true;
    try{
      await sendOtp(phoneForResend);
      otpShowMsg("Code resent.", false);
      toast("Code resent", "Check your phone for the new 6-digit code.", "good", 2600);
    } catch(e){
      otpShowMsg(e?.message || "Failed to resend.", true);
      toast("Resend failed", "Use the email method or try again.", "bad", 3200);
    } finally{
      otpResend.disabled = false;
    }
  };
}

async function callOtpFunction(body){
  const res = await fetch(`${supabaseUrl}/functions/v1/inquiry-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseAnonKey,
      "Authorization": `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "OTP request failed");
  }
  return data;
}

async function sendOtp(phone){
  await callOtpFunction({ action: "send", phone });
}

async function verifyOtpAndSubmit(phone, code, payload){
  await callOtpFunction({ action: "check", phone, code, payload });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  isSubmitting = true;
  submitBtn.disabled = true;
  clearInline();

  try {
    const fd = new FormData(form);

    // Normalize / validate phone
    const phoneRaw = (fd.get("phone") || "").toString();
    const digits = phoneRaw.replace(/\D/g, "");
    let d = digits;
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);

    const obviousFake = new Set([
      "0000000000","1111111111","2222222222","3333333333","4444444444",
      "5555555555","6666666666","7777777777","8888888888","9999999999",
      "1234567890",
    ]);

    if (d.length !== 10 || obviousFake.has(d)) {
      showInline("Please enter a valid US phone number (10 digits).", true);
      toast("Not sent", "Invalid phone number.", "bad", 3200);
      return;
    }

    const phoneDisplay = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    const phoneE164 = `+1${d}`;

    const helpWith = fd.getAll("help_with");
    if (!helpWith.length) {
      showInline("Please select at least one option.", true);
      toast("Not sent", "Select at least one option.", "bad", 3200);
      return;
    }

    const payload = {
      contact_name: (fd.get("contactName") || "").toString().trim(),
      business_name: (fd.get("businessName") || "").toString().trim(),
      email: (fd.get("email") || "").toString().trim(),
      phone: phoneE164,
      location: (fd.get("location") || "").toString().trim(),
      company_size: fd.get("companySize"),
      services: helpWith,
      current_setup: (fd.get("currentSetup") || "").toString().trim() || null,
      goals: (fd.get("goals") || "").toString().trim(),
      budget: fd.get("budget"),
      timeline: fd.get("timeline"),
      extra_notes: (fd.get("extraNotes") || "").toString().trim() || null,
    };

    // 1) Send OTP
    await sendOtp(phoneE164);
    toast("Code sent", `Text sent to ${phoneDisplay}. Enter the 6-digit code.`, "good", 2800);

    // 2) Verify + submit
    openOtpModal(phoneE164, async (code) => {
      await verifyOtpAndSubmit(phoneE164, code, payload);
      toast("Sent", "Inquiry submitted successfully.", "good", 2200);
      window.location.href = "/sns-inquiry-success/index.html";
    });

  } catch (err) {
    console.error("Inquiry submit failed:", err);
    showInline(`Failed: ${err?.message || "Unknown error"}`, true);
    toast("Not sent", err?.message || "Something failed sending your inquiry.", "bad", 3600);
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
  }
});
