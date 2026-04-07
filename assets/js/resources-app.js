// Reveal-on-scroll (same behavior as your Experience page)
(function(){
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window) || els.length === 0) {
    els.forEach(el => el.classList.add('on'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('on');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
})();

// Footer year + last updated
document.getElementById("year").textContent = new Date().getFullYear();
const d = new Date();
const pad = (n)=> String(n).padStart(2,"0");
document.getElementById("lastUpdated").textContent =
  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
