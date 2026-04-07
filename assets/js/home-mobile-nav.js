// Mobile menu (home page variant — drawer-based with viewDesktop integration)
(function(){
  const menuBtn = document.getElementById("menuBtn");
  const closeBtn = document.getElementById("closeMenuBtn");
  const backdrop = document.getElementById("drawerBackdrop");
  const drawer = document.getElementById("drawer");
  const viewDesktop = document.getElementById("viewDesktop");

  function openMenu(){
    document.body.classList.add("menu-open");
    menuBtn && menuBtn.setAttribute("aria-expanded", "true");
    // prevent background scroll on iOS
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function closeMenu(){
    document.body.classList.remove("menu-open");
    menuBtn && menuBtn.setAttribute("aria-expanded", "false");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }

  menuBtn && menuBtn.addEventListener("click", openMenu);
  closeBtn && closeBtn.addEventListener("click", closeMenu);
  backdrop && backdrop.addEventListener("click", closeMenu);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Allow user to force desktop (disables desktop->mobile redirect)
  viewDesktop && viewDesktop.addEventListener("click", (e) => {
    e.preventDefault();
    try { localStorage.setItem("sns_force_desktop", "1"); } catch(_){}
    location.href = "/home/";
  });

  // Close drawer after tapping any nav link
  drawer && drawer.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (a && a.getAttribute("href") && a.id !== "viewDesktop") closeMenu();
  });
})();
