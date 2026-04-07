/* ===== Mobile slide-down menu (shared across mobile pages) ===== */
(function(){
  const menu = document.getElementById("menu");
  const scrim = document.getElementById("scrim");
  const openBtn = document.getElementById("openMenu");
  const closeBtn = document.getElementById("closeMenu");

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
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
})();
