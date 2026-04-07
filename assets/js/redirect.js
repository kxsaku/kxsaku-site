(function () {
  var s = document.currentScript;
  var mobilePath = s.getAttribute("data-mobile-path");
  if (!mobilePath) return;

  // Check force-desktop override
  if (s.getAttribute("data-skip-force-check") !== "true") {
    if (localStorage.getItem("sns_force_desktop") === "1") return;
  }

  // Viewport check
  var bp = parseInt(s.getAttribute("data-breakpoint") || "740", 10);
  var isSmall = window.matchMedia("(max-width: " + bp + "px)").matches;
  if (!isSmall) return;

  // Optional touch check
  if (s.getAttribute("data-check-touch") === "true") {
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) return;
  }

  // Loop detection
  if (mobilePath.charAt(0) === ".") {
    if (location.pathname.endsWith("/mobile.html")) return;
  } else {
    if (location.pathname.endsWith(mobilePath)) return;
  }

  // Redirect
  var search = s.getAttribute("data-preserve-search") === "true" ? location.search : "";
  location.replace(mobilePath + search);
})();
