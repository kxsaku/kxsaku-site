import React from "react";
import { createRoot } from "react-dom/client";
import RotatingText from "../../home/reactbits/RotatingText.js";

function renderIntoMount(mount) {
  if (!mount) return false;
  if (mount.dataset.rtMounted === "1") return true;
  mount.dataset.rtMounted = "1";

  createRoot(mount).render(
    <RotatingText
      texts={["Reliability", "Security", "Availability", "Affordability"]}
      mainClassName="rt-inline"
      splitLevelClassName="rt-split"
      elementLevelClassName="rt-el"
      staggerFrom={"last"}
      staggerDuration={0.012}
      initial={{ y: "110%", opacity: 0 }}
      animate={{ y: "0%", opacity: 1 }}
      exit={{ y: "-110%", opacity: 0 }}
      transition={{ type: "spring", damping: 34, stiffness: 520, mass: 0.55 }}
      rotationInterval={2400}
    />
  );

  return true;
}

function tryMount() {
  return renderIntoMount(document.getElementById("rt-headline"));
}

function mountWithRetries() {
  // Try now
  if (tryMount()) return;

  // Retry for up to 6 seconds (covers hero being re-rendered by other scripts)
  const start = performance.now();
  const tick = () => {
    if (tryMount()) return;
    if (performance.now() - start < 6000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Also observe hero subtree in case it gets replaced after load
  const hero = document.querySelector(".hero") || document.body;
  const obs = new MutationObserver(() => {
    const el = document.getElementById("rt-headline");
    if (el && el.dataset.rtMounted !== "1") tryMount();
  });
  obs.observe(hero, { childList: true, subtree: true });
}

// Mount after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountWithRetries, { once: true });
} else {
  mountWithRetries();
}
