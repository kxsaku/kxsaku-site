import { createClient } from "/vendor/supabase-esm.js";

// Keep these consistent with your other pages
const SUPABASE_URL = "https://api.kxsaku.com";
const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const msg = document.getElementById("msg");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btn = document.getElementById("loginBtn");

function showMsg(text){
  msg.textContent = text;
  msg.style.display = "block";
}

// If already logged in, go straight to dashboard
const { data: { session } } = await supabase.auth.getSession();
if (session) window.location.href = "/sns-dashboard/";

// Turnstile CAPTCHA state
let turnstileToken = null;
window.onTurnstileSuccess = function(token) { turnstileToken = token; };
window.onTurnstileExpired = function() { turnstileToken = null; };

btn.addEventListener("click", async () => {
  msg.style.display = "none";
  btn.disabled = true;

  // Verify Turnstile CAPTCHA token before login
  const cfToken = turnstileToken || (typeof turnstile !== "undefined" ? turnstile.getResponse() : null);
  if (!cfToken) {
    showMsg("Please complete the CAPTCHA verification.");
    btn.disabled = false;
    return;
  }

  const email = emailEl.value.trim();
  const password = passEl.value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error){
    showMsg(error.message || "Login failed.");
    btn.disabled = false;
    return;
  }

  window.location.href = "/sns-dashboard/";
});
