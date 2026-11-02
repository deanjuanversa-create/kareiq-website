/* Kare@Home page behaviour: header, scroll animations, counters, booking flow */
/* links from the old one-page site (/kare-at-home#packages) open the matching page */
(function () {
  if (document.body.dataset.page !== 'home') return;
  var m = { packages: '/packages', why: '#about-us', faq: '/faq' };
  var h = location.hash.slice(1);
  // KareBalance is now on KareWellness, on the KareIQ website
  if (h === 'karebalance' || h === 'kb-plans') return location.replace(((window.KARE_SITES && window.KARE_SITES.kareiq) || '/') + 'karewellness#karebalance');
  if (m[h]) location.replace('/kare-at-home' + m[h]);
})();
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = $('#nav'), burger = $('#burger'), bar = $('#progress'), totop = $('#totop');
  const heroImg = $('#heroImg'), whyImg = $('#whyImg');

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- scroll reveal (only for content below the fold) ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { const t = e.target; t.classList.replace('pre', 'in'); io.unobserve(t); t.addEventListener('animationend', function done(ev) { if (ev.target === t) { t.classList.remove('in'); t.removeEventListener('animationend', done); } }); }
    }), { threshold: 0, rootMargin: '0px 0px 8% 0px' });
    $$('.rv').forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight * 0.9) { el.classList.add('pre'); io.observe(el); }
    });

    // handwritten note on the "why" photo writes itself when it scrolls in
    const whyPhoto = $('.why-photo');
    if (whyPhoto) {
      const wo = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { whyPhoto.classList.add('seen'); wo.disconnect(); }
      }), { threshold: 0.4 });
      wo.observe(whyPhoto);
    }

    // price count-up
    const co = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const el = e.target, end = +el.dataset.count, t0 = performance.now(), dur = 1200;
      const fmt = (n) => n.toLocaleString('en-IN');
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(end * k));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    $$('[data-count]').forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight) co.observe(el);
    });
  } else {
    const whyPhoto = $('.why-photo');
    if (whyPhoto) whyPhoto.classList.add('seen');
  }

  /* ---------- header, progress, parallax ----------
     Page measurements are taken once (and on resize), so scrolling only writes
     transforms and never forces the browser to re-measure the layout. */
  let ticking = false, maxScroll = 1, whyTop = 0, whyH = 0, vh = innerHeight, lastBar = -1, scrolled = false, topShown = false;
  function measure() {
    vh = innerHeight;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    if (whyImg) { const r = whyImg.parentElement.getBoundingClientRect(); whyTop = r.top + scrollY; whyH = r.height; }
  }
  function onScroll() {
    const y = scrollY;
    if (!scrolled && y > 40) { scrolled = true; nav.classList.add('scrolled'); }
    else if (scrolled && y < 8) { scrolled = false; nav.classList.remove('scrolled'); }
    const show = y > 700;
    if (show !== topShown) { topShown = show; totop.classList.toggle('show', show); }
    const pr = Math.min(1, y / maxScroll);
    if (Math.abs(pr - lastBar) > 0.001) { lastBar = pr; bar.style.transform = 'scaleX(' + pr.toFixed(4) + ')'; }
    if (!reduce) {
      if (heroImg && y < 1000 && heroImg.dataset.ready) heroImg.style.transform = 'translate3d(0,' + (y * 0.15).toFixed(1) + 'px,0) scale(1.03)';
      if (whyImg && whyH) {
        const top = whyTop - y;
        if (top + whyH > 0 && top < vh) whyImg.style.transform = 'translate3d(0,' + (((top + whyH / 2 - vh / 2) / vh) * -40).toFixed(1) + 'px,0)';
      }
    }
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  let rzT;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { measure(); onScroll(); }, 120); }, { passive: true });
  addEventListener('load', () => { measure(); onScroll(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); onScroll(); });
  if (heroImg) {
    heroImg.addEventListener('animationend', () => { heroImg.style.animation = 'none'; heroImg.dataset.ready = '1'; onScroll(); });
    if (reduce) heroImg.dataset.ready = '1';
  }
  measure();
  onScroll();

  /* home page: the menu follows the section on screen (About Us, Our Services, Contact) */
  if (document.body.dataset.page === 'home' && 'IntersectionObserver' in window) {
    const menuLinks = $$('#menu a, .drawer a').filter((a) => a.closest('li'));
    const mark = (id) => menuLinks.forEach((a) => {
      const on = id ? a.dataset.section === id : a.getAttribute('href') === '/kare-at-home';
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', id ? 'location' : 'page'); else a.removeAttribute('aria-current');
    });
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) mark(e.target.id === 'about' ? '' : e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    ['about', 'about-us', 'services', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- mobile menu ---------- */
  function setMenu(open) { nav.classList.toggle('open', open); burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); } });
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  $$('.drawer a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  totop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  /* ---------- booking modal ---------- */
  const modal = $('#modal'), form = $('#bookForm'), F = form.elements;
  const panes = $$('.pane', form), stepLabels = $$('.stepper span');
  const back = $('#bBack'), next = $('#bNext'), submit = $('#bSubmit');
  const bookView = $('#bookView'), doneView = $('#doneView');
  let step = 1, lastFocus = null;

  // today in India as the earliest date
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  F.date.min = today;

  function showStep(n) {
    step = n;
    panes.forEach((p) => { p.hidden = +p.dataset.pane !== n; });
    stepLabels.forEach((s) => s.classList.toggle('on', +s.dataset.s <= n));
    $('.stepper b').style.setProperty('--sp', n === 2 ? 1 : 0);
    back.hidden = n === 1;
    next.hidden = n !== 1;
    submit.hidden = n !== 2;
    const first = panes[n - 1].querySelector('input:not([type=radio]):not([type=hidden]), select, textarea');
    if (first && modal.classList.contains('open')) setTimeout(() => first.focus({ preventScroll: true }), 60);
  }

  // KareBalance programmes and Bystander visits have fixed pricing, so the payment plan does not apply
  function kbBilling() {
    if (!F.billing) return;
    const kb = /^(kb|by)-/.test(F.package.value) || F.service.value === 'karebalance' || F.service.value === 'bystander';
    const field = F.billing.closest('.field');
    if (field) field.hidden = kb;
    F.billing.disabled = kb;
  }
  F.package.addEventListener('change', kbBilling);
  F.service.addEventListener('change', kbBilling);

  function openModal(trigger) {
    lastFocus = trigger || document.activeElement;
    setMenu(false);
    Kare.clearErrors(form);
    bookView.hidden = false;
    doneView.hidden = true;
    if (trigger && trigger.dataset.service) F.service.value = trigger.dataset.service;
    if (trigger && trigger.dataset.package) F.package.value = trigger.dataset.package;
    kbBilling();
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('open')));
    showStep(1);
    setTimeout(() => (F.service.value ? F.package : F.service).focus({ preventScroll: true }), 120);
  }

  function closeModal() {
    modal.classList.remove('open');
    document.documentElement.style.overflow = '';
    setTimeout(() => { modal.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  $$('[data-book]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openModal(b); }));
  $('#mClose').addEventListener('click', closeModal);
  $('#doneClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = $$('button:not([hidden]):not([disabled]), a[href], input:not([tabindex="-1"]), select, textarea', modal).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // live-clear an error as soon as the field is edited
  form.addEventListener('input', (e) => {
    const f = e.target.closest('.field');
    if (f && f.classList.contains('has-err')) { f.classList.remove('has-err'); const er = f.querySelector('.err'); if (er) er.textContent = ''; }
  });

  function checkStep1() {
    const errs = {};
    if (!F.service.value) errs.service = 'Choose a service, or "Not sure yet".';
    if (F.date.value && F.date.value < today) errs.date = 'Choose today or a later date.';
    return errs;
  }
  function checkStep2() {
    const errs = {};
    if (F.name.value.trim().length < 2) errs.name = 'Please enter your name.';
    if (!Kare.phoneOk(F.phone.value)) errs.phone = 'Enter a 10-digit mobile number, e.g. 98765 43210.';
    if (F.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(F.email.value.trim())) errs.email = 'This email address looks incomplete.';
    if (F.area.value.trim().length < 2) errs.area = 'Tell us your area and city.';
    if (!F.consent.checked) errs.consent = 'Please tick this so we can call you back.';
    return errs;
  }

  next.addEventListener('click', () => {
    Kare.clearErrors(form);
    const errs = checkStep1();
    if (Object.keys(errs).length) return Kare.showErrors(form, errs);
    showStep(2);
  });
  back.addEventListener('click', () => { Kare.clearErrors(form); showStep(1); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (step === 1) { next.click(); return; }
    Kare.clearErrors(form);
    const errs = checkStep2();
    if (Object.keys(errs).length) return Kare.showErrors(form, errs);

    const data = Kare.data(form);
    Kare.busy(submit, true, 'Sending…');
    try {
      const res = await Kare.send('/api/bookings', data);
      $('#doneName').textContent = data.name.split(' ')[0];
      $('#donePhone').textContent = data.phone;
      $('#doneRef').textContent = res.reference;
      if (window.KareAppStart) $('#doneApp').href = window.KareAppStart(res.reference, 'karehome');
      $('#doneWa').href = Kare.CONTACT.whatsapp + '?text=' + encodeURIComponent('Hi Kare@Home, my booking reference is ' + res.reference + '.');
      bookView.hidden = true;
      doneView.hidden = false;
      form.reset();
      showStep(1);
      setTimeout(() => $('#doneClose').focus(), 80);
    } catch (err) {
      if (err.errors) {
        const s1 = ['service', 'package', 'billing', 'careFor', 'date', 'time'];
        if (Object.keys(err.errors).some((k) => s1.includes(k))) showStep(1);
        Kare.showErrors(form, err.errors);
        Kare.alert(form, err.message);
      } else if (err.offline) {
        Kare.alert(form, Kare.offlineMessage());
      } else {
        Kare.alert(form, err.message);
      }
    } finally {
      Kare.busy(submit, false);
    }
  });
})();

/* ---------- Care packages: payment-plan switch ----------
   Prices, names and "Includes" come from the admin (window.KARE_CONTENT).
   The numbers below are only the fallback when the page is opened without the server.
   Payment plans are 1, 3, 6 and 12 months (Monthly, Quarterly, Semi-Annual, Annual), and the website shows no discounts:
   no struck-through price, no offer tag, no "save x%". */
(window.KareWhenContent || ((fn) => fn()))(function () {
  const C = window.KARE_CONTENT && window.KARE_CONTENT.pricing;
  const PRICES = {
    homestart: { 1: [4499, 4499], 3: [4139, 12419], 6: [4049, 24299], 12: [3958, 47499] },
    homeplus:  { 1: [6499, 6499], 3: [5979, 17939], 6: [5833, 34999], 12: [5719, 68629] },
    homeelite: { 1: [11999, 11999], 3: [11039, 33119], 6: [10798, 64789], 12: [10558, 126699] }
  };
  const PLAN_MONTHS = [1, 3, 6, 12];
  if (C) C.packages.forEach((p) => { PRICES[p.key] = p.prices; });
  const BILLED = { 1: 'billed monthly', 3: 'billed quarterly', 6: 'billed semi-annually', 12: 'billed annually' };
  const saveText = () => 'Choose the payment plan that suits you.';
  const fmt = (n) => Number(n).toLocaleString('en-IN');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const box = document.querySelector('.billing');
  if (!box) return;
  const btns = [...box.querySelectorAll('button')];
  const pill = box.querySelector('.pill');
  const save = document.getElementById('saveMsg');
  let months = 1;

  // ---- render admin content into the three package cards
  if (C) {
    const tick = '<svg class="chk" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    C.packages.forEach((p) => {
      const card = document.querySelector(`.pk[data-plan="${p.key}"]`);
      if (!card) return;
      card.querySelector('h3').textContent = p.name;
      const btn = card.querySelector('[data-book],[data-auth]');
      btn.setAttribute('aria-label', 'Choose ' + p.name);
      btn.firstChild.textContent = 'Choose ' + p.name + ' ';
      card.classList.toggle('popular', !!p.popular);
      let badge = card.querySelector('.badge');
      if (p.popular && !badge) { badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'Most Popular'; card.prepend(badge); }
      if (!p.popular && badge) badge.remove();
      btn.classList.toggle('btn-grad', !!p.popular);
      btn.classList.toggle('btn-outline', !p.popular);
      const ul = card.querySelector('.inc');
      ul.innerHTML = '';
      p.includes.filter((line) => !/discount on (all )?add-on/i.test(line)).forEach((line) => {
        const li = document.createElement('li');
        li.innerHTML = tick;
        const span = document.createElement('span');
        span.textContent = line;
        li.appendChild(span);
        ul.appendChild(li);
      });
    });
    // booking form package labels: "from ₹x / month"
    const sel = document.getElementById('b-package');
    C.packages.forEach((p) => {
      const opt = sel && sel.querySelector(`option[value="${p.key}"]`);
      if (opt) opt.textContent = `${p.name} · from ₹${fmt(Math.min(...PLAN_MONTHS.map((m) => p.prices[m][0])))} / month`;
    });
  }

  function movePill(btn) {
    if (!btn) return;
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }

  function tween(el, to) {
    const from = +String(el.textContent).replace(/\D/g, '') || to;
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 550;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * k));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function apply(m, animate = true) {
    months = m;
    btns.forEach((b) => { const on = +b.dataset.months === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); if (on) movePill(b); });
    save.textContent = saveText(m);
    document.querySelectorAll('.pk[data-plan]').forEach((card) => {
      const p = PRICES[card.dataset.plan];
      if (!p) return;
      const [perMonth, total] = p[m];
      const num = card.querySelector('[data-price]');
      if (animate) tween(num, perMonth); else num.textContent = fmt(perMonth);
      const billed = card.querySelector('[data-billed]');
      if (animate) { billed.classList.remove('flash'); void billed.offsetWidth; billed.classList.add('flash'); }
      billed.textContent = '₹' + fmt(total) + ' ' + BILLED[m];
    });
    const sel = document.getElementById('b-billing');
    if (sel) sel.value = String(m);
  }

  btns.forEach((b) => b.addEventListener('click', () => apply(+b.dataset.months)));
  box.addEventListener('keydown', (e) => {
    const i = btns.findIndex((b) => +b.dataset.months === months);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      n.focus(); apply(+n.dataset.months);
    }
  });
  addEventListener('resize', () => movePill(btns.find((b) => b.classList.contains('on'))));
  document.querySelectorAll('.pk [data-book]').forEach((b) => b.addEventListener('click', () => {
    const sel = document.getElementById('b-billing');
    if (sel) setTimeout(() => { sel.value = String(months); }, 0);
  }));
  apply(1, false);
  requestAnimationFrame(() => movePill(btns[0]));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(btns.find((b) => b.classList.contains('on'))));
});

/* Pause looping decorations in sections that are off screen */
(function () {
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('offscreen', !e.isIntersecting); });
  }, { rootMargin: '120px 0px' });
  document.querySelectorAll('main > section, footer').forEach(function (s) { io.observe(s); });
})();

/* The package the visitor picked stands out among the package cards (Care Packages, KareBalance):
   from a link (?pkg=homeplus), a click on a card, or the package chosen in the booking form. */
(function () {
  var cards = [].slice.call(document.querySelectorAll('article[data-plan]'));
  if (!cards.length) return;
  function mark(id) {
    if (!id || !cards.some(function (c) { return c.dataset.plan === id; })) return;
    cards.forEach(function (c) { c.classList.toggle('sel', c.dataset.plan === id); });
  }
  try { mark(new URLSearchParams(location.search).get('pkg')); } catch (e) { /* old browser */ }
  document.addEventListener('click', function (e) { var c = e.target.closest && e.target.closest('article[data-plan]'); if (c) mark(c.dataset.plan); });
  document.addEventListener('change', function (e) { if (e.target.name === 'package') mark(e.target.value); });
})();
