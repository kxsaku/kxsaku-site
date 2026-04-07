// ===== CONFIG (edit these 2 lines) =====
const BUSINESS_EMAIL = "brandon.sns@proton.me";
const LINKEDIN_URL = "https://www.linkedin.com/in/brandon-ortiz-4b148326b/";

// Supabase Edge Function endpoint (you'll create this in step 2)
// Replace YOUR_PROJECT_REF with your Supabase project ref.
const CONTACT_ENDPOINT = "https://api.kxsaku.com/functions/v1/contact-email";
const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";

// ===== small helpers =====
const $ = (s) => document.querySelector(s);

function toast(title, msg, type="ok"){
  const t = $("#toast");
  const icon = $("#toastIcon");
  $("#toastTitle").textContent = title;
  $("#toastMsg").textContent = msg;

  t.dataset.type = type;

  // icon glyph by type
  icon.textContent = type === "ok" ? "\u2713" : (type === "warn" ? "!" : "\u00d7");

  t.classList.add("on");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("on"), 3000);
}

// ===== nav/contact setup =====
$("#year").textContent = new Date().getFullYear();

$("#emailText").textContent = BUSINESS_EMAIL;
$("#emailBtn").href = `mailto:${BUSINESS_EMAIL}`;

$("#linkedinText").textContent = LINKEDIN_URL.replace(/^https?:\/\//, "");
$("#linkedinBtn").href = LINKEDIN_URL;

// mailto fallback button
$("#mailtoFallback").addEventListener("click", () => {
  const subject = encodeURIComponent($("#subject").value || "SNS Inquiry");
  const body = encodeURIComponent($("#message").value || "");
  window.location.href = `mailto:${BUSINESS_EMAIL}?subject=${subject}&body=${body}`;
});

// ===== reveal-on-scroll =====
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if(e.isIntersecting){
      e.target.classList.add("on");
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.14 });

document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// Turnstile CAPTCHA state
let turnstileToken = null;
window.onTurnstileSuccess = function(token) { turnstileToken = token; };
window.onTurnstileExpired = function() { turnstileToken = null; };

// ===== form submit -> Supabase Edge Function =====
$("#contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = $("#sendBtn");

  // Honeypot check — silently fake success for bots
  if ($("#website").value) {
    $("#subject").value = "";
    $("#message").value = "";
    toast("Sent", "Message delivered. I'll reply soon.", "ok");
    return;
  }

  const subject = $("#subject").value.trim();
  const message = $("#message").value.trim();

  if(!subject || !message){
    toast("Missing info", "Add a subject + message.", "warn");
    return;
  }

  // Verify Turnstile CAPTCHA token
  const cfToken = turnstileToken || (typeof turnstile !== "undefined" ? turnstile.getResponse() : null);
  if (!cfToken) {
    toast("CAPTCHA required", "Please complete the verification.", "warn");
    return;
  }

  btn.disabled = true;
  btn.style.opacity = ".8";
  btn.textContent = "Sending...";

  try{
    const res = await fetch(CONTACT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        subject,
        message,
        captcha_token: cfToken,
        page: window.location.href,
        userAgent: navigator.userAgent
      })
    });

    if(!res.ok){
      const txt = await res.text().catch(()=> "");
      throw new Error(txt || `HTTP ${res.status}`);
    }

    $("#subject").value = "";
    $("#message").value = "";
    toast("Sent", "Message delivered. I'll reply soon.", "ok");
  } catch(err){
    // If backend isn't configured yet, user can still contact via mailto.
    console.error(err);
    toast("Not sent", "Send failed. Use the email button for now.", "err");
  } finally{
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = "Send";
  }
});
