// Same particle vibe as desktop home, tuned for mobile performance
function initParticles(){
  const c = document.getElementById("particles");
  if (!c) return;

  const hero = c.closest(".hero");
  if (!hero) return;

  const ctx = c.getContext("2d", { alpha: true });
  let w = 0, h = 0;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;

  function rand(min, max){ return Math.random() * (max - min) + min; }

  function resize(){
    const r = hero.getBoundingClientRect();
    w = Math.floor(r.width);
    h = Math.floor(r.height);

    c.width  = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let N = 0;
  const p = [];

  function resetParticle(s){
    // keep the "upper-right drift" look, but safe on narrow screens
    s.x = rand(w * 0.55, w * 0.98);
    s.y = rand(-70, -10);

    s.r = rand(0.7, 1.9);
    s.a = rand(0.14, 0.44);

    s.vx = rand(0.05, 0.20);
    s.vy = rand(0.05, 0.18);

    s.phase = rand(0, Math.PI * 2);
    s.drift = rand(0.18, 0.55);
  }

  function seed(){
    p.length = 0;
    // mobile-friendly density
    N = Math.floor(Math.min(85, Math.max(34, (w * h) / 32000)));
    for (let i = 0; i < N; i++){
      const s = {};
      resetParticle(s);
      s.x = rand(0, w);
      s.y = rand(0, h);
      p.push(s);
    }
  }

  let last = performance.now();

  function tick(now){
    const dt = Math.min(33, now - last);
    last = now;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < p.length; i++){
      const s = p[i];

      s.phase += 0.0016 * dt * s.drift;

      s.x -= s.vx * dt;
      s.y += s.vy * dt;

      s.x += Math.sin(s.phase) * 0.04 * dt;

      if (s.y > h * 0.86 || s.x < w * 0.06){
        resetParticle(s);
      }

      ctx.fillStyle = `rgba(230,220,255,${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  resize();
  seed();
  requestAnimationFrame(tick);

  window.addEventListener("resize", () => {
    resize();
    seed();
  }, { passive: true });
}
