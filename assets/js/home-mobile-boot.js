// Boot logic (same behavior as desktop home)
(function(){
  const iframe = document.querySelector(".beams-iframe");
  let domReady = false;
  let bgReady = false;
  let bootDone = false;

  function finishBoot(){
    if (bootDone) return;
    bootDone = true;

    document.body.classList.add("bg-ready");

    setTimeout(() => {
      document.body.classList.remove("is-loading");
      document.body.classList.add("is-ready");

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
    bgReady = true;
    tryBoot();
  }

  setTimeout(() => finishBoot(), 2500);
})();
