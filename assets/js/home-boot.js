(function(){
  const iframe = document.querySelector(".beams-iframe");
  let domReady = false;
  let bgReady = false;
  let bootDone = false;

  function finishBoot(){
    if (bootDone) return;
    bootDone = true;

    // Fade iframe in, then reveal the page
    document.body.classList.add("bg-ready");

    // Next tick so CSS transitions apply reliably
    setTimeout(() => {
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-ready");

      // init UI behaviors after first paint
      if (typeof initReveal === "function") initReveal();
      if (typeof initParticles === "function") initParticles();
    }, 50);
  }

  function tryBoot(){
    if (domReady && bgReady) finishBoot();
  }

  document.addEventListener("DOMContentLoaded", () => {
    domReady = true;
    tryBoot();
  });

  if (iframe){
    // If it is already loaded (bfcache), load event may not fire
    try {
      if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
        bgReady = true;
        tryBoot();
      }
    } catch(e){ /* ignore */ }

    iframe.addEventListener("load", () => {
      bgReady = true;
      tryBoot();
    }, { once: true });
  } else {
    // No iframe found; don't block page forever
    bgReady = true;
    tryBoot();
  }

  // Hard fallback so you never get stuck on skeleton
  setTimeout(() => finishBoot(), 2500);
})();
