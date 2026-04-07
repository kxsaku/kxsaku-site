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
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

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

// --------------------
// Client Chat elements
// --------------------
const chatState = document.getElementById("chatState");
const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatRefresh = document.getElementById("chatRefresh");
const chatSearch = document.getElementById("chatSearch");
const chatHint = document.getElementById("chatHint");
const chatTyping = document.getElementById("chatTyping");
const chatFile = document.getElementById("chatFile");
const chatAttachBtn = document.getElementById("chatAttachBtn");
const chatAttachTray = document.getElementById("chatAttachTray");
const chatDrop = document.getElementById("chatDrop");

let chatPendingFiles = []; // { storage_path, original_name, mime_type, size_bytes }


let chatTypingHideTimer = null;
let chatTypingSendTimer = null;
let chatTypingOn = false;


const chatOnlineDot = document.getElementById("chatOnlineDot");
const chatOnlineText = document.getElementById("chatOnlineText");
const chatUnreadDot = document.getElementById("chatUnreadDot");
const chatUnreadText = document.getElementById("chatUnreadText");

const chatJump = document.getElementById("chatJump");
const chatJumpBtn = document.getElementById("chatJumpBtn");

let chatThreadId = null;
let chatMessages = [];
let chatRealtimeSub = null;
let chatSearchQ = "";



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

async function loadSubscription() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return; // not logged in; requireUser() handles redirect

  const { data: resp, error } = await sb.functions.invoke("get-billing-status", {
    headers: { Authorization: `Bearer ${session.access_token}` }
  });

  if (error) {
    subState.innerHTML = `<div class="muted">Could not load subscription.</div>`;
    console.error("get-billing-status error:", error);
    return;
  }

  const sub = resp?.subscription ?? null;

  if (!sub) {
    subState.innerHTML = `<div class="muted">No subscription record found yet.</div>`;
    elSubStatus.textContent = "Status: —";
    elPayStatus.textContent = "Payment: —";
    elPaidAmount.textContent = "Paid: —";
    elPeriodEnd.textContent = "Current Period End: —";
    manageBtn.style.display = "none";
    return;
  }

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

  const activeish = ["active","trialing","past_due","unpaid"].includes(statusRaw);
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

function chatStopRealtime(){
  try{
    if (chatRealtimeSub){
      sb.removeChannel(chatRealtimeSub);
      chatRealtimeSub = null;
    }
  }catch(_){}
}

let chatMarkReadCooldown = false;

async function chatMarkRead(){
  if (!chatThreadId) return;
  if (document.visibilityState !== "visible") return;

  // simple throttle to avoid spamming updates
  if (chatMarkReadCooldown) return;
  chatMarkReadCooldown = true;
  setTimeout(() => { chatMarkReadCooldown = false; }, 900);

  try{
    await callFn("client-chat-mark-read", { thread_id: chatThreadId });

    // Tell admin chat to refresh receipts immediately
    try{
      if (chatThreadId && chatRealtimeSub) {
        await chatRealtimeSub.send({
          type: "broadcast",
          event: "read",
          payload: { role: "client", thread_id: chatThreadId, at: new Date().toISOString() }
        });
      }
    }catch(_){}
  }catch(_){
    // silent on purpose (read receipts should never break chat UI)
  }
}

// ---------------------
// Sound (client side)
// ---------------------
let audioCtx = null;
let audioUnlocked = false;

function ensureAudio(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Call once after any user gesture so sounds can play (autoplay restriction)
function unlockAudioOnce(){
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") ctx.resume();
  } catch(_) {}
}

window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
window.addEventListener("keydown", unlockAudioOnce, { once: true });

function playTone(type){
  // type: "incoming" (admin->client), later we'll add "outgoing"
  try {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();

    // Modern, soft two-oscillator chime
    if (type === "incoming"){
      o1.frequency.value = 523.25;  // C5
      o2.frequency.value = 783.99;  // G5
    } else {
      o1.frequency.value = 440;     // A4
      o2.frequency.value = 659.25;  // E5
    }

    o1.type = "sine";
    o2.type = "sine";

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    o1.connect(g);
    o2.connect(g);
    g.connect(ctx.destination);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 0.36);
    o2.stop(now + 0.36);
  } catch(_) {}
}

// 7-day cooldown per thread+direction
function shouldPlayIncomingSound(threadId){
  if (!threadId) return false;
  const key = `sns_chat_sound_incoming_${threadId}`;
  const last = Number(localStorage.getItem(key) || "0");
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (now - last < sevenDaysMs) return false;
  localStorage.setItem(key, String(now));
  return true;
}



function chatStartRealtime(){
  chatStopRealtime();
  if (!chatThreadId) return;

  chatRealtimeSub = sb
    .channel(`chat:${chatThreadId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "chat_messages",
      filter: `thread_id=eq.${chatThreadId}`,
    }, (payload) => {
      const m = payload.new;
      if (!m?.id) return;

      const msg = {
        id: m.id,
        sender_role: m.sender_role,
        body: m.body,
        created_at: m.created_at,
        edited: !!m.edited_at,
        deleted: !!m.deleted_at,
        reply_to_message_id: m.reply_to_message_id ?? null,
      };

      if (chatMessages.some(x => x.id === msg.id)) return;

      // IMPORTANT: Realtime INSERT does not include joined attachments.
      // If this is an attachment-only message (body empty), reload history to fetch attachments + signed URLs.
      if (!msg.body) {
        chatLoadHistory().catch(() => {});
        return;
      }

      const wasNear = chatNearBottom();

      chatMessages.push(msg);

      // Play incoming sound when admin sends a message to the client (7-day cooldown)
      if (msg.sender_role === "admin" && document.visibilityState === "visible"){
        if (shouldPlayIncomingSound(chatThreadId)) playTone("incoming");
      }


      chatRender();

      if (wasNear){
        requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
      } else {
        setUnread(true);
      }

      // If an admin message arrived and the client is viewing the chat, mark read
      if (msg.sender_role === "admin" && wasNear) {
        chatMarkRead();
      }

    })
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "chat_messages",
      filter: `thread_id=eq.${chatThreadId}`,
    }, (payload) => {
      const m = payload.new;
      if (!m?.id) return;

      const idx = chatMessages.findIndex(x => x.id === m.id);
      if (idx === -1) return;

      chatMessages[idx] = {
        ...chatMessages[idx],
        body: m.body,
        edited: !!m.edited_at,
        deleted: !!m.deleted_at,
      };

      chatRender();
    })
    .on("broadcast", { event: "typing" }, (payload) => {
      const p = payload?.payload || {};
      if (p.role !== "admin") return;

      chatTyping.style.display = p.on ? "block" : "none";

      clearTimeout(chatTypingHideTimer);
      chatTypingHideTimer = setTimeout(() => {
        chatTyping.style.display = "none";
      }, 1600);
    })
    .subscribe();
}

function chatSendTyping(on){
  if (!chatRealtimeSub) return;
  if (chatTypingOn === on) return;
  chatTypingOn = on;

  chatRealtimeSub.send({
    type: "broadcast",
    event: "typing",
    payload: { role: "client", on: !!on },
  });
}


// --------------------
// Client Chat helpers
// --------------------
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function chatAttsHTML(m){
    const atts = Array.isArray(m?.attachments) ? m.attachments : [];
    if (!atts.length) return "";

    const items = atts.map(a => {
      const url = a?.url || a?.signed_url || "";
      const name = a?.file_name || a?.original_name || "Attachment";
      const mime = (a?.mime_type || "").toLowerCase();

      if (mime.startsWith("image/") && url){
        return `<img class="chatImg" src="${esc(url)}" alt="${esc(name)}" loading="lazy" />`;
      }
      return `<a class="chatFile" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`;
    }).join("");

    return `<div class="chatAtts">${items}</div>`;
  }


function chatFmt(iso){
  try { return new Date(iso).toLocaleString(); } catch { return iso || ""; }
}

function chatNearBottom(){
  return (chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight) < 120;
}

function chatUpdateJump(){
  chatJump.classList.toggle("on", !chatNearBottom() && chatMessages.length > 0);
}

chatBody.addEventListener("scroll", chatUpdateJump);
chatJumpBtn.addEventListener("click", () => {
  chatBody.scrollTop = chatBody.scrollHeight;
});

function chatRender(){
  const q = (chatSearchQ || "").trim().toLowerCase();
  const view = !q ? chatMessages : chatMessages.filter(m => (m.body || "").toLowerCase().includes(q));

  // keep the jump button usable
  const wasNear = chatNearBottom();

  // Remove jump container first render-safe
  chatBody.innerHTML = `
    <div id="chatJump" class="chatJump">
      <button id="chatJumpBtn" class="btn btnGhost">Jump to newest</button>
    </div>
  `;

  // Re-bind jump controls after reset
  const _jump = chatBody.querySelector("#chatJump");
  const _jumpBtn = chatBody.querySelector("#chatJumpBtn");
  _jumpBtn.addEventListener("click", () => { chatBody.scrollTop = chatBody.scrollHeight; });
  chatBody.addEventListener("scroll", () => {
    const near = (chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight) < 120;
    _jump.classList.toggle("on", !near && view.length > 0);
  });

  if (!view.length){
    const empty = document.createElement("div");
    empty.className = "mutedSm";
    empty.style.padding = "8px 2px";
    empty.textContent = q ? "No matches in this chat." : "No messages yet.";
    chatBody.appendChild(empty);
    return;
  }

  view.forEach(m => {
    const div = document.createElement("div");
    const who = m.sender_role === "client" ? "me" : "them";
    const isDeleted = !!m.deleted;

    div.className = `chatMsg ${who} ${isDeleted ? "deleted" : ""}`;

    const body = isDeleted ? "Deleted Message" : (m.body || "");
    const atts = Array.isArray(m.attachments) ? m.attachments : [];

    const attHtml = atts.length ? `
      <div class="chatAtts">
        ${atts.map(a => {
          const name = esc(a.file_name || "attachment");
          const size = (typeof a.size_bytes === "number") ? `${Math.max(1, Math.round(a.size_bytes/1024))} KB` : "";
          const url = a.signed_url ? esc(a.signed_url) : "";
          const isImg = (a.mime_type || "").startsWith("image/");
          if (isImg && url) {
            return `
              <div class="chatAtt">
                <a href="${url}" target="_blank" rel="noreferrer">
                  <img class="chatImg" src="${url}" alt="${name}">
                </a>
                <div class="chatAttMeta">${name}${size ? ` · ${size}` : ""}</div>
              </div>
            `;
          }
          return `
            <div class="chatAtt">
              <div class="chatAttMeta">${name}${size ? ` · ${size}` : ""}</div>
              ${url ? `<a class="chatAttLink" href="${url}" target="_blank" rel="noreferrer">Download</a>` : `<span class="mutedSm">Link unavailable</span>`}
            </div>
          `;
        }).join("")}
      </div>
    ` : "";

    div.innerHTML = `
      <div class="chatText">${esc(body)}</div>
      ${isDeleted ? "" : chatAttsHTML(m)}
      <div class="chatFoot">

        <div>${esc(chatFmt(m.created_at))}${m.edited ? " · Edited" : ""}</div>
        <div class="chatTools">
          ${m.sender_role === "client" && !isDeleted ? `<button class="chatMiniBtn" data-act="edit" data-id="${esc(m.id)}">Edit</button>` : ``}
          ${m.sender_role === "client" && !isDeleted ? `<button class="chatMiniBtn" data-act="delete" data-id="${esc(m.id)}">Delete</button>` : ``}
          <button class="chatMiniBtn" data-act="reply" data-id="${esc(m.id)}">Reply</button>
        </div>
      </div>
    `;
    chatBody.appendChild(div);
  });

  // Restore scroll position behavior
  if (wasNear) {
    requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
  }
}

let replyToId = null;

function fmtBytes(n){
  const v = Number(n || 0);
  if (!v) return "0 B";
  const u = ["B","KB","MB","GB"];
  let i = 0, x = v;
  while (x >= 1024 && i < u.length-1){ x/=1024; i++; }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function renderAttachTray(){
  if (!chatPendingFiles.length){
    chatAttachTray.style.display = "none";
    chatAttachTray.innerHTML = "";
    return;
  }
  chatAttachTray.style.display = "flex";
  chatAttachTray.innerHTML = chatPendingFiles.map((a, idx) => `
    <div class="chatChip">
      <div class="chatChipName">${esc(a.original_name)} · ${esc(fmtBytes(a.size_bytes))}</div>
      <button class="chatChipX" data-att-x="${idx}">Remove</button>
    </div>
  `).join("");
}

chatAttachTray.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-att-x]");
  if (!b) return;
  const idx = Number(b.getAttribute("data-att-x"));
  if (!Number.isFinite(idx)) return;
  chatPendingFiles.splice(idx, 1);
  renderAttachTray();
});

chatAttachBtn.addEventListener("click", () => chatFile.click());

chatFile.addEventListener("change", async () => {
  const files = Array.from(chatFile.files || []);
  chatFile.value = "";
  if (!files.length) return;
  await chatHandleFiles(files);
});

async function chatHandleFiles(files){
  // Ensure thread exists (client-chat-history creates it if missing)
  if (!chatThreadId){
    await chatLoadHistory();
    if (!chatThreadId) throw new Error("No thread id yet.");
  }

  chatHint.textContent = "Uploading attachments…";
  chatSend.disabled = true;

  try{
    for (const f of files){
      await chatUploadOne(f);
    }
    chatHint.textContent = "";
  }catch(e){
    chatHint.textContent = e?.message || String(e);
  }finally{
    chatSend.disabled = false;
    renderAttachTray();
  }
}

async function chatUploadOne(file){
  const mime = (file.type || "application/octet-stream").trim();

  // 1) Ask Edge Function for a signed upload URL + token
  const j = await callFn("chat-attachment-upload-url", {
    thread_id: chatThreadId,
    file_name: file.name,
    mime_type: mime,
    size_bytes: file.size,
  });

  if (!j?.upload?.signed_upload_url || !j?.upload?.token || !j?.upload?.path || !j?.upload?.attachment_id){
    throw new Error("Upload URL generation failed.");
  }

  // 2) Upload file to the signed URL using supabase-js helper
  const bucket = j.upload.bucket || "chat-attachments";
  const path = j.upload.path;
  const token = j.upload.token;

  const up = await sb.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: mime });

  if (up.error) throw new Error(up.error.message);

  // 3) Add to pending list (will be linked to the message on send)
  chatPendingFiles.push({
    attachment_id: j.upload.attachment_id,
    storage_path: path,
    original_name: file.name,
    mime_type: mime,
    size_bytes: file.size,
  });
}

// Drag & drop (drop onto the chat card)
const chatCard = chatBody.closest(".chatWrap") || chatBody;
window.addEventListener("dragover", (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  chatDrop.style.display = "flex";
});
window.addEventListener("dragleave", (e) => {
  // Only hide when leaving the window
  if (e.relatedTarget == null) chatDrop.style.display = "none";
});
window.addEventListener("drop", async (e) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  chatDrop.style.display = "none";

  const files = Array.from(e.dataTransfer.files || []);
  if (!files.length) return;
  await chatHandleFiles(files);
});


chatBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.getAttribute("data-act");
  const id = btn.getAttribute("data-id");

  if (act === "reply") {
    replyToId = id;
    chatHint.textContent = `Replying to message ${id.slice(0,8)}… (send to attach reply)`;
    chatInput.focus();
    return;
  }

  if (act === "edit") {
    const m = chatMessages.find(x => x.id === id);
    if (!m || m.deleted) return;

    const next = prompt("Edit your message:", m.body || "");
    if (next == null) return;

    try {
      const j = await callFn("client-chat-edit", { message_id: id, body: next });
      if (j?.message) {
        const idx = chatMessages.findIndex(x => x.id === id);
        if (idx !== -1) chatMessages[idx] = { ...chatMessages[idx], ...j.message, edited: true };
        chatRender();
      } else {
        await chatLoadHistory();
      }
    } catch (e2) {
      chatHint.textContent = e2?.message || String(e2);
    }
    return;
  }

  if (act === "delete") {
    if (!confirm("Delete this message? It will show as 'Deleted Message'.")) return;

    try {
      const j = await callFn("client-chat-delete", { message_id: id });
      if (j?.message) {
        const idx = chatMessages.findIndex(x => x.id === id);
        if (idx !== -1) chatMessages[idx] = { ...chatMessages[idx], ...j.message, deleted: true, body: "Deleted Message" };
        chatRender();
      } else {
        await chatLoadHistory();
      }
    } catch (e2) {
      chatHint.textContent = e2?.message || String(e2);
    }
    return;
  }
});

async function chatLoadHistory(){
  chatState.textContent = "Loading…";
  try{
    const j = await callFn("client-chat-history", { limit: 200 });
    chatThreadId = j.thread_id || null;
    chatMessages = Array.isArray(j.messages) ? j.messages : [];
    chatState.textContent = "Ready";
    chatRender();
    chatStartRealtime();
    requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
    chatMarkRead();

  }catch(e){
    chatState.textContent = "Chat unavailable.";
    chatHint.textContent = e?.message || String(e);
  }
}

async function chatSendMsg(){
  const text = (chatInput.value || "").trim();
  if (!text && chatPendingFiles.length === 0) return;


  chatSend.disabled = true;
  try{
    const j = await callFn("client-chat-send", {
      body: text,
      reply_to_message_id: replyToId,
      attachment_ids: chatPendingFiles.map(f => f.attachment_id),
    });
    replyToId = null;
    chatHint.textContent = "";
    chatInput.value = "";
    chatSendTyping(false);
    chatPendingFiles = [];
    renderAttachTray();


    if (j?.message) {
      // De-dupe in case realtime INSERT arrived first
      if (!chatMessages.some(x => x.id === j.message.id)) {
        chatMessages.push(j.message);
      }
      chatRender();
      requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
    } else {
      await chatLoadHistory();
    }

  }catch(e){
    chatHint.textContent = e?.message || String(e);
  }finally{
    chatSend.disabled = false;
  }
}

chatBody.addEventListener("scroll", () => {
  if (chatNearBottom()){
    if (chatUnreadDot.classList.contains("new")) setUnread(false);
    chatMarkRead();
  }
});

window.addEventListener("focus", () => {
  if (chatNearBottom()) chatMarkRead();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && chatNearBottom()) chatMarkRead();
});


chatSend.addEventListener("click", chatSendMsg);
chatInput.addEventListener("keydown", (e) => {
  chatSendTyping(true);
  clearTimeout(chatTypingSendTimer);
  chatTypingSendTimer = setTimeout(() => chatSendTyping(false), 900);

  if (e.key === "Enter" && !e.shiftKey){
    e.preventDefault();
    chatSendTyping(false);
    chatSendMsg();
  }
});


chatRefresh.addEventListener("click", chatLoadHistory);
chatSearch.addEventListener("input", () => {
  chatSearchQ = chatSearch.value || "";
  chatRender();
});

// Presence indicators (client-side: shows only if YOU are online)
// Admin-only view of client online is on the admin chat page.
function setClientOnline(on){
  chatOnlineDot.classList.toggle("on", !!on);
  chatOnlineText.textContent = on ? "Online" : "Offline";
}

// Unread indicator (client-side: "new" just for UI feedback)
function setUnread(hasNew){
  chatUnreadDot.classList.toggle("new", !!hasNew);
  chatUnreadText.textContent = hasNew ? "New message" : "No new messages";
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
    await loadSubscription(user.id);
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
        // Init chat
  setClientOnline(true);
  await chatLoadHistory();
}


