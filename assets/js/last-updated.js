// Last updated date
(function(){
  var el = document.getElementById("lastUpdated");
  if (!el) return;
  var d = new Date();
  var pad = function(n){ return String(n).padStart(2, "0"); };
  el.textContent = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
})();
