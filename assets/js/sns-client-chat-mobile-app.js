    const SUPABASE_URL = "https://api.kxsaku.com";
    const SUPABASE_ANON_KEY = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3NzUyNDk4NTksICJleHAiOiAyMDkwNjA5ODU5fQ.jZdjxM_NH1gBhAYNBCV9tXEAPrLr36-JqhdduwWGBEI";
    const FN_BASE = `${SUPABASE_URL}/functions/v1`;

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function checkIsAdmin(userId) {
      const { data } = await sb.from("user_profiles").select("is_admin").eq("user_id", userId).maybeSingle();
      return data?.is_admin === true;
    }

    const whoami = document.getElementById("whoami");
    const logoutBtn = document.getElementById("logoutBtn");

    const loginOverlay = document.getElementById("loginOverlay");
    const loginBtn = document.getElementById("loginBtn");
    const loginEmail = document.getElementById("loginEmail");
    const loginPass = document.getElementById("loginPass");
    const loginErr = document.getElementById("loginErr");
    const loginHint = document.getElementById("loginHint");
    const loginCloseBtn = document.getElementById("loginCloseBtn");

    const refreshBtn = document.getElementById("refreshBtn");
    const clientCount = document.getElementById("clientCount");
    const clientsSub = document.getElementById("clientsSub");
    const clientSearch = document.getElementById("clientSearch");
    const clientList = document.getElementById("clientList");

    const chatPanel = document.getElementById("chatPanel");

    const chatTitle = document.getElementById("chatTitle");
    const chatSub = document.getElementById("chatSub");
    const chatErr = document.getElementById("chatErr");
    const messagesEl = document.getElementById("messages");
    
    const homeBtn = document.getElementById("homeBtn");
    const menuBtn = document.getElementById("menuBtn");
    const menu = document.getElementById("menu");
    const chatSearchPanel = document.getElementById("chatSearchPanel");
const typingLine = document.getElementById("typingLine");

    // Attachments (admin)
    const chatFile = document.getElementById("chatFile");
    const chatAttachBtn = document.getElementById("chatAttachBtn");
    const chatAttachTray = document.getElementById("chatAttachTray");
    const chatDrop = document.getElementById("chatDrop");

    // pending uploads waiting to be sent with the next message
    let chatPendingFiles = [];
    // each: { attachment_id, storage_path, original_name, mime_type, size_bytes }

    const composer = document.getElementById("composer");
    const sendBtn = document.getElementById("sendBtn");
    const scrollNew = document.getElementById("scrollNew");
    const jumpBtn = document.getElementById("jumpBtn");

    const exportBtn = document.getElementById("exportBtn");
    const statusBtn = document.getElementById("statusBtn");
    const notesBtn = document.getElementById("notesBtn");
    const broadcastBtn = document.getElementById("broadcastBtn");

    // Admin: View Original modal refs
    const origModal = document.getElementById("origModal");
    const origClose = document.getElementById("origClose");
    const origMeta = document.getElementById("origMeta");
    const origCurrent = document.getElementById("origCurrent");
    const origOriginal = document.getElementById("origOriginal");

    function openOrigModal(){
      origModal.classList.add("on");
      origModal.setAttribute("aria-hidden","false");
    }
    function closeOrigModal(){
      origModal.classList.remove("on");
      origModal.setAttribute("aria-hidden","true");
    }
    origClose.addEventListener("click", closeOrigModal);
    origModal.addEventListener("click", (e) => {
      if (e.target === origModal) closeOrigModal();
    });

    let clients = [];
    let activeClient = null;
    let activeThreadId = null;
    let messages = [];

    let uiMode = 'home';
    let homeQuery = '';


    let rtChannel = null;
    let typingHideTimer = null;
    let typingSendTimer = null;
    let typingOn = false;

    // --------------------
    // Sound (admin)
    // --------------------
    let audioCtx = null;
    let audioUnlocked = false;

    function ensureAudio(){
      if (audioCtx) return audioCtx;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("WebAudio unsupported");
      audioCtx = new Ctx();
      return audioCtx;
    }

    function unlockAudioOnce(){
      if (audioUnlocked) return;
      audioUnlocked = true;
      try{
        const ctx = ensureAudio();
        if (ctx.state === "suspended") ctx.resume();
      }catch(_){ }
    }

    // Autoplay restrictions: must be unlocked by a user gesture at least once.
    window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
    window.addEventListener("keydown", unlockAudioOnce, { once: true });

    function playToneIncoming(){
      try{
        const ctx = ensureAudio();
        if (ctx.state === "suspended") return;
        const now = ctx.currentTime;

        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const g = ctx.createGain();

        // Soft two-note chime (client -> admin)
        o1.type = "sine";
        o2.type = "sine";
        o1.frequency.value = 392.00;  // G4
        o2.frequency.value = 587.33;  // D5

        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        o1.connect(g);
        o2.connect(g);
        g.connect(ctx.destination);

        o1.start(now);
        o2.start(now);
        o1.stop(now + 0.36);
        o2.stop(now + 0.36);
      }catch(_){ }
    }

    // 7-day cooldown per thread (client -> admin)
    function shouldPlayIncomingSound(threadId){
      if (!threadId) return false;
      const key = `sns_admin_chat_sound_incoming_${threadId}`;
      const last = Number(localStorage.getItem(key) || "0");
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (now - last < sevenDaysMs) return false;
      localStorage.setItem(key, String(now));
      return true;
    }

    function maybePlayIncoming(threadId){
      // Requirement: hear it when you're on the chat window.
      if (document.visibilityState !== "visible") return;
      if (!shouldPlayIncomingSound(threadId)) return;
      playToneIncoming();
    }

    function sanitize(str){
      return String(str ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
    }


function isImageAtt(a){
  if (!a) return false;
  const name = String(a.file_name || a.original_name || "").toLowerCase();
  const urlRaw = String(a.url || a.signed_url || "");
  const url = urlRaw.toLowerCase();
  const mime = String(a.mime_type || "").toLowerCase();

  const extOk = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name) || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(url);
  return mime.startsWith("image/") || extOk;
}


    function receiptLabel(msg){
      if (msg.sender_role !== "admin") return "";
      if (msg.read_by_client_at) return "Read";
      if (msg.delivered_at) return "Delivered";
      return "";
    }

    // --------------------
    // View mode toggles
    // --------------------
    let viewMode = "home"; // "home" | "chat" | "broadcast" (broadcast later)

    const replyBar = document.getElementById("replyBar");
    const replySnippet = document.getElementById("replySnippet");
    const replyCancel = document.getElementById("replyCancel");

    let replyToMessageId = null;

    function setMode(mode){
      viewMode = mode;

      const inChat = (mode === "chat");
      const onHome = (mode === "home");

      
      if (messagesEl){ messagesEl.classList.toggle("homeMode", onHome); }
// Left search: keep as client filter (home + chat)
      clientSearch.style.display = "";
      clientSearch.placeholder = "Search name, business, email, phone…";

      // Header buttons only while in a chat.
      homeBtn.style.display = inChat ? "" : "none";
      menuBtn.style.display = inChat ? "" : "none";

      // Composer only while in a chat (broadcast later)
      composerBar.style.display = inChat ? "" : "none";
      chatAttachTray.style.display = inChat ? chatAttachTray.style.display : "none";
      chatDrop.style.display = "none";

      // Reply bar only while replying in chat mode
      if (!inChat){
        clearReply();
      }
    }

    function clearReply(){
      replyToMessageId = null;
      replyBar.style.display = "none";
      replySnippet.textContent = "—";
    }

    replyCancel.addEventListener("click", clearReply);

    function scrollToBottom(instant=true){
      const doHard = () => { 
        // hard set first (most reliable)
        messagesEl.scrollTop = messagesEl.scrollHeight;
      };

      if (!messagesEl) return;

      if (!instant){
        // smooth once, then hard-set on settle frames
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
      }

      requestAnimationFrame(() => {
        doHard();
        requestAnimationFrame(() => {
          doHard();
          requestAnimationFrame(doHard);
        });
      });

      // settle passes (media/layout)
      setTimeout(doHard, 60);
      setTimeout(doHard, 220);
      setTimeout(doHard, 900);
    }


    let pinnedToBottom = true;

    function updatePinned(){
      pinnedToBottom = (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 140;
    }

    function hookMediaAutoScroll(){
      // If images/videos load after initial render, keep pinned to bottom when appropriate.
      const els = messagesEl.querySelectorAll("img, video");
      els.forEach(el => {
        if (el.tagName === "IMG"){
          const img = el;
          if (img.complete) return;
          img.addEventListener("load", () => { if (pinnedToBottom) scrollToBottom(true); }, { once:true });
          img.addEventListener("error", () => {}, { once:true });
        } else {
          const v = el;
          if (v.readyState >= 1) return; // HAVE_METADATA
          v.addEventListener("loadedmetadata", () => { if (pinnedToBottom) scrollToBottom(true); }, { once:true });
        }
      });
    }


    // --------------------
    // Downloads
    // --------------------
    async function downloadBlob(url, filename){
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Download failed: ${r.status}`);
      const b = await r.blob();
      const a = document.createElement("a");
      const obj = URL.createObjectURL(b);
      a.href = obj;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 1500);
    }

    
    async function downloadAllForMessage(m){
      const atts = (Array.isArray(m.attachments) ? m.attachments : []).filter(a => !!(a && (a.url || a.signed_url)));
      const bodyText = String(m.body || "").trim();

      // No attachments: download message text
      if (!atts.length){
        const b = new Blob([bodyText], { type: "text/plain;charset=utf-8" });
        const obj = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = obj;
        a.download = `message_${m.id}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 1500);
        return;
      }

      // Single attachment: download directly
      if (atts.length === 1){
        const a0 = atts[0];
        const url = a0.url || a0.signed_url;
        const name = a0.file_name || a0.original_name || `attachment_${a0.id || ""}`;
        await downloadBlob(url, name);
        return;
      }

      // Multiple attachments: zip
      if (!window.JSZip){
        throw new Error("JSZip failed to load (cannot create .zip).");
      }

      const zip = new JSZip();
      const folder = zip.folder(`message_${m.id}`) || zip;

      // Optionally include message text as a note
      if (bodyText){
        folder.file("message.txt", bodyText);
      }

      // Download each file and add to zip
      let i = 1;
      for (const a of atts){
        const url = a.url || a.signed_url;
        if (!url) continue;

        let name = String(a.file_name || a.original_name || "").trim();
        if (!name){
          const extFromMime = (String(a.mime_type || "").toLowerCase().split("/")[1] || "bin").replace(/[^a-z0-9]+/g,"");
          name = `attachment_${i}.${extFromMime || "bin"}`;
        }

        // Avoid duplicate names inside the zip
        if (folder.file(name)){
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          name = `${base} (${i})${ext}`;
        }

        const r = await fetch(url);
        if (!r.ok) throw new Error(`Download failed (${r.status}) for ${name}`);
        const b = await r.blob();
        folder.file(name, b);
        i++;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = `message_${m.id}_attachments.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 2500);
    }


async function downloadOneForMessage(m){
      const atts = (Array.isArray(m.attachments) ? m.attachments : []).filter(isImageAtt);
  if (!atts.length) return;
  const a = atts[0];
      const url = a.url || a.signed_url;
      if (!url) throw new Error("Link unavailable");
      const name = a.file_name || a.original_name || "attachment";
      await downloadBlob(url, name);
    }

    function getMessageById(id){
      return messages.find(x => String(x.id) === String(id)) || null;
    }

    function shortSnippetFromMessage(m){
      if (!m) return "—";
      if (m.deleted || m.deleted_at) return "Deleted message";
      if (m.body) return String(m.body).slice(0, 140);
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      if (atts.length) return `${atts.length} attachment${atts.length===1?"":"s"}`;
      return "—";
    }

    function jumpToMessage(id){
      const el = messagesEl.querySelector(`[data-mid="${CSS.escape(String(id))}"]`);
      if (!el) return;

      const top = el.offsetTop - (messagesEl.clientHeight * 0.45);
      messagesEl.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1150);
    }


    // --------------------
    // UI Mode (home/chat/broadcast)
    // --------------------
    function setMode(mode){
      uiMode = mode;
      document.body.dataset.mode = mode;

      // close menus/panels
      menu.classList.remove("on");
      chatSearchPanel.classList.remove("on");
      chatSearchPanel.innerHTML = "";

      // Toggle header title/sub
      if (mode === "home"){
        chatTitle.textContent = "Client Chat";
        chatSub.textContent = "Search/select a client on the left to open a chat.";
      } else if (mode === "broadcast"){
        chatTitle.textContent = "Broadcast";
        chatSub.textContent = "Compose a broadcast message (implementation next).";
      }
      // chat mode title/sub are set in setActiveClient()

      // Composer
      const showComposer = (mode === "chat" || mode === "broadcast");
      composerBar.style.display = showComposer ? "flex" : "none";

      // Attachments UI safety
      if (!showComposer){
        chatPendingFiles = [];
        renderAttachTray();
      }

      // Top-left search (chat keyword search only)
      clientSearch.style.display = (mode === "chat") ? "block" : "none";
      if (mode !== "chat"){ clientSearch.value = ""; }
    }

    
async function withChatTransition(fn){
  if (!chatPanel){
    await fn();
    return;
  }

  chatPanel.classList.add("vfade");

  await new Promise((resolve) => {
    window.setTimeout(async () => {
      try{
        await fn();
      } finally {
        requestAnimationFrame(() => chatPanel.classList.remove("vfade"));
        resolve();
      }
    }, 120);
  });
}


async function goHome(){
  await withChatTransition(async () => {
    stopRealtime();
    typingLine.classList.remove("on");
    activeClient = null;
    activeThreadId = null;
    messages = [];
    clearChatErr();

    sendBtn.disabled = true;
    exportBtn.disabled = true;
    chatAttachBtn.disabled = true;

    setMode("home");
    renderMessages({ preserveScroll: true });
    renderClients();
  });
}


    // Home search input is rendered inside the HOME card (dynamic). Use event delegation.
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "homeSearch"){
        homeQuery = e.target.value || "";
        renderClients();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.target && e.target.id === "homeSearch" && e.key === "Enter"){
        e.preventDefault();
        const view = filterClients(clients);
        if (view.length) setActiveClient(view[0]);
      }
    });

    // --------------------
    // Chat keyword search (Discord-like)
    // --------------------
    function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function highlightHit(text, term){
      if (!term) return sanitize(text);
      const re = new RegExp(escapeRegExp(term), "ig");
      return sanitize(text).replace(re, (m) => `<span class="sr-mark">${m}</span>`);
    }

    function closeSearch(){
      chatSearchPanel.classList.remove("on");
      chatSearchPanel.innerHTML = "";
      clientSearch.value = "";
    }

    function buildSearchResults(term){
      const q = (term || "").trim();
      if (!q){ closeSearch(); return; }

      const hits = [];
      for (let i = 0; i < messages.length; i++){
        const mm = messages[i];
        if (!mm || !mm.id) continue;
        if (!!mm.deleted || !!mm.deleted_at) continue;
        const body = String(mm.body || "");
        if (!body) continue;
        if (body.toLowerCase().includes(q.toLowerCase())){
          const prev = messages[i-1] && !(messages[i-1].deleted || messages[i-1].deleted_at) ? messages[i-1] : null;
          const next = messages[i+1] && !(messages[i+1].deleted || messages[i+1].deleted_at) ? messages[i+1] : null;
          hits.push({ m: mm, prev, next });
        }
      }

      if (!hits.length){
        chatSearchPanel.innerHTML = `
          <div class="sr-row" style="cursor:default;">
            <div class="sr-ts">No results</div>
            <div class="sr-hit">No messages matched “${sanitize(q)}”.</div>
          </div>
        `;
        chatSearchPanel.classList.add("on");
        return;
      }

      chatSearchPanel.innerHTML = hits.slice(-80).reverse().map(h => {
        const ts = fmt(h.m.created_at);
        const prevText = h.prev ? (h.prev.body || "") : "";
        const nextText = h.next ? (h.next.body || "") : "";
        return `
          <div class="sr-row" data-mid="${sanitize(h.m.id)}">
            <div class="sr-ts">${sanitize(ts)}</div>
            <div class="sr-ghost">${highlightHit(prevText, q)}</div>
            <div class="sr-hit">${highlightHit(h.m.body || "", q)}</div>
            <div class="sr-ghost">${highlightHit(nextText, q)}</div>
          </div>
        `;
      }).join("");

      chatSearchPanel.classList.add("on");
    }


    function setAttachTrayVisible(on){
      chatAttachTray.style.display = on ? "block" : "none";
    }

    function renderAttachTray(){
      if (!chatPendingFiles.length){
        setAttachTrayVisible(false);
        chatAttachTray.innerHTML = "";
        return;
      }
      setAttachTrayVisible(true);

      chatAttachTray.innerHTML = `
        <div style="display:flex; gap:.55rem; flex-wrap:wrap;">
          ${chatPendingFiles.map((f, idx) => `
            <span class="tag" style="gap:.55rem;">
              ${sanitize(f.original_name)}
              <button class="mini-btn" type="button" data-rm-att="${idx}">X</button>
            </span>
          `).join("")}
        </div>
      `;
    }

    // remove attachment from tray
    chatAttachTray.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-rm-att]");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-rm-att"));
      if (!Number.isFinite(idx)) return;
      chatPendingFiles.splice(idx, 1);
      renderAttachTray();
    });

    async function putSignedUpload(url, file){
      // signed url may be relative or absolute depending on supabase response
      let putUrl = url;
      if (putUrl.startsWith("/")) putUrl = `${SUPABASE_URL}${putUrl}`;

      const r = await fetch(putUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!r.ok){
        const t = await r.text().catch(() => "");
        throw new Error(`Upload failed: ${r.status} ${t}`);
      }
    }

    async function uploadOneFileToThread(file){
      if (!activeThreadId) throw new Error("No thread_id yet. Open a client chat first.");

      // 1) get signed upload url + attachment_id
      const up = await callEdge("chat-attachment-upload-url", {
        thread_id: activeThreadId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });

      const upload = up?.upload;
      if (!upload?.signed_upload_url || !upload?.attachment_id || !upload?.path){
        throw new Error("Upload URL response missing fields.");
      }

      // 2) PUT the file bytes to signed url
      await putSignedUpload(upload.signed_upload_url, file);

      // 3) store metadata to send with admin-chat-send
      chatPendingFiles.push({
        attachment_id: upload.attachment_id,
        storage_path: upload.path,
        original_name: upload.original_name || file.name,
        mime_type: upload.mime_type || file.type || "application/octet-stream",
        size_bytes: upload.size_bytes || file.size,
      });

      renderAttachTray();
    }

    async function addFiles(files){
      const list = Array.from(files || []);
      if (!list.length) return;

      // simple sequential uploads (reliable, keeps it predictable)
      chatAttachBtn.disabled = true;
      chatAttachBtn.textContent = "Uploading…";
      try{
        for (const f of list){
          await uploadOneFileToThread(f);
        }
      }finally{
        chatAttachBtn.textContent = "Attach";
        chatAttachBtn.disabled = false;
      }
    }

    function showChatErr(msg){
      chatErr.style.display = "block";
      chatErr.textContent = msg;
    }
    function clearChatErr(){
      chatErr.style.display = "none";
      chatErr.textContent = "";
    }

    function lock(isLocked, hintMsg){
      if (isLocked){
        loginOverlay.style.display = "flex";
        loginErr.style.display = "none";
        loginErr.textContent = "";
        loginHint.textContent = hintMsg || "Admin-only";
        document.querySelector(".card").style.display = "none";
      } else {
        loginOverlay.style.display = "none";
        document.querySelector(".card").style.display = "block";
      }
    }

    async function ensureAdminOrShowLogin(){
      const { data: sess } = await sb.auth.getSession();
      const session = sess?.session;

      if (!session){
        lock(true);
        return false;
      }

      whoami.textContent = `Signed in: ${session.user?.email || "—"}`;

      if (!(await checkIsAdmin(session.user.id))){
        await sb.auth.signOut();
        lock(true, "Not an admin account.");
        return false;
      }

      lock(false);
      return true;
    }

    async function login(){
      loginErr.style.display = "none";
      loginErr.textContent = "";

      const email = (loginEmail.value || "").trim();
      const pass = (loginPass.value || "").trim();
      if (!email || !pass){
        loginErr.style.display = "block";
        loginErr.textContent = "Enter email and password.";
        return;
      }

      loginBtn.disabled = true;
      try{
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;

        const ok = await ensureAdminOrShowLogin();
        if (ok) await loadClientList();
      }catch(e){
        loginErr.style.display = "block";
        loginErr.textContent = e?.message || String(e);
      }finally{
        loginBtn.disabled = false;
      }
    }

    async function logout(){
      await sb.auth.signOut();
      whoami.textContent = "Signed in: —";
      lock(true);
    }

    async function callEdge(fnName, payload = {}){
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Not logged in.");

      const res = await fetch(`${FN_BASE}/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type":"application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `This page requires the Edge Function: ${fnName}.`);
      return j;
    }

    function stopRealtime(){
      try{
        if (rtChannel){
          sb.removeChannel(rtChannel);
          rtChannel = null;
        }
      }catch(_){}
    }

    function renderClientsSkeleton(){
      clientList.innerHTML = `
        ${Array.from({length: 8}).map(() => `
          <div class="client skel skel-box" style="cursor:default;">
            <div class="skel-stack">
              <div class="skel skel-line" style="width: 70%;"></div>
              <div class="skel skel-line sm" style="width: 55%;"></div>
              <div class="skel-row">
                <div class="skel skel-line sm" style="width: 38%;"></div>
                <div class="skel skel-line sm" style="width: 42%;"></div>
              </div>
            </div>
          </div>
        `).join("")}
      `;
    }

    function renderMessagesSkeleton(){
      messagesEl.innerHTML = `
        <div class="home" style="width:min(900px,100%);">
          <div class="home-card">
            <div class="skel skel-line" style="width: 45%; height: 14px;"></div>
            <div style="height:10px;"></div>
            <div class="skel skel-line sm" style="width: 78%;"></div>
            <div style="height:12px;"></div>
            <div class="skel skel-line" style="width: 100%; height: 44px; border-radius: 999px;"></div>
          </div>
        </div>
      `;
    }

    function startRealtime(){
      stopRealtime();
      if (!activeThreadId) return;

      rtChannel = sb
        .channel(`chat:${activeThreadId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        }, (payload) => {
          const m = payload.new;
          if (!m?.id) return;

          // normalize to your UI shape
          const msg = {
            id: m.id,
            sender_role: m.sender_role,
            body: m.body,
            created_at: m.created_at,
            edited: !!m.edited_at,
            original_body: m.original_body ?? null,
            deleted: !!m.deleted_at,
            delivered_at: m.delivered_at ?? null,
            read_by_client_at: m.read_by_client_at ?? null,
          };

          // Dedup
          if (messages.some(x => x.id === msg.id)) return;

          const wasNear = (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 140;

          // If it's an attachment-only message, reload history so we fetch attachments + signed URLs
          if (!msg.body) {
            loadHistory(false).catch(() => {});
          }

          messages.push(msg);

          // Sound: play on incoming client message
          if (msg.sender_role === "client") {
            maybePlayIncoming(activeThreadId);
          }

          renderMessages({ preserveScroll: true });

          if (wasNear){
            requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
          } else {
            updateJump();
          }

          // If this is NOT the active client thread, refresh client list order/badges
          loadClientList().catch(() => {});
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${activeThreadId}`,
        }, (payload) => {
          const m = payload.new;
          if (!m?.id) return;

          const idx = messages.findIndex(x => x.id === m.id);
          if (idx === -1) return;

          messages[idx] = {
            ...messages[idx],
            body: m.body,
            edited: !!m.edited_at,
            original_body: m.original_body ?? messages[idx].original_body,
            deleted: !!m.deleted_at,
            delivered_at: m.delivered_at ?? messages[idx].delivered_at,
            read_by_client_at: m.read_by_client_at ?? messages[idx].read_by_client_at,
          };

          renderMessages();
        })
        .on("broadcast", { event: "typing" }, (payload) => {
          // payload: { role: "client"|"admin", on: boolean }
          const p = payload?.payload || {};
          if (p.role !== "client") return;

          typingLine.classList.toggle("on", !!p.on);

          // auto-hide if they stop sending typing events
          clearTimeout(typingHideTimer);
          typingHideTimer = setTimeout(() => {
            typingLine.classList.remove("on");
          }, 1600);
        })
        // NOTE: read broadcasts now only update UI (no history reload / no scroll reset)
        .on("broadcast", { event: "read" }, (payload) => {
          const p = payload?.payload || {};
          if (!p.at || p.thread_id !== activeThreadId || p.role !== "client") return;

          let changed = false;
          for (const m of messages){
            if (m.sender_role === "admin" && m.delivered_at && !m.read_by_client_at){
              m.read_by_client_at = p.at;
              changed = true;
            }
          }
          if (changed) renderMessages();
        })
        .subscribe();
    }

    function sendTyping(on){
      if (!rtChannel) return;

      // avoid spamming identical state
      if (typingOn === on) return;
      typingOn = on;

      rtChannel.send({
        type: "broadcast",
        event: "typing",
        payload: { role: "admin", on: !!on },
      });
    }

    async function adminViewOriginal(messageId){
      const j = await callEdge("admin-chat-view-original", { message_id: messageId });

      const m = j?.message;
      if (!m) throw new Error("No message returned.");

      const deleted = !!m.deleted;
      const edited = !!m.edited;

      origMeta.textContent = `ID: ${m.id} · Sender: ${m.sender_role} · ${edited ? "Edited" : "Not edited"} · ${deleted ? "Deleted" : "Not deleted"}`;

      // Current (what UI shows)
      origCurrent.textContent = m.body || "";

      // Original (admin-only)
      origOriginal.textContent = m.original_body || "";
      origOriginal.classList.toggle("red", deleted);

      openOrigModal();
    }

    function fmt(ts){
      if (!ts) return "—";
      try{ return new Date(ts).toLocaleString(); }catch{ return "—"; }
    }

    function filterClients(list){
      const q = (homeQuery || "").trim().toLowerCase();
      if (!q) return list;
      return list.filter(c =>
        (c.full_name || "").toLowerCase().includes(q) ||
        (c.business_name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    }

    function renderClients(){
      const view = filterClients(clients);

      clientCount.textContent = String(view.length);
      clientsSub.textContent = `${view.length} client${view.length === 1 ? "" : "s"} · sorted by newest message`;

      if (!view.length){
        clientList.innerHTML = `
          <div class="client" style="cursor:default;">
            <div class="name">No clients found</div>
            <div class="biz">Try a different search.</div>
          </div>
        `;
        return;
      }

      clientList.innerHTML = view.map(c => {
        const isActive = activeClient && activeClient.user_id === c.user_id;
        const hasNew = !!c.has_unread;
        const onlineDot = c.is_online ? "dot-online" : "dot-offline";
        const onlineLabel = c.is_online ? "Online" : (c.last_seen ? `Last seen: ${fmt(c.last_seen)}` : "Offline");
        return `
          <div class="client ${isActive ? "active" : ""} ${hasNew ? "has-new" : ""}" data-user="${sanitize(c.user_id)}">
            <div class="newglow"></div>
            <div class="row">
              <div style="min-width:0;">
                <div class="name">${sanitize(c.full_name || c.email || "—")}</div>
                <div class="biz">${sanitize(c.business_name || "—")}</div>
                <div class="meta">
                  <span class="tag"><span class="dot ${onlineDot}"></span>${sanitize(onlineLabel)}</span>
                  <span class="tag">Last: ${sanitize(c.last_message_at ? fmt(c.last_message_at) : "No messages")}</span>
                </div>
              </div>
              <div style="display:flex; flex-direction:column; gap:.5rem; align-items:flex-end;">
                ${hasNew ? `<span class="tag"><span class="dot dot-new"></span>NEW</span>` : ``}
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    function renderHome(){
      setMode('home');

      messagesEl.innerHTML = `
        <div class="home home-center">
          <div class="home-hero">
            <div class="home-title">SNS Client Chat</div>
            <div class="home-sub">Search a client, then jump straight into their conversation.</div>

            <div class="home-glass">
              <button id="homeBroadcast" class="btn btn-primary home-broadcast" type="button">Broadcast</button>
              <input id="homeSearch" class="home-search" placeholder="Search clients by name, business, email, or phone…" />
            </div>
          </div>
        </div>
      `;

      const hs = document.getElementById("homeSearch");
      const hb = document.getElementById("homeBroadcast");
      if (hs){
        hs.value = homeQuery || "";
        hs.focus();
      }
      if (hb){
        hb.addEventListener("click", () => {
          // Placeholder only (you said we can implement later)
          alert("Broadcast: coming next. For now, select a client to chat.");
        });
      }
    }

    function renderMessages(opts = {}){
      if (!activeClient){
        renderHome();
        return;
      }

      if (!messages.length){
        messagesEl.innerHTML = `
          <div class="msg" style="max-width:100%; opacity:.85;">
            <div class="text">No messages yet.</div>
          </div>
        `;
        return;
      }

      messagesEl.innerHTML = messages.map(m => {
        const isDeleted = !!m.deleted || !!m.deleted_at;
        const cls = isDeleted ? "deleted" : (m.sender_role === "admin" ? "admin" : "client");
        const body = isDeleted ? "Deleted Message" : (m.body || "");
        const attsAll = Array.isArray(m.attachments) ? m.attachments : [];
        const imgAtts = attsAll.filter(isImageAtt);
        const imgCount = imgAtts.length;

        const r = receiptLabel(m);
        // Replace delivered with read (show one label only)
        const receiptText = r ? (" · " + r) : "";
        const isEdited = !!m.edited || !!m.edited_at;

        return `
        <div class="msg ${cls}" data-mid="${sanitize(m.id)}">
          ${(() => {
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            const safeText = sanitize(body);
            const replyToId = m.reply_to_message_id;
            const replyMsg = replyToId ? getMessageById(replyToId) : null;
            const replyHtml = replyToId ? `
              <div class="replyQuote" data-jump="${sanitize(replyToId)}" title="Jump to replied message">
                <div class="rqMeta">
                  <span>Reply</span>
                  <span>·</span>
                  <span>${sanitize(replyMsg?.sender_role === 'admin' ? 'You' : (activeClient?.name || 'Client'))}</span>
                  <span>·</span>
                  <span>${sanitize(replyMsg ? fmt(replyMsg.created_at) : 'message')}</span>
                </div>
                <div class="rqText">${sanitize(shortSnippetFromMessage(replyMsg))}</div>
              </div>
            ` : ``;

            if (!atts.length) return `${replyHtml}<div class="text">${safeText}</div>`;

            const attHtml = atts.map(a => {
              const name = sanitize(a.file_name || a.original_name || "attachment");
              const size = (typeof a.size_bytes === "number") ? `${Math.max(1, Math.round(a.size_bytes/1024))} KB` : "";
              const urlRaw = a.url || a.signed_url || "";
              const url = urlRaw ? sanitize(urlRaw) : "";
              const mime = (a.mime_type || "").toLowerCase();
              const looksLikeImage =
                /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name) ||
                /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(urlRaw);

              const isImg = mime.startsWith("image/") || looksLikeImage;

              if (isImg && url) {
                return `
                    <div class="att">
                      <a href="${url}" target="_blank" rel="noreferrer">
                        <img class="attImg" src="${url}" alt="${name}" loading="lazy">
                      </a>

                      <a class="attDl" href="${url}" download title="Download image" aria-label="Download image">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M12 3v10"/>
                          <path d="M7 11l5 5 5-5"/>
                          <path d="M5 21h14"/>
                        </svg>
                      </a>

                      <div class="attMeta">${name}${size ? ` · ${size}` : ""}</div>
                    </div>
                  `;}

              return `
                  <div class="att">
                    <div class="attMeta">${name}${size ? ` · ${size}` : ""}</div>
                    <span class="attMeta" style="opacity:.8;">Non-image attachment</span>
                  </div>
                `;}).join("");

            return `
              <div class="text">${safeText}</div>
              <div class="atts">${attHtml}</div>
            `;
          })()}

          <div class="foot">
            <div class="mini">
              <span>${sanitize(fmt(m.created_at))}</span>
              ${receiptText ? `<span>·</span><span>${sanitize(receiptText)}</span>` : ``}
            </div>

            <div class="mini-actions">
              ${m.sender_role === "client" ? `
                <button class="mini-icon" type="button" data-act="reply" data-id="${sanitize(m.id)}" data-mid="${sanitize(m.id)}" title="Reply">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 9V5l-7 7 7 7v-4c7 0 10 2 11 6-1-8-4-12-11-12z"/>
                  </svg>
                </button>
              ` : ``}
${(Array.isArray(m.attachments) && m.attachments.length > 1) ? `
                ${imgCount > 1 ? `<button class="mini-icon" type="button" data-act="dlall" data-id="${sanitize(m.id)}" title="Download all">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 3v8"/>
                    <path d="M7 8l5 5 5-5"/>
                    <path d="M6 21h12"/>
                    <path d="M4 14h4"/>
                    <path d="M16 14h4"/>
                  </svg>
                </button>` : ``}
              ` : ``}

              ${(isEdited || isDeleted) ? `
                <button class="mini-btn" type="button" data-act="orig" data-id="${sanitize(m.id)}">View Original</button>
              ` : ``}
            </div>
          </div>        </div>
        `;
      }).join("");
      hookMediaAutoScroll();
      if (opts && opts.forceBottom) {
        pinnedToBottom = true;
        scrollToBottom(true);
        // extra settle (lazy media + layout changes)
        setTimeout(() => { if (pinnedToBottom) scrollToBottom(true); }, 120);
        setTimeout(() => { if (pinnedToBottom) scrollToBottom(true); }, 520);
      }
    }

    async function setActiveClient(c){
      await withChatTransition(async () => {
        setMode('chat');

        // Clear local unread badge for this client immediately
        try{
          const idx = clients.findIndex(x => x.user_id === c.user_id);
          if (idx !== -1) clients[idx].has_unread = false;
        }catch(_){ }

        clientSearch.placeholder = 'Search in chat…';

        stopRealtime();
        typingLine.classList.remove("on");
        activeThreadId = null;
        activeClient = c;

        chatTitle.textContent = `Chat · ${c.full_name || c.email || "Client"}`;
        chatSub.textContent = c.business_name ? c.business_name : (c.phone ? `Phone: ${c.phone}` : "—");

        clearChatErr();
        sendBtn.disabled = false;
        exportBtn.disabled = false;
        chatAttachBtn.disabled = false;

        pinnedToBottom = true;

        await loadHistory(true);

        renderClients();
      });
    }


    async function loadClientList(){
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing…";
      clientsSub.textContent = "Loading…";
      renderClientsSkeleton();

      try{
        const data = await callEdge("admin-chat-client-list", {});
        clients = Array.isArray(data?.clients) ? data.clients : [];
        renderClients();

        // IMPORTANT: do NOT auto-open the first client.
        // If the user has no active chat selected, keep the Home view.
        if (!activeClient){
          renderMessages();
        }
      }catch(e){
        clients = [];
        activeClient = null;
        messages = [];
        renderClients();
        renderMessages();
        showChatErr(e?.message || String(e));
      }finally{
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh";
      }
    }

    async function loadHistory(forceBottom){
      if (!activeClient) return;

      messages = [];
      renderMessagesSkeleton();

      try{
        const data = await callEdge("admin-chat-history", { user_id: activeClient.user_id, limit: 60 });

        activeThreadId = data?.thread_id || null;
        messages = Array.isArray(data?.messages) ? data.messages : [];

        renderMessages({ forceBottom: !!forceBottom });

        // Start realtime AFTER you have thread_id
        startRealtime();
        if (forceBottom){ pinnedToBottom = true; scrollToBottom(true); }
      }catch(e){
        showChatErr(e?.message || String(e));
      }
    }

    async function sendMessage(){
      if (!activeClient) return;

      const text = (composer.value || "").trim();
      const hasFiles = chatPendingFiles.length > 0;

      // allow sending with attachments only
      if (!text && !hasFiles) return;

      composer.value = "";
      composer.focus();
      // reply state is consumed on send
      const replyToSend = replyToMessageId;

      sendTyping(false);

      const payload = {
        user_id: activeClient.user_id,
        body: text,
        reply_to_message_id: replyToSend || null,
        attachments: chatPendingFiles.map(a => ({
          attachment_id: a.attachment_id,
        })),
      };

      // clear pending UI immediately (so it feels instant)
      chatPendingFiles = [];
      renderAttachTray();

      try{
        const data = await callEdge("admin-chat-send", payload);
        const msg = data?.message;
        if (msg){
          messages.push(msg);
          renderMessages();
          scrollToBottom(true);
          clearReply();
        } else {
          await loadHistory(true);
          clearReply();
        }
      }catch(e){
        showChatErr(e?.message || String(e));
      }
    }

    function updateJump(){
      updatePinned();
      scrollNew.classList.toggle("on", !pinnedToBottom && !!activeClient);
    }

    messagesEl.addEventListener("scroll", updateJump, { passive:true });
    jumpBtn.addEventListener("click", () => { pinnedToBottom = true; scrollToBottom(false); });

    
    refreshBtn.addEventListener("click", loadClientList);

    homeBtn.addEventListener("click", goHome);

    // Burger menu
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("on");
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== menuBtn) menu.classList.remove("on");
      if (!chatSearchPanel.contains(e.target) && e.target !== clientSearch) chatSearchPanel.classList.remove("on");
    });

    // Chat keyword search input (chat mode only)
    clientSearch.addEventListener("input", () => {
      if (uiMode !== "chat") return;
      buildSearchResults(clientSearch.value);
    });

    clientSearch.addEventListener("keydown", (e) => {
      if (uiMode !== "chat") return;
      if (e.key === "Escape"){ closeSearch(); }
    });

    chatSearchPanel.addEventListener("click", (e) => {
      const row = e.target.closest(".sr-row[data-mid]");
      if (!row) return;
      const mid = row.getAttribute("data-mid");
      if (!mid) return;

      chatSearchPanel.classList.remove("on");
      document.querySelectorAll(".msg.focus").forEach(n => n.classList.remove("focus"));

      const el = messagesEl.querySelector(`.msg[data-mid="${CSS.escape(mid)}"]`);
      if (!el) return;

      el.classList.add("focus");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => { el.classList.remove("focus"); }, 1800);
    });


    clientSearch.addEventListener("input", () => {
      renderClients();
      if (!activeClient) renderMessages(); // keep home search in sync
    });

    clientList.addEventListener("click", (e) => {
      const node = e.target.closest(".client");
      if (!node) return;

      node.classList.add("tapped");
      window.setTimeout(() => node.classList.remove("tapped"), 220);

      const userId = node.getAttribute("data-user");
      const c = clients.find(x => x.user_id === userId);
      if (c) setActiveClient(c);
    });

    messagesEl.addEventListener("click", async (e) => {
      // Jump to replied message
      const rq = e.target.closest(".replyQuote[data-jump]");
      if (rq){
        const id = rq.getAttribute("data-jump");
        if (id) jumpToMessage(id);
        return;
      }

      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      try{
        if (act === "orig"){
          if (!id) return;
          await adminViewOriginal(id);
          return;
        }

        if (act === "reply"){
          if (!id) return;
          replyToMessageId = id;
          const m = getMessageById(id);
          replySnippet.textContent = shortSnippetFromMessage(m);
          replyBar.style.display = "";
          // focus composer
          chatInput?.focus?.();
          return;
        }

        if (act === "dl1"){
          if (!id) return;
          const m = getMessageById(id);
          if (!m) return;
          await downloadOneForMessage(m);
          return;
        }

        if (act === "dlall"){
          if (!id) return;
          const m = getMessageById(id);
          if (!m) return;
          await downloadAllForMessage(m);
          return;
        }
      }catch(err){
        showChatErr(err?.message || String(err));
      }
    });

    chatAttachBtn.addEventListener("click", () => {
      if (!activeClient) return;
      chatFile.value = "";
      chatFile.click();
    });

    chatFile.addEventListener("change", async () => {
      try{
        await addFiles(chatFile.files);
      }catch(e){
        showChatErr(e?.message || String(e));
      }
    });

    // Drag & drop
    window.addEventListener("dragenter", (e) => {
      if (!activeClient) return;
      e.preventDefault();
      chatDrop.style.display = "block";
    });
    window.addEventListener("dragover", (e) => {
      if (!activeClient) return;
      e.preventDefault();
      chatDrop.style.display = "block";
    });
    window.addEventListener("dragleave", (e) => {
      if (!activeClient) return;
      if (e.target === document.documentElement || e.target === document.body){
        chatDrop.style.display = "none";
      }
    });
    window.addEventListener("drop", async (e) => {
      if (!activeClient) return;
      e.preventDefault();
      chatDrop.style.display = "none";
      const dt = e.dataTransfer;
      if (!dt?.files?.length) return;
      try{
        await addFiles(dt.files);
      }catch(err){
        showChatErr(err?.message || String(err));
      }
    });

    sendBtn.addEventListener("click", sendMessage);
    
    // Broadcast (UI only for now)
    broadcastBtn.addEventListener("click", () => {
      setMode("broadcast");
      stopRealtime();
      activeClient = null;
      activeThreadId = null;
      messages = [];
      clearChatErr();

      messagesEl.innerHTML = `
        <div class="msg" style="max-width:100%; opacity:.85;">
          <div class="text">Broadcast composer ready. (We’ll wire delivery logic next.)</div>
        </div>
      `;

      composer.value = "";
      composer.focus();
      sendBtn.disabled = false;
      chatAttachBtn.disabled = false;
    });

composer.addEventListener("keydown", (e) => {
      // typing on (debounced off)
      sendTyping(true);
      clearTimeout(typingSendTimer);
      typingSendTimer = setTimeout(() => sendTyping(false), 900);

      if (e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        sendTyping(false);
        sendMessage();
      }
    });


    // --------------------
    // Client Status Manager (global)
    // --------------------
    const statusModal = document.getElementById("statusModal");
    const statusClose = document.getElementById("statusClose");
    const statusCurrent = document.getElementById("statusCurrent");
    const statusMessage = document.getElementById("statusMessage");
    const statusNormal = document.getElementById("statusNormal");
    const statusMaintenance = document.getElementById("statusMaintenance");
    const statusEmergency = document.getElementById("statusEmergency");

    async function getSystemStatus(){
      try{
        return await callEdge("system-status-get", {});
      }catch(e){
        return { mode: "unknown", message: "" };
      }
    }

    async function setSystemStatus(mode){
      const msg = (statusMessage?.value || "").trim();
      const res = await callEdge("system-status-set", { mode, message: msg });
      return res;
    }

    function openStatusModal(){
      if (!statusModal) return;
      statusModal.classList.add("on");
      statusModal.style.display = "flex";
      getSystemStatus().then(s => {
        if (statusCurrent) statusCurrent.textContent = `${String(s?.mode || "unknown").toUpperCase()}${s?.updated_at ? ` · ${new Date(s.updated_at).toLocaleString()}` : ""}`;
        if (statusMessage && typeof s?.message === "string") statusMessage.value = s.message;
      });
    }
    function closeStatusModal(){
      if (!statusModal) return;
      statusModal.classList.remove("on");
      statusModal.style.display = "none";
    }

    if (statusBtn){
      statusBtn.addEventListener("click", () => { openStatusModal(); menu.classList.remove("on"); });
    }
    if (statusClose) statusClose.addEventListener("click", closeStatusModal);
    if (statusModal) statusModal.addEventListener("click", (e) => { if (e.target === statusModal) closeStatusModal(); });

    if (statusNormal) statusNormal.addEventListener("click", async () => {
      await setSystemStatus("normal");
      const s = await getSystemStatus();
      if (statusCurrent) statusCurrent.textContent = `${String(s?.mode || "unknown").toUpperCase()}${s?.updated_at ? ` · ${new Date(s.updated_at).toLocaleString()}` : ""}`;
    });
    if (statusMaintenance) statusMaintenance.addEventListener("click", async () => {
      await setSystemStatus("maintenance");
      const s = await getSystemStatus();
      if (statusCurrent) statusCurrent.textContent = `${String(s?.mode || "unknown").toUpperCase()}${s?.updated_at ? ` · ${new Date(s.updated_at).toLocaleString()}` : ""}`;
    });
    if (statusEmergency) statusEmergency.addEventListener("click", async () => {
      if (!confirm("Emergency Mode will BLOCK the client chat page from loading. Continue?")) return;
      await setSystemStatus("emergency");
      const s = await getSystemStatus();
      if (statusCurrent) statusCurrent.textContent = `${String(s?.mode || "unknown").toUpperCase()}${s?.updated_at ? ` · ${new Date(s.updated_at).toLocaleString()}` : ""}`;
    });

    // --------------------
    // Internal Notes
    // --------------------
    const notesView = document.getElementById("notesView");
    const notesBackBtn = document.getElementById("notesBackBtn");
    const notesSearch = document.getElementById("notesSearch");
    const notesSearchMode = document.getElementById("notesSearchMode");
    const noteNewBtn = document.getElementById("noteNewBtn");
    const notesListEl = document.getElementById("notesList");

    const noteTitleEl = document.getElementById("noteTitle");
    const noteBodyEl = document.getElementById("noteBody");
    const noteSavedEl = document.getElementById("noteSaved");
    const noteClientBtn = document.getElementById("noteClientBtn");
    const noteClientChip = document.getElementById("noteClientChip");
    const noteDeleteBtn = document.getElementById("noteDeleteBtn");
        // Notes delete modal
    const noteDeleteModal = document.getElementById("noteDeleteModal");
    const noteDeleteClose = document.getElementById("noteDeleteClose");
    const noteDeleteCancel = document.getElementById("noteDeleteCancel");
    const noteDeleteConfirm = document.getElementById("noteDeleteConfirm");
    const noteDeletePreview = document.getElementById("noteDeletePreview");

    function openNoteDeleteModal(){
      if (!noteDeleteModal) return;
      const n = notes.find(x => x.id === activeNoteId);
      const title = (n?.title || "").trim() || "Untitled note";
      const meta = (n?.client_label || n?.client_email || "").trim();
      if (noteDeletePreview){
        noteDeletePreview.textContent = meta ? `${title} — ${meta}` : title;
      }
      noteDeleteModal.classList.add("on");
      noteDeleteModal.style.display = "flex";
      noteDeleteModal.setAttribute("aria-hidden","false");
    }
    function closeNoteDeleteModal(){
      if (!noteDeleteModal) return;
      noteDeleteModal.classList.remove("on");
      noteDeleteModal.style.display = "none";
      noteDeleteModal.setAttribute("aria-hidden","true");
    }

    if (noteDeleteClose) noteDeleteClose.addEventListener("click", closeNoteDeleteModal);
    if (noteDeleteCancel) noteDeleteCancel.addEventListener("click", closeNoteDeleteModal);
    if (noteDeleteModal) noteDeleteModal.addEventListener("click", (e) => { if (e.target === noteDeleteModal) closeNoteDeleteModal(); });


    const notesClientPick = document.getElementById("notesClientPick");
    const notesClientClose = document.getElementById("notesClientClose");
    const notesClientSearch = document.getElementById("notesClientSearch");
    const notesClientList = document.getElementById("notesClientList");

    let notes = [];
    let activeNoteId = null;
    let saveTimer = null;
    let savedFlashTimer = null;

    const notesBusy = document.getElementById("notesBusy");
    const notesBusyText = document.getElementById("notesBusyText");

    function setNotesBusy(on, text){
      if (notesBusyText) notesBusyText.textContent = text || "Loading…";
      if (notesBusy) notesBusy.classList.toggle("on", !!on);

      // Disable note editor controls while busy
      if (noteTitleEl) noteTitleEl.disabled = !!on;
      if (noteBodyEl) noteBodyEl.disabled = !!on;
      if (noteNewBtn) noteNewBtn.disabled = !!on;
      if (noteClientBtn) noteClientBtn.disabled = !!on;
      if (noteDeleteBtn) noteDeleteBtn.disabled = !!on;
      if (notesSearch) notesSearch.disabled = !!on;
      if (notesSearchMode) notesSearchMode.disabled = !!on;
    }

    function renderNotesSkeleton(){
      // left list skeleton
      if (notesListEl){
        notesListEl.innerHTML = Array.from({length: 10}).map(() => `
          <div class="noteItem skel" style="padding: 10px 12px;">
            <div class="skel skel-line" style="width: 70%;"></div>
            <div style="height:8px;"></div>
            <div class="skel skel-line sm" style="width: 52%;"></div>
          </div>
        `).join("");
      }

      // editor skeleton
      if (noteTitleEl) noteTitleEl.value = "";
      if (noteBodyEl) noteBodyEl.value = "";
      if (noteClientChip){ noteClientChip.style.display = "none"; noteClientChip.textContent = ""; }
    }


    function showSaved(){
      if (!noteSavedEl) return;
      noteSavedEl.classList.add("on");
      noteSavedEl.style.opacity = "1";
      if (savedFlashTimer) clearTimeout(savedFlashTimer);
      savedFlashTimer = setTimeout(() => {
        noteSavedEl.classList.remove("on");
        noteSavedEl.style.opacity = "0";
      }, 900);
    }

    function openNotes(){
      if (!notesView) return;
      const card = document.querySelector(".card");
      if (card) card.style.display = "none";
      notesView.style.display = "block";
      setMode("notes");
      menu.classList.remove("on");
      loadNotes().catch(() => {});
    }
    function closeNotes(){
      if (!notesView) return;
      const card = document.querySelector(".card");
      if (card) card.style.display = "";
      notesView.style.display = "none";
      setMode(activeClient ? "chat" : "home");
    }

    if (notesBtn){
      notesBtn.addEventListener("click", () => { openNotes(); });
    }
    if (notesBackBtn){
      notesBackBtn.addEventListener("click", closeNotes);
    }

    async function callNotes(action, payload={}){
      return await callEdge("admin-notes", { action, ...payload });
    }

    function renderNotesList(){
      if (!notesListEl) return;
      notesListEl.innerHTML = notes.map(n => {
        const title = sanitize(n.title || "Untitled");
        const meta = sanitize(n.client_label || (n.client_email || "") || "");
        const cls = (n.id === activeNoteId) ? "noteItem on" : "noteItem";
        return `<div class="${cls}" data-note="${sanitize(n.id)}">
          <div class="noteItemTitle">${title}</div>
          <div class="noteItemMeta">${meta || "&nbsp;"}</div>
        </div>`;
      }).join("");
    }

    function setActiveNote(id){
      activeNoteId = id;
      const n = notes.find(x => x.id === id) || null;

      if (noteTitleEl) noteTitleEl.value = n?.title || "";
      if (noteBodyEl) noteBodyEl.value = n?.body || "";

      if (noteClientChip){
        if (n?.client_label){
          noteClientChip.style.display = "inline-flex";
          noteClientChip.textContent = `Client: ${n.client_label}`;
        }else{
          noteClientChip.style.display = "none";
          noteClientChip.textContent = "";
        }
      }

      renderNotesList();
    }

    async function loadNotes(){
      const q = (notesSearch?.value || "").trim();
      const mode = (notesSearchMode?.value || "keywords");

      setNotesBusy(true, "Loading…");
      renderNotesSkeleton();

      try{
        const res = await callNotes("list", { q, mode, limit: 100 });
        notes = Array.isArray(res?.notes) ? res.notes : [];
        renderNotesList();

        // Auto-select first note
        if (!activeNoteId){
          if (notes.length) setActiveNote(notes[0].id);
        } else {
          const still = notes.find(x => x.id === activeNoteId);
          if (!still && notes.length) setActiveNote(notes[0].id);
        }
      }finally{
        setNotesBusy(false);
      }
    }


    if (notesListEl){
      notesListEl.addEventListener("click", (e) => {
        const it = e.target.closest("[data-note]");
        if (!it) return;
        const id = it.getAttribute("data-note");
        if (!id) return;

        // quick skeleton/transition (keeps it feeling “loaded”)
        setNotesBusy(true, "Loading…");
        window.setTimeout(() => {
          try{ setActiveNote(id); }
          finally{ setNotesBusy(false); }
        }, 140);
      });
    }


    async function createNewNote(){
      setNotesBusy(true, "Creating…");
  // Instant, blank note (optimistic)
  const tempId = `temp_${Date.now()}`;
  const nowIso = new Date().toISOString();
  const temp = {
    id: tempId,
    title: "",
    body: "",
    client_user_id: null,
    client_label: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  notes = [temp, ...(Array.isArray(notes) ? notes : [])];
  activeNoteId = tempId;
  renderNotesList();
  setActiveNote(tempId);

  if (noteTitleEl) noteTitleEl.value = "";
  if (noteBodyEl) noteBodyEl.value = "";
  if (noteClientChip){
    noteClientChip.style.display = "none";
    noteClientChip.textContent = "";
  }
  if (noteTitleEl) noteTitleEl.focus();

  // Create on backend (no id) and replace temp id
  try{
    const res = await callNotes("upsert", { note: { title: "", body: "" } });
    if (res?.note?.id){
      const real = res.note;
      const idx = notes.findIndex(x => x.id === tempId);
      if (idx >= 0) notes[idx] = { ...notes[idx], ...real };
      activeNoteId = real.id;
      renderNotesList();
      setActiveNote(real.id);
      showSaved();
    }
  }catch(_){
    // keep temp locally; save will retry on next input
  }finally{
    setNotesBusy(false);
  }
}


    if (noteNewBtn) noteNewBtn.addEventListener("click", createNewNote);

    function scheduleSave(){
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const n = notes.find(x => x.id === activeNoteId);
        if (!n) return;
        const title = (noteTitleEl?.value || "").trim();
        const body = String(noteBodyEl?.value || "");
        const res = await callNotes("upsert", { note: { id: activeNoteId, title, body, client_user_id: n.client_user_id || null, client_label: n.client_label || null } });
        if (res?.note){
          // merge updated fields
          const idx = notes.findIndex(x => x.id === activeNoteId);
          if (idx >= 0) notes[idx] = { ...notes[idx], ...res.note };
          renderNotesList();
          showSaved();
        }
      }, 450);
    }

    function onNoteInput(){
      const n = notes.find(x => x.id === activeNoteId);
      if (!n) return;
      n.title = String(noteTitleEl?.value || "");
      n.body = String(noteBodyEl?.value || "");
      n.updated_at = new Date().toISOString();
      renderNotesList();
      scheduleSave();
    }

    if (noteTitleEl) noteTitleEl.addEventListener("input", onNoteInput);
    if (noteBodyEl) noteBodyEl.addEventListener("input", onNoteInput);
if (notesSearch) notesSearch.addEventListener("input", () => { loadNotes().catch(() => {}); });
    if (notesSearchMode) notesSearchMode.addEventListener("change", () => { loadNotes().catch(() => {}); });

    // Client picker for note linking
    function openClientPicker(){
      if (!notesClientPick) return;
      notesClientPick.classList.add("on");
      notesClientPick.style.display = "flex";
      if (notesClientSearch) { notesClientSearch.value = ""; notesClientSearch.focus(); }
      renderClientPicker("");
    }
    function closeClientPicker(){
      if (!notesClientPick) return;
      notesClientPick.classList.remove("on");
      notesClientPick.style.display = "none";
    }

    function clientLabel(c){
      const parts = [c.full_name || "", c.business_name ? `(${c.business_name})` : "", c.email ? `· ${c.email}` : "", c.phone ? `· ${c.phone}` : ""].filter(Boolean);
      return parts.join(" ");
    }

    function renderClientPicker(q){
      if (!notesClientList) return;
      const query = String(q || "").toLowerCase();
      const list = (Array.isArray(clients) ? clients : []).filter(c => {
        const blob = `${c.full_name||""} ${c.business_name||""} ${c.email||""} ${c.phone||""}`.toLowerCase();
        return !query || blob.includes(query);
      }).slice(0, 120);

      notesClientList.innerHTML = list.map(c => {
        const label = sanitize(clientLabel(c));
        return `<div class="pickItem" data-pick="${sanitize(c.user_id)}">${label}</div>`;
      }).join("") || `<div style="opacity:.75; padding: 10px;">No clients found.</div>`;
    }

    if (noteClientBtn) noteClientBtn.addEventListener("click", openClientPicker);
    if (notesClientClose) notesClientClose.addEventListener("click", closeClientPicker);
    if (notesClientPick) notesClientPick.addEventListener("click", (e) => { if (e.target === notesClientPick) closeClientPicker(); });
    if (notesClientSearch) notesClientSearch.addEventListener("input", () => renderClientPicker(notesClientSearch.value));

    if (notesClientList){
      notesClientList.addEventListener("click", (e) => {
        const it = e.target.closest("[data-pick]");
        if (!it) return;
        const user_id = it.getAttribute("data-pick");
        const c = clients.find(x => x.user_id === user_id);
        if (!c) return;
        const label = clientLabel(c);

        const n = notes.find(x => x.id === activeNoteId);
        if (!n) return;

        n.client_user_id = c.user_id;
        n.client_label = label;
        n.updated_at = new Date().toISOString();
        renderNotesList();
if (noteClientChip){
          noteClientChip.style.display = "inline-flex";
          noteClientChip.textContent = `Client: ${label}`;
        }
        closeClientPicker();
        scheduleSave();
      });
    }

    if (noteDeleteBtn){
      noteDeleteBtn.addEventListener("click", () => {
        const n = notes.find(x => x.id === activeNoteId);
        if (!n) return;
        openNoteDeleteModal();
      });
    }

    if (noteDeleteConfirm){
      noteDeleteConfirm.addEventListener("click", async () => {
        const n = notes.find(x => x.id === activeNoteId);
        if (!n) return;

        // If it's a temp note that never got created server-side, just remove locally.
        if (String(activeNoteId || "").startsWith("temp_")){
          notes = notes.filter(x => x.id !== activeNoteId);
          activeNoteId = null;
          if (noteTitleEl) noteTitleEl.value = "";
          if (noteBodyEl) noteBodyEl.value = "";
          if (noteClientChip){ noteClientChip.style.display = "none"; noteClientChip.textContent = ""; }
          closeNoteDeleteModal();
          renderNotesList();
          if (notes.length) setActiveNote(notes[0].id);
          return;
        }

        try{
          setNotesBusy(true, "Deleting…");
          closeNoteDeleteModal();

          await callNotes("delete", { id: activeNoteId });

          activeNoteId = null;
          if (noteTitleEl) noteTitleEl.value = "";
          if (noteBodyEl) noteBodyEl.value = "";
          if (noteClientChip){ noteClientChip.style.display = "none"; noteClientChip.textContent = ""; }

          await loadNotes();
        }catch(e){
          showChatErr(e?.message || String(e));
        }finally{
          setNotesBusy(false);
        }
      });
    }


    logoutBtn.addEventListener("click", logout);
    loginBtn.addEventListener("click", login);
    loginPass.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    loginEmail.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

    loginCloseBtn.addEventListener("click", () => { window.location.href = "/sns/"; });

    // Default state: Home (no auto-open)
    sendBtn.disabled = true;
    exportBtn.disabled = true;
    chatAttachBtn.disabled = true;

    renderMessages();

    (async function init(){
      const ok = await ensureAdminOrShowLogin();
      if (ok) await loadClientList();
    })();
// Mobile tab switching
(function(){
  const tabClients = document.getElementById('tabClients');
  const tabChat = document.getElementById('tabChat');
  const clientsPanel = document.getElementById('clientsPanel');
  const chatPanel = document.getElementById('chatPanel');

  function showClients(){
    tabClients.classList.add('active');
    tabChat.classList.remove('active');
    clientsPanel.classList.add('mobile-visible');
    chatPanel.classList.remove('mobile-visible');
  }

  function showChat(){
    tabChat.classList.add('active');
    tabClients.classList.remove('active');
    chatPanel.classList.add('mobile-visible');
    clientsPanel.classList.remove('mobile-visible');
  }

  tabClients.addEventListener('click', showClients);
  tabChat.addEventListener('click', showChat);

  // Auto-switch to chat when a client is selected
  const clientList = document.getElementById('clientList');
  if(clientList){
    clientList.addEventListener('click', function(e){
      const client = e.target.closest('.client');
      if(client){
        setTimeout(showChat, 100);
      }
    });
  }

  // Start with clients panel visible
  showClients();
})();

// View Desktop Site preference
(function(){
  const a = document.getElementById("viewDesktop");
  if (!a) return;
  a.addEventListener("click", function(e){
    e.preventDefault();
    localStorage.setItem("sns_force_desktop", "1");
    location.replace("/sns-client-chat/");
  });
})();
