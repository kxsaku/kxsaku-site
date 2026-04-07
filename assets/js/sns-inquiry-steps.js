/* ===== Step Navigation (sns-inquiry desktop) ===== */
let currentStep = 1;

function goStep(n) {
  // Validate before moving forward
  if (n > currentStep) {
    if (!validateStep(currentStep)) return;
  }

  currentStep = n;

  // Panels
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  const target = document.querySelector(`.step-panel[data-panel="${n}"]`);
  if (target) {
    target.classList.remove('active');
    // Force reflow for re-animation
    void target.offsetHeight;
    target.classList.add('active');
  }

  // Progress dots
  document.querySelectorAll('.progress-step').forEach(s => {
    const sn = +s.dataset.step;
    s.classList.remove('active', 'done');
    if (sn < n) s.classList.add('done');
    else if (sn === n) s.classList.add('active');
  });

  // Progress lines
  document.querySelectorAll('.progress-line').forEach(l => {
    const ln = +l.dataset.line;
    l.classList.toggle('filled', ln < n);
  });

  // Scroll to top of card
  document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(step) {
  if (step === 1) {
    const fields = ['contactName', 'businessName', 'email', 'phone', 'location', 'companySize'];
    for (const id of fields) {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        el.focus();
        toast('Missing field', `Please fill in ${el.closest('.field').querySelector('.field-label').textContent.trim()}.`, 'bad');
        return false;
      }
    }
    // Phone validation
    const phoneRaw = document.getElementById('phone').value;
    const digits = phoneRaw.replace(/\D/g, '');
    let d = digits;
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    const fakes = ['0000000000','1111111111','2222222222','3333333333','4444444444','5555555555','6666666666','7777777777','8888888888','9999999999','1234567890'];
    if (d.length !== 10 || fakes.includes(d)) {
      document.getElementById('phone').focus();
      toast('Invalid phone', 'Enter a valid 10-digit US phone number.', 'bad');
      return false;
    }
    // Email validation
    const email = document.getElementById('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('email').focus();
      toast('Invalid email', 'Enter a valid email address.', 'bad');
      return false;
    }
    return true;
  }
  if (step === 2) {
    const checked = document.querySelectorAll('input[name="help_with"]:checked');
    if (!checked.length) {
      toast('Select a service', 'Pick at least one option to continue.', 'bad');
      return false;
    }
    return true;
  }
  return true;
}

// Expose to onclick handlers in HTML
window.goStep = goStep;
window.validateStep = validateStep;
