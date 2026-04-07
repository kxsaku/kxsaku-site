/* ===== "View Desktop Site" toggle (shared across mobile pages) ===== */
(function(){
  const a = document.getElementById("viewDesktop");
  if (!a) return;
  a.addEventListener("click", function(e){
    e.preventDefault();
    localStorage.setItem("sns_force_desktop", "1");
    // Derive desktop path from current mobile page location
    var path = window.location.pathname;
    // Strip mobile.html or trailing filename to get the directory
    var dir = path.replace(/mobile\.html$/, "").replace(/index\.html$/, "");
    if (!dir.endsWith("/")) dir += "/";
    location.replace(dir);
  });
})();
