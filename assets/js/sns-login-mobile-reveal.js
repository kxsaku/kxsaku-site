// Reveal-on-scroll (same behavior as other mobile pages)
(function(){
  const els = Array.from(document.querySelectorAll('.reveal'));
  if (!('IntersectionObserver' in window) || els.length === 0) {
    els.forEach(el => el.classList.add('on'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('on');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.14 });
  els.forEach(el => io.observe(el));
})();
