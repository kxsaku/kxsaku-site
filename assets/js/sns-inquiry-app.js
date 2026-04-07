import { createClient } from "/vendor/supabase-esm.js";

const supabaseUrl = "https://api.kxsaku.com";
const supabaseAnonKey = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const form = document.getElementById("sns-inquiry-form");
const msgEl = document.getElementById("sns-message");
const submitBtn = document.getElementById("submitBtn");
const toastsEl = document.getElementById("toasts");

// Expose toast globally
window.toast = function(title, message, type = "good", ms = 3000) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">
      ${type === "good"
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      }
    </div>
    <div class="toast-text">
      <strong>${title}</strong>
      <span>${message}</span>
    </div>
  `;
  toastsEl.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  }, ms);
};

function showMsg(text, isError = true) {
  msgEl.style.display = "block";
  msgEl.className = `msg ${isError ? 'error' : 'success'}`;
  msgEl.textContent = text;
}
function clearMsg() {
  msgEl.style.display = "none";
}

// OTP
const otpModal = document.getElementById("otpModal");
const otpCode = document.getElementById("otpCode");
const otpCancel = document.getElementById("otpCancel");
const otpVerify = document.getElementById("otpVerify");
const otpResend = document.getElementById("otpResend");
const otpMsg = document.getElementById("otpMsg");

function otpShowMsg(text, isErr) {
  otpMsg.style.display = "block";
  otpMsg.className = `otp-msg ${isErr ? 'bad' : 'good'}`;
  otpMsg.textContent = text;
}
function otpClearMsg() {
  otpMsg.style.display = "none";
  otpMsg.className = "otp-msg";
}

function openOtpModal(phoneForResend, onVerify) {
  otpModal.classList.add("open");
  otpModal.setAttribute("aria-hidden", "false");
  otpCode.value = "";
  otpClearMsg();
  setTimeout(() => otpCode.focus(), 100);

  const cleanup = () => {
    otpModal.classList.remove("open");
    otpModal.setAttribute("aria-hidden", "true");
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
    try {
      await onVerify(code);
      cleanup();
    } catch (e) {
      otpShowMsg(e?.message || "Verification failed.", true);
    } finally {
      otpVerify.disabled = false;
    }
  };

  otpResend.onclick = async () => {
    otpResend.disabled = true;
    try {
      await sendOtp(phoneForResend);
      otpShowMsg("New code sent.", false);
      toast("Code resent", "Check your phone.", "good", 2600);
    } catch (e) {
      otpShowMsg(e?.message || "Failed to resend.", true);
    } finally {
      otpResend.disabled = false;
    }
  };
}

async function callOtpFunction(body) {
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

async function sendOtp(phone) {
  await callOtpFunction({ action: "send", phone });
}

async function verifyOtpAndSubmit(phone, code, payload) {
  await callOtpFunction({ action: "check", phone, code, payload });
}

let isSubmitting = false;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  isSubmitting = true;
  submitBtn.disabled = true;
  clearMsg();

  // Honeypot check — silently fake success for bots
  if (document.getElementById("website").value) {
    toast("Inquiry sent", "We'll be in touch.", "good", 2500);
    window.location.href = "/sns-inquiry-success/index.html";
    return;
  }

  try {
    const fd = new FormData(form);

    // Validate step 3 required fields
    const goals = (fd.get("goals") || "").toString().trim();
    const budget = fd.get("budget");
    const timeline = fd.get("timeline");
    if (!goals) { showMsg("Please describe your network goals."); submitBtn.disabled = false; isSubmitting = false; return; }
    if (!budget) { showMsg("Please select a budget range."); submitBtn.disabled = false; isSubmitting = false; return; }
    if (!timeline) { showMsg("Please select a timeline."); submitBtn.disabled = false; isSubmitting = false; return; }

    // Phone
    const phoneRaw = (fd.get("phone") || "").toString();
    const digits = phoneRaw.replace(/\D/g, "");
    let d = digits;
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    const phoneDisplay = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    const phoneE164 = `+1${d}`;

    const helpWith = fd.getAll("help_with");

    const payload = {
      contact_name: (fd.get("contactName") || "").toString().trim(),
      business_name: (fd.get("businessName") || "").toString().trim(),
      email: (fd.get("email") || "").toString().trim(),
      phone: phoneE164,
      location: (fd.get("location") || "").toString().trim(),
      company_size: fd.get("companySize"),
      services: helpWith,
      current_setup: (fd.get("currentSetup") || "").toString().trim() || null,
      goals: goals,
      budget: budget,
      timeline: timeline,
      extra_notes: (fd.get("extraNotes") || "").toString().trim() || null,
    };

    // Send OTP
    await sendOtp(phoneE164);
    toast("Code sent", `Text sent to ${phoneDisplay}`, "good", 3000);

    // Verify + submit
    openOtpModal(phoneE164, async (code) => {
      await verifyOtpAndSubmit(phoneE164, code, payload);
      toast("Inquiry sent", "We'll be in touch.", "good", 2500);
      window.location.href = "/sns-inquiry-success/index.html";
    });

  } catch (err) {
    console.error("Submit failed:", err);
    showMsg(`Failed: ${err?.message || "Unknown error"}`);
    toast("Not sent", err?.message || "Something went wrong.", "bad", 3500);
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
  }
});
