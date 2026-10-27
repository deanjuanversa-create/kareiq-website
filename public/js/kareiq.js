/* KareIQ main page behaviour: header, scroll animations, live care card, enquiry form */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const nav = $('#nav'), burger = $('#burger'), totop = $('#totop'), bar = $('#progress'), heroImg = $('#heroImg');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- scroll reveal (only content below the fold starts hidden) ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { const t = e.target; t.classList.replace('pre', 'in'); io.unobserve(t); t.addEventListener('animationend', function done(ev) { if (ev.target === t) { t.classList.remove('in'); t.removeEventListener('animationend', done); } }); }
    }), { threshold: 0, rootMargin: '0px 0px 8% 0px' });
    $$('.rv').forEach((el) => { if (el.getBoundingClientRect().top > innerHeight * 0.92) { el.classList.add('pre'); io.observe(el); } });
  }

  /* ---------- header state, progress bar, parallax, back to top ---------- */
  // measurements are cached so scrolling never forces a layout pass
  let ticking = false, maxScroll = 1, scrolled = false, topShown = false, lastBar = -1;
  let heroTop = 0;
  const measure = () => { maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight); const h = heroImg && heroImg.closest('section'); heroTop = h ? h.getBoundingClientRect().top + scrollY : 0; };
  function onScroll() {
    const y = scrollY;
    if (!scrolled && y > 40) { scrolled = true; nav.classList.add('scrolled'); }
    else if (scrolled && y < 8) { scrolled = false; nav.classList.remove('scrolled'); }
    const show = y > 700;
    if (show !== topShown) { topShown = show; totop.classList.toggle('show', show); }
    const pr = Math.min(1, y / maxScroll);
    if (Math.abs(pr - lastBar) > 0.001) { lastBar = pr; bar.style.transform = 'scaleX(' + pr.toFixed(4) + ')'; }
    const rel = Math.max(0, y - heroTop); // the hero is no longer the first section
    if (!reduce && rel < 900 && heroImg.dataset.ready) heroImg.style.transform = 'translate3d(0,' + (rel * 0.18).toFixed(1) + 'px,0) scale(1.04)';
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  let rzT;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { measure(); onScroll(); }, 120); }, { passive: true });
  addEventListener('load', () => { measure(); onScroll(); });
  measure();
  heroImg.addEventListener('animationend', () => { heroImg.style.animation = 'none'; heroImg.dataset.ready = '1'; onScroll(); });
  if (reduce) heroImg.dataset.ready = '1';
  onScroll();

  /* ---------- active menu link ---------- */
  const links = $$('#menu a[href^="#"]');
  const so = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean).forEach((s) => so.observe(s));

  /* ---------- mobile drawer ---------- */
  function setMenu(open) { nav.classList.toggle('open', open); burger.setAttribute('aria-expanded', open); }
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  $$('.drawer a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  totop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  /* ---------- hero care card: cycles through example care updates, links to Kare@home ---------- */
  const fc = $('#fcText');
  const updates = [
    ['Care visit complete', "Amma's wellness check · 10:30 am"],
    ['Vitals recorded', 'BP 128/82 · sugar normal · 11:05 am'],
    ['Medicines taken on time', 'Morning dose confirmed · 11:20 am'],
    ['Family updated', 'Visit summary shared on WhatsApp']
  ];
  if (fc && !reduce) {
    let i = 0;
    setInterval(() => {
      if (document.hidden) return;
      i = (i + 1) % updates.length;
      fc.classList.add('swap');
      setTimeout(() => {
        fc.innerHTML = '<b>' + updates[i][0] + '</b><small><i class="live"></i>' + updates[i][1] + '</small>';
        fc.classList.remove('swap');
      }, 350);
    }, 3800);
  }

  /* (card tilt removed: it rewrote transform on every mousemove and fought the CSS hover transition) */

  /* ---------- enquiry modal ---------- */
  const modal = $('#modal'), form = $('#form'), F = form.elements, fv = $('#formView'), dv = $('#doneView'), submit = $('#fSubmit');
  let last = null;

  function open(e) {
    const trigger = e && e.currentTarget;
    last = trigger;
    setMenu(false);
    Kare.clearErrors(form);
    fv.hidden = false; dv.hidden = true;
    if (trigger && trigger.dataset.interest) F.interest.value = trigger.dataset.interest;
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('open')));
    setTimeout(() => F.name.focus({ preventScroll: true }), 200);
  }
  function close() {
    modal.classList.remove('open');
    document.documentElement.style.overflow = '';
    setTimeout(() => { modal.hidden = true; }, 350);
    if (last && last.focus) last.focus({ preventScroll: true });
  }
  $$('[data-open]').forEach((b) => b.addEventListener('click', open));
  $('#mClose').addEventListener('click', close);
  $('#doneClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  form.addEventListener('input', (e) => {
    const f = e.target.closest('.field');
    if (f && f.classList.contains('has-err')) { f.classList.remove('has-err'); const er = f.querySelector('.err'); if (er) er.textContent = ''; }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    Kare.clearErrors(form);
    const errs = {};
    if (F.name.value.trim().length < 2) errs.name = 'Please enter your name.';
    if (!Kare.phoneOk(F.phone.value)) errs.phone = 'Enter a 10-digit mobile number, e.g. 98765 43210.';
    if (F.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(F.email.value.trim())) errs.email = 'This email address looks incomplete.';
    if (!F.consent.checked) errs.consent = 'Please tick this so we can call you back.';
    if (Object.keys(errs).length) return Kare.showErrors(form, errs);

    const data = Kare.data(form);
    data.source = 'kareiq-home';
    Kare.busy(submit, true, 'Sending…');
    try {
      const res = await Kare.send('/api/enquiries', data);
      $('#doneName').textContent = data.name.split(' ')[0];
      $('#doneRef').textContent = res.reference;
      fv.hidden = true; dv.hidden = false;
      form.reset();
      setTimeout(() => $('#doneClose').focus(), 80);
    } catch (err) {
      if (err.errors) { Kare.showErrors(form, err.errors); Kare.alert(form, err.message); }
      else Kare.alert(form, err.offline ? Kare.offlineMessage() : err.message);
    } finally {
      Kare.busy(submit, false);
    }
  });
})();

/* Team bios: expand / collapse */
document.querySelectorAll('.person .more').forEach((btn) => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.person');
    const open = card.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.textContent = open ? 'Show less' : 'Read full profile';
    setTimeout(function () { dispatchEvent(new Event('resize')); }, 750);
  });
});

/* Pause looping decorations in sections that are off screen */
(function () {
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('offscreen', !e.isIntersecting); });
  }, { rootMargin: '120px 0px' });
  document.querySelectorAll('main > section, footer').forEach(function (s) { io.observe(s); });
})();
