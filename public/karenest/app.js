/* KareNest website behaviour, shared by every page.
   Each part checks that its elements exist, so a page only runs what it contains.
   Scrolling: one passive listener, throttled to one update per animation frame, that only
   writes a transform (no layout reads apart from scrollY; the page height is cached). */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  root.classList.add('js');
  const BASE = document.body.dataset.base || '';
  const PAGE = document.body.dataset.page || '';
  const url = (p) => BASE + p;
  const api = () => window.KARE_API || '';
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = () => reduceMQ.matches || root.classList.contains('calm');
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const smooth = () => (reduce() ? 'auto' : 'smooth');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  /* ================= scroll progress + header ================= */
  const nav = $('#nav'), prog = $('#progress');
  let maxScroll = 1, ticking = false, lastY = -1;
  const scrollHooks = [];
  function measure() { maxScroll = Math.max(1, root.scrollHeight - innerHeight); lastY = -1; requestFrame(); }
  function frame() {
    ticking = false;
    const y = window.scrollY;
    if (y === lastY) return;
    lastY = y;
    if (prog) prog.style.transform = 'scaleX(' + Math.min(1, y / maxScroll).toFixed(4) + ')';
    for (const f of scrollHooks) f(y);
  }
  function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  addEventListener('scroll', requestFrame, { passive: true });
  addEventListener('resize', measure, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
  addEventListener('load', measure);
  // header shadow: an observer on a 40px marker at the top of the page, no scroll maths
  if (nav && 'IntersectionObserver' in window) {
    const mark = document.createElement('div');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:60px;pointer-events:none;visibility:hidden';
    document.body.prepend(mark);
    new IntersectionObserver(([e]) => nav.classList.toggle('scrolled', !e.isIntersecting)).observe(mark);
  }

  /* ================= desktop dropdowns =================
     Works with hover (with a short close delay so the pointer can travel to the submenu),
     click/tap, and the keyboard (Enter/Space, arrows, Home/End, Escape). */
  const dds = $$('.has-dd');
  function setDD(li, open) {
    li.classList.toggle('open', open);
    const b = $('.dd-btn', li);
    if (b) b.setAttribute('aria-expanded', String(open));
    if (!open) $$('.has-dd2', li).forEach((s) => setDD2(s, false));
  }
  function setDD2(li, open) {
    if (open) {
      li.classList.remove('flip');
      const r = li.getBoundingClientRect();
      if (r.right + 290 > document.documentElement.clientWidth) li.classList.add('flip');
    }
    li.classList.toggle('open', open);
    const b = $('.dd2-btn', li);
    if (b) b.setAttribute('aria-expanded', String(open));
  }
  const closeAll = (except) => dds.forEach((d) => { if (d !== except && d.classList.contains('open')) setDD(d, false); });
  dds.forEach((li) => {
    const btn = $('.dd-btn', li), menu = $('.dd', li);
    let t;
    const items = () => $$('a,button', menu).filter((el) => !el.closest('.dd2') || el.closest('.has-dd2').classList.contains('open'));
    let hoverAt = 0;
    btn.addEventListener('click', () => {
      // a mouse that just opened the menu by hovering should not close it again with the same click
      if (li.classList.contains('open') && Date.now() - hoverAt < 700) return;
      const o = !li.classList.contains('open'); closeAll(li); setDD(li, o);
    });
    li.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); if (!li.classList.contains('open')) hoverAt = Date.now(); closeAll(li); setDD(li, true); });
    li.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(() => setDD(li, false), 300); });
    li.addEventListener('keydown', (e) => {
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); setDD(li, false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (!li.classList.contains('open')) setDD(li, true); const l = items(); (l[i + 1] || l[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!li.classList.contains('open')) setDD(li, true); const l = items(); (i > 0 ? l[i - 1] : l[l.length - 1]).focus(); }
      else if ((e.key === 'Home' || e.key === 'End') && li.classList.contains('open') && i > -1) { e.preventDefault(); const l = items(); (e.key === 'Home' ? l[0] : l[l.length - 1]).focus(); }
    });
    li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget)) setDD(li, false); });
    $$('.has-dd2', li).forEach((sub) => {
      const b2 = $('.dd2-btn', sub);
      let t2;
      let hoverAt2 = 0;
      b2.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sub.classList.contains('open') && Date.now() - hoverAt2 < 700) return;
        const o = !sub.classList.contains('open');
        setDD2(sub, o);
        if (o && e.detail === 0) { const first = $('.dd2 a', sub); if (first) first.focus(); } // keyboard "click"
      });
      sub.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t2); if (!sub.classList.contains('open')) hoverAt2 = Date.now(); setDD2(sub, true); });
      sub.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(t2); t2 = setTimeout(() => setDD2(sub, false), 300); });
      sub.addEventListener('keydown', (e) => {
        const inNested = e.target.closest('.dd2');
        if (e.key === 'ArrowRight' && !inNested) { e.preventDefault(); e.stopPropagation(); setDD2(sub, true); const f = $('.dd2 a', sub); if (f) f.focus(); }
        else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && inNested) { e.preventDefault(); e.stopPropagation(); setDD2(sub, false); b2.focus(); }
      });
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.has-dd')) closeAll(); });

  /* ================= mobile / tablet menu ================= */
  const burger = $('#burger'), drawer = $('#drawer');
  function setMenu(o) {
    document.body.classList.toggle('menu-open', o);
    burger.setAttribute('aria-expanded', String(o));
    burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
    document.body.style.overflow = o ? 'hidden' : '';
    if (o) {
      root.style.setProperty('--hdr', Math.round(nav.getBoundingClientRect().bottom) + 'px');
      setTimeout(() => { const f = $('a,button', drawer); if (f) f.focus({ preventScroll: true }); }, 60);
    }
  }
  if (burger && drawer) {
    burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    drawer.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    $$('.acc-btn', drawer).forEach((b) => b.addEventListener('click', () => {
      const o = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(o));
      const p = document.getElementById(b.getAttribute('aria-controls'));
      if (p) p.hidden = !o;
    }));
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('menu-open')) return;
      if (e.key === 'Escape') { setMenu(false); burger.focus(); return; }
      if (e.key !== 'Tab') return;
      // keep focus inside the open menu (and on the close button)
      const f = [burger].concat($$('a,button', drawer).filter((el) => el.offsetParent !== null));
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    matchMedia('(min-width:1220px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });
  }

  /* ================= reveal on scroll ================= */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });
    $$('.rv,.rv-img').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight * 0.95) el.classList.add('in'); else io.observe(el); });
  } else $$('.rv,.rv-img').forEach((el) => el.classList.add('in'));

  /* ================= tilt + magnetic buttons (mouse only) ================= */
  if (fine && !reduce()) {
    $$('.tilt').forEach((c) => {
      let raf = 0, ev = null;
      c.addEventListener('pointermove', (e) => { ev = e; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height; c.style.transform = 'perspective(900px) rotateX(' + ((0.5 - y) * 8) + 'deg) rotateY(' + ((x - 0.5) * 10) + 'deg) translateY(-6px)'; }); });
      c.addEventListener('pointerleave', () => { c.style.transform = ''; });
    });
    $$('.mag').forEach((b) => {
      b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.setProperty('--bx', (e.clientX - r.left - r.width / 2) * 0.16 + 'px'); b.style.setProperty('--by', (e.clientY - r.top - r.height / 2) * 0.3 + 'px'); });
      b.addEventListener('pointerleave', () => { b.style.setProperty('--bx', '0px'); b.style.setProperty('--by', '0px'); });
    });
  }

  /* ================= little celebration ================= */
  const PCOL = ['#12917A', '#7A4CBF', '#D6568C', '#2E8FB5', '#E2A43A'];
  function burst(x, y, n) {
    if (reduce() || !document.body.animate) return;
    for (let i = 0; i < (n || 14); i++) {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.classList.add('particle');
      s.innerHTML = i % 3 ? '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="' + PCOL[i % 5] + '"/>' : '<path d="M4 20C4 9 10 4 20 3c0 10-6 17-16 17z" fill="' + PCOL[i % 5] + '"/>';
      document.body.appendChild(s);
      const a = Math.random() * Math.PI - Math.PI, d = 60 + Math.random() * 90, sz = 0.6 + Math.random() * 0.8;
      s.animate([
        { transform: 'translate(' + (x - 8) + 'px,' + (y - 8) + 'px) scale(0)', opacity: 1 },
        { transform: 'translate(' + (x - 8 + Math.cos(a) * d) + 'px,' + (y - 8 + Math.sin(a) * d) + 'px) scale(' + sz + ') rotate(' + (Math.random() * 120 - 60) + 'deg)', opacity: 1, offset: 0.6 },
        { transform: 'translate(' + (x - 8 + Math.cos(a) * d * 1.1) + 'px,' + (y + 40 + Math.sin(a) * d) + 'px) scale(' + sz * 0.8 + ')', opacity: 0 }
      ], { duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
    }
  }

  /* ================= Plan a Visit dialog ================= */
  const dlg = $('#dlg');
  function openVisit() {
    if (!dlg) { location.href = url('/contact') + '?type=karenest-visit#enquiry'; return; }
    const form = $('#visitForm');
    showForm(form);
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    setTimeout(() => { const n = $('#fName'); if (n) n.focus(); }, 60);
  }
  const closeVisit = () => { if (!dlg) return; if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
  if (dlg) {
    $('#dlgX').addEventListener('click', closeVisit);
    $('#doneClose').addEventListener('click', closeVisit);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeVisit(); });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    if (t.dataset.open === 'visit') { e.preventDefault(); openVisit(); }
    else if (t.dataset.open === 'join' && PAGE === 'community') { const f = $('#join form'); if (f) { e.preventDefault(); showForm(f); $('#join').scrollIntoView({ behavior: smooth() }); setTimeout(() => f.elements.name.focus({ preventScroll: true }), reduce() ? 0 : 600); } }
  });

  /* ================= enquiry buttons on package cards ================= */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-enquire]');
    if (!a) return;
    const form = $$('form[data-enquiry]').find((f) => f.id !== 'visitForm');
    if (!form) return; // no form on this page: follow the link to the package page
    e.preventDefault();
    const sel = form.elements.plan, id = a.dataset.enquire;
    if (sel && id && Array.from(sel.options).some((o) => o.value === id)) sel.value = id;
    showForm(form);
    const sec = form.closest('section') || form;
    sec.scrollIntoView({ behavior: smooth(), block: 'start' });
    setTimeout(() => form.elements.name.focus({ preventScroll: true }), reduce() ? 0 : 650);
  });

  /* ================= forms (all enquiries go to the KareIQ server) ================= */
  function showForm(form) {
    if (!form) return;
    const done = doneOf(form);
    form.hidden = false;
    if (done) done.hidden = true;
    const wrap = form.closest('#dlgForm');
    if (wrap) wrap.hidden = false;
    const fe = $('[data-err="form"]', form); if (fe) fe.textContent = '';
  }
  function doneOf(form) { return form.id === 'visitForm' ? $('#dlgDone') : form.parentElement.querySelector('.cdone'); }
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDate = (v) => new Date(v + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  $$('form[data-enquiry]').forEach((form) => {
    const fld = (n) => form.elements[n];
    const slot = (n) => $('[data-err="' + n + '"]', form);
    function mark(n, msg) {
      const s = slot(n), el = fld(n);
      if (s) s.textContent = msg || '';
      if (el && el.setAttribute) { if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    }
    ['name', 'phone', 'type'].forEach((n) => { const el = fld(n); if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => mark(n, '')); });
    $$('input[type=date]', form).forEach((d) => { d.min = today; });

    // the Contact page can be opened with an enquiry type already chosen: /contact?type=karenest-live
    if (form.id === 'contactForm') {
      const want = new URLSearchParams(location.search).get('type');
      const sel = fld('type');
      if (want && sel && Array.from(sel.options).some((o) => o.value === want && !o.disabled)) sel.value = want;
    }

    const btn = $('button[type=submit]', form);
    const label = btn.innerHTML;
    const busy = (on) => { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); btn.innerHTML = on ? '<span class="spin" aria-hidden="true"></span>Sending…' : label; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      mark('form', '');
      const name = fld('name').value.trim(), phone = fld('phone').value.trim(), digits = phone.replace(/\D/g, '');
      const typeSel = fld('type'), planSel = fld('plan');
      const okPhone = digits.length === 10 || (digits.length === 12 && digits.startsWith('91')) || (digits.length === 11 && digits.startsWith('0'));
      let bad = null;
      if (name.length < 2) { mark('name', 'Please enter your name.'); bad = bad || 'name'; }
      if (!okPhone) { mark('phone', 'Please enter a 10-digit mobile number.'); bad = bad || 'phone'; }
      if (typeSel && !typeSel.value) { mark('type', 'Please choose what your enquiry is about.'); bad = bad || 'type'; }
      if (bad) { fld(bad).focus(); return; }

      const opt = planSel && planSel.selectedOptions[0];
      const plan = planSel ? planSel.value : '';
      const interest = (typeSel && typeSel.value) || (opt && plan && opt.dataset.interest) || form.dataset.interest || 'karenest-general';
      const planName = plan && opt ? opt.textContent.split(' · ')[0] : '';
      const what = typeSel ? typeSel.selectedOptions[0].textContent : (planName || form.dataset.what || 'enquiry');
      const extras = $$('[data-msg]', form).filter((el) => el.value).map((el) => el.dataset.msg + ': ' + (el.type === 'date' ? fmtDate(el.value) : el.value));
      const note = fld('note') ? fld('note').value.trim() : '';
      const message = ['Page: ' + location.pathname, planName ? 'Package: ' + planName : '', ...extras, note ? 'Note: ' + note : ''].filter(Boolean).join(' | ');

      busy(true);
      let out = {}, res;
      try {
        res = await fetch(api() + '/api/enquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, interest, plan, message, source: 'karenest', consent: true, website: fld('website') ? fld('website').value : '' })
        });
        out = await res.json().catch(() => ({}));
      } catch (err) {
        busy(false);
        mark('form', 'We could not reach our team just now. Please check your internet and try again, or email hello@karenest.in.');
        return;
      }
      busy(false);
      if (!res.ok || !out.ok) {
        const er = out.errors || {};
        if (er.name) mark('name', er.name);
        if (er.phone) mark('phone', er.phone);
        if (er.interest && typeSel) mark('type', er.interest);
        if (!er.name && !er.phone && !(er.interest && typeSel)) mark('form', out.message || 'Sorry, we could not send that. Please try again.');
        const first = ['name', 'phone', 'type'].find((n) => er[n]);
        if (first && fld(first)) fld(first).focus();
        return;
      }
      const ref = out.reference && !/RECEIVED/.test(out.reference) ? out.reference : '';
      const first = name.split(' ')[0];
      const done = doneOf(form);
      const msg = $('[data-done-msg]', done);
      if (form.id === 'visitForm') {
        const dv = fld('date') && fld('date').value;
        msg.textContent = 'Thank you, ' + first + ". We've noted your interest in a day visit for " + (dv ? fmtDate(dv) : 'a day that suits you') + '. Our team will call to confirm.' + (ref ? ' Your reference: ' + ref + '.' : '');
      } else {
        msg.textContent = 'Thank you, ' + first + ". We've got your " + what + ' enquiry and will call you on ' + phone + ' soon.' + (ref ? ' Your reference: ' + ref + '.' : '');
      }
      const app = $('[data-done-app]', done);
      if (app) { if (ref && window.KareAppStart) { app.href = window.KareAppStart(ref, 'karenest'); app.hidden = false; } else app.hidden = true; }
      form.reset();
      if (form.id === 'contactForm') { /* keep the chosen type after a reset */ }
      form.hidden = true;
      const wrap = form.closest('#dlgForm'); if (wrap) wrap.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: false });
      const r = done.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + 70, 18);
    });
    const done = doneOf(form);
    const again = done && $('[data-again]', done);
    if (again) again.addEventListener('click', () => { showForm(form); fld('name').focus(); });
  });

  // on phones, tuck the corner buttons away while someone is typing in a form
  const small = matchMedia('(max-width:760px)');
  document.addEventListener('focusin', (e) => { if (small.matches && e.target.matches('main input,main select,main textarea,dialog input,dialog select')) document.body.classList.add('typing-form'); });
  document.addEventListener('focusout', (e) => { if (e.target.matches('input,select,textarea')) setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input,select,textarea')) document.body.classList.remove('typing-form'); }, 50); });

  /* ================= reading comfort ================= */
  const cBtn = $('#cBtn'), cPanel = $('#cPanel');
  function setComfort(o) { if (!cPanel) return; cPanel.classList.toggle('hide', !o); cBtn.setAttribute('aria-expanded', String(o)); if (o) setG(false); else $('#comfort').classList.remove('keep'); }
  if (cBtn && cPanel) {
    const setFs = (v) => { root.style.fontSize = (100 * v) + '%'; $$('#fsSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fs === String(v)))); store.set('kn-fs', v); measure(); };
    const setTog = (btn, on, apply, key) => { btn.setAttribute('aria-pressed', String(on)); apply(on); store.set(key, on ? '1' : '0'); };
    const applyContrast = (on) => (on ? root.setAttribute('data-contrast', 'high') : root.removeAttribute('data-contrast'));
    const applyCalm = (on) => root.classList.toggle('calm', on);
    cBtn.addEventListener('click', () => setComfort(cPanel.classList.contains('hide')));
    $$('#fsSeg button').forEach((b) => b.addEventListener('click', () => setFs(Number(b.dataset.fs))));
    $('#tgContrast').addEventListener('click', (e) => setTog(e.currentTarget, e.currentTarget.getAttribute('aria-pressed') !== 'true', applyContrast, 'kn-ct'));
    $('#tgCalm').addEventListener('click', (e) => setTog(e.currentTarget, e.currentTarget.getAttribute('aria-pressed') !== 'true', applyCalm, 'kn-calm'));
    if (store.get('kn-fs')) setFs(Number(store.get('kn-fs')));
    if (store.get('kn-ct') === '1') setTog($('#tgContrast'), true, applyContrast, 'kn-ct');
    if (store.get('kn-calm') === '1') setTog($('#tgCalm'), true, applyCalm, 'kn-calm');
    document.addEventListener('click', (e) => { if (!e.target.closest('#comfort') && !cPanel.classList.contains('hide')) setComfort(false); });
    cPanel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setComfort(false); cBtn.focus(); } });
  }

  /* ================= Nestu: the floating guide ================= */
  const guide = $('#guide'), gBtn = $('#gBtn'), gPanel = $('#gPanel'), gTease = $('#gTease'), gMsgs = $('#gMsgs');
  let gOpen = false, ctaVisible = false;
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning!' : hr < 17 ? 'Good afternoon!' : 'Good evening!';
  const CTX = {
    home: 'Three ways to be part of KareNest: live with us, visit and take part, or join a wellness programme.',
    about: 'Health, dignity and happiness guide everything we do here.',
    life: "We're open Monday to Saturday, 9:30 AM to 6:00 PM. Tap a time to see what's on.",
    activities: 'Six kinds of activities, Monday to Saturday. Yoga at 10:00 AM is a favourite!',
    packages: 'Every package and price is on this page. Tap one to see what it includes.',
    live: 'KarePlus is shared living, KarePremium is a private room. Both include meals and a check-up plan.',
    visit: 'Bloom is one day, Flourish is a week and Thrive is a month. All-inclusive!',
    wellness: 'KareBalance is for steadier steps, KareMind is for emotional wellbeing.',
    karebalance: 'Not sure which KareBalance programme? Our team can help you choose.',
    karemind: 'KareMind Base is the recommended starting program.',
    families: 'Families can sign in to My KareIQ to see visits, readings and their plan.',
    community: 'Join the community for invites, updates and a whole lot of friendship.',
    contact: 'Leave your name and number and our team will call you back.',
    signin: 'Families and caregivers can sign in here. New? Create an account.'
  };
  function setG(o) {
    if (!gPanel) return;
    gOpen = o;
    gPanel.classList.toggle('hide', !o);
    gBtn.setAttribute('aria-expanded', String(o));
    gTease.classList.add('hide');
    const dot = $('#gDot'); if (dot) dot.hidden = true;
    if (o) {
      setComfort(false);
      if (!gMsgs.children.length) { addMsg(greet + " I'm Nestu, your KareNest guide."); setTimeout(() => addMsg(CTX[PAGE] || CTX[document.body.dataset.page] || CTX.packages), 400); }
    }
    if (!o) guide.classList.remove('keep');
    guideVis();
  }
  function addMsg(t, me) { const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.textContent = t; gMsgs.appendChild(d); gMsgs.scrollTop = gMsgs.scrollHeight; }
  let guideReady = false;
  function guideVis() { if (guide) guide.classList.toggle('show', guideReady && (!ctaVisible || gOpen)); }
  if (guide) {
    setTimeout(() => {
      guideReady = true; guideVis();
      if (!sess.get('kn-teased') && !matchMedia('(max-width:760px)').matches) { sess.set('kn-teased', '1'); setTimeout(() => { if (!gOpen && !ctaVisible) gTease.classList.remove('hide'); setTimeout(() => gTease.classList.add('hide'), 7000); }, 1500); }
    }, 1200);
    gBtn.addEventListener('click', () => setG(!gOpen));
    gTease.addEventListener('click', () => setG(true));
    $('#gClose').addEventListener('click', () => { setG(false); gBtn.focus(); });
    gPanel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setG(false); gBtn.focus(); } });
    const REPLY = { visit: 'Lovely! Opening the visit form for you.', packages: 'Here are all our packages.', activities: 'Taking you to our activities.', events: "Here's what's coming up next.", families: "Here's how we keep families connected.", join: "Wonderful! Let's get you on the list.", contact: "Let's get you talking to our team." };
    $('#gQuick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      addMsg(b.textContent, true);
      setTimeout(() => { addMsg(REPLY[b.dataset.q]); setTimeout(() => { setG(false); act(b.dataset.q); }, 650); }, 350);
    });
    document.addEventListener('pointerdown', (e) => { if (gOpen && !e.target.closest('#guide')) setG(false); });
  }
  const DEST = { packages: '/packages', activities: '/activities', events: '/life#events', families: '/families', join: '/community#join', contact: '/contact#enquiry', live: '/live-with-us', top: '/' };
  function act(q) {
    if (q === 'visit') { openVisit(); return; }
    const d = DEST[q]; if (!d) return;
    const [p, h] = d.split('#');
    const here = location.pathname.replace(/\/$/, '') === url(p).replace(/\/$/, '') || (p === '/' && PAGE === 'home');
    if (here && h && document.getElementById(h)) document.getElementById(h).scrollIntoView({ behavior: smooth() });
    else location.href = url(p) + (h ? '#' + h : '');
  }

  /* ================= footer: corner buttons step aside ================= */
  const footer = $('footer'), comfortBox = $('#comfort');
  if (footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => document.body.classList.toggle('at-footer', e.isIntersecting), { rootMargin: '0px 0px -40px 0px' }).observe(footer);
  }
  $$('[data-tool]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.dataset.tool === 'comfort' && comfortBox) { comfortBox.classList.add('keep'); setComfort(true); }
    if (b.dataset.tool === 'nestu' && guide) { guideReady = true; guide.classList.add('keep'); setG(true); }
  }));

    /* ================= home: Nestu in the "Find Your Place" band ================= */
  const buddy = $('#buddy'), bubble = $('#bubble'), band = $('#ctaBand'), bodyEl = $('#buddyBody');
  if (buddy && bubble && band) {
    const lines = [
      { t: greet + " I'm Nestu, your KareNest guide.", s: 'Come and spend a morning with us. Share a meal, join a class, meet the family.', a: [['Plan a visit', 'visit'], ['Say hi again', 'next']] },
      { t: 'Psst, did you know?', s: "We're open Monday to Saturday, 9:30 AM to 6:00 PM. Yoga starts at 10:00 AM and the walking club heads out at 5:30 PM.", a: [['See activities', 'activities'], ['Tell me more', 'next']] },
      { t: 'Find your place', s: 'Shared living, your own room, or a visitor pass for a day, a week or a month.', a: [['Our packages', 'packages'], ['Next', 'next']] },
      { t: 'For families', s: 'You get regular updates, so you always know your loved ones are safe, healthy and happy.', a: [['How it works', 'families'], ['Next', 'next']] },
      { t: 'Be part of it', s: 'Join our community for invites, updates and a whole lot of friendship.', a: [['Join the community', 'join'], ['Start over', 'next']] }
    ];
    let li = -1, bubbleTimer;
    const play = (cls) => { buddy.classList.remove(cls); void buddy.offsetWidth; buddy.classList.add(cls); setTimeout(() => buddy.classList.remove(cls), 1300); };
    function say() {
      li = (li + 1) % lines.length; const L = lines[li];
      bubble.classList.remove('hide');
      bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
      setTimeout(() => {
        bubble.innerHTML = '<b>' + L.t + '</b>' + L.s + '<div class="acts-row">' + L.a.map((a) => '<button type="button" class="pill" data-q="' + a[1] + '">' + a[0] + '</button>').join('') + '</div><button type="button" class="speak" data-speak><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>Read aloud</button><div class="hint">Tap me for more</div>';
      }, reduce() ? 0 : 650);
      clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.add('hide'), 14000);
    }
    buddy.addEventListener('click', () => { play('hop'); buddy.classList.add('happy'); setTimeout(() => buddy.classList.remove('happy'), 700); const r = buddy.getBoundingClientRect(); burst(r.left + r.width * 0.3, r.top + r.height * 0.25, 16); say(); });
    buddy.addEventListener('pointerenter', () => { if (!reduce()) play('wave'); });
    bubble.addEventListener('click', (e) => {
      if (e.target.closest('[data-speak]')) { try { const L = lines[li]; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(L.t + ' ' + L.s); u.lang = 'en-IN'; u.pitch = 1.25; u.rate = 0.95; speechSynthesis.speak(u); play('wave'); } catch (err) { /* no speech */ } return; }
      const q = e.target.closest('[data-q]'); if (!q) return;
      if (q.dataset.q === 'next') { play('hop'); say(); } else act(q.dataset.q);
    });
    if (fine && !reduce()) {
      let raf = 0, x = 0;
      band.addEventListener('pointermove', (e) => { x = e.clientX; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = buddy.getBoundingClientRect(); const dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 500)); bodyEl.style.transform = 'perspective(800px) rotateY(' + (dx * 14) + 'deg) rotate(' + (dx * 3) + 'deg)'; }); });
      band.addEventListener('pointerleave', () => { bodyEl.style.transform = ''; });
    }
    let greeted = false;
    new IntersectionObserver((es) => es.forEach((e) => {
      ctaVisible = e.isIntersecting; guideVis();
      if (e.isIntersecting && !greeted) { greeted = true; if (!reduce()) { buddy.classList.add('enter'); setTimeout(() => buddy.classList.remove('enter'), 1200); } setTimeout(() => { play('wave'); say(); }, 900); }
    }), { threshold: 0.45 }).observe(band);
    if (!reduce()) setInterval(() => { if (ctaVisible && !document.hidden && !root.classList.contains('calm') && Math.random() < 0.5) play('wave'); }, 7000);
  }

  /* ================= Life: upcoming events ================= */
  const evsEl = $('#evs');
  if (evsEl) {
    const evs = [
      { n: 'Senior Yoga Workshop', d: '2026-10-28T10:00:00+05:30', t: '10:00 AM – 11:30 AM', p: 'KareNest Community Hall', i: 'e1' },
      { n: 'Kerala Piravi Celebration', d: '2026-10-31T16:00:00+05:30', t: '4:00 PM – 6:00 PM', p: 'Community Lawn', i: 'e2' },
      { n: 'Guest Lecture: Healthy Ageing', d: '2026-11-14T10:00:00+05:30', t: '10:00 AM – 12:30 PM', p: 'Learning Centre', i: 'e3' }
    ];
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    evsEl.innerHTML = evs.map((e) => '<article class="ev"><div class="ev-img"><div class="ph"><img loading="lazy" src="' + url('/images/' + e.i + '.webp') + '" alt=""></div><div class="date"><b>' + Number(e.d.slice(8, 10)) + '</b><small>' + mo[Number(e.d.slice(5, 7)) - 1] + '</small></div></div><div class="ev-body"><h3 class="h4">' + e.n + '</h3><span class="m"><svg class="ico" aria-hidden="true"><use href="#clk"/></svg>' + e.t + '</span><span class="m"><svg class="ico" aria-hidden="true"><use href="#pin"/></svg>' + e.p + '</span></div></article>').join('');
    const upcoming = evs.filter((e) => new Date(e.d) > Date.now());
    if (!upcoming.length) $('#next').hidden = true;
    else {
      const T = new Date(upcoming[0].d).getTime(); $('#nextName').textContent = upcoming[0].n;
      const p = (v) => String(v).padStart(2, '0');
      const tick = () => { const s = Math.max(0, Math.floor((T - Date.now()) / 1000)); $('#cdD').textContent = p(Math.floor(s / 86400)); $('#cdH').textContent = p(Math.floor(s % 86400 / 3600)); $('#cdM').textContent = p(Math.floor(s % 3600 / 60)); $('#cdS').textContent = p(s % 60); };
      tick(); setInterval(() => { if (!document.hidden) tick(); }, 1000);
    }
  }

  /* ================= Life: a day at KareNest ================= */
  const stage = $('#dayStage'), timesEl = $('#times');
  if (stage && timesEl) {
    const I = (f) => url('/images/' + f);
    const OPEN = { from: 9 * 60 + 30, to: 18 * 60 };
    const day = [
      { h: 9, m: 30, n: 'Welcome & wellness check-in', d: 'Doors open. A friendly catch-up with the care team: how you slept, how you feel, what you need today.', img: I('exp1.webp') },
      { h: 10, m: 0, n: 'Yoga on the lawn', d: 'Gentle stretches and breathing under the trees, at a pace that suits every body.', img: I('a1.webp') },
      { h: 11, m: 15, n: 'Arts & crafts', d: 'Painting, clay and thread work. Bring an idea or borrow one of ours.', img: I('a2.webp') },
      { h: 12, m: 30, n: 'Lunch together', d: 'Home-style Kerala meals at long shared tables, with room for conversation.', img: I('e2.webp') },
      { h: 14, m: 0, n: 'Learning session', d: 'Smartphone basics, new hobbies and talks from visiting experts.', img: I('a5.webp') },
      { h: 15, m: 30, n: 'Music & stories', d: 'Bhajans, old film songs and stories shared over the afternoon.', img: I('a3.webp') },
      { h: 16, m: 30, n: 'Games & chai', d: 'Carroms, chess and cards with a hot cup of tea.', img: I('a6.webp') },
      { h: 17, m: 30, n: 'Walking club & goodbyes', d: 'An easy loop through the garden paths before we close at 6:00 PM. See you tomorrow!', img: I('a4.webp') }
    ];
    day.forEach((s, i) => {
      const im = new Image(); im.src = s.img; im.alt = ''; im.loading = 'lazy'; stage.insertBefore(im, stage.firstChild); s.el = im;
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      const hh = ((s.h + 11) % 12 + 1) + ':' + String(s.m).padStart(2, '0') + (s.h < 12 ? ' AM' : ' PM');
      b.innerHTML = '<span class="t">' + hh + '</span><span class="n">' + s.n + '</span>';
      b.addEventListener('click', () => showDay(i)); li.appendChild(b); timesEl.appendChild(li); s.btn = b; s.label = hh;
    });
    const ist = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return { h: +p.find((x) => x.type === 'hour').value, m: +p.find((x) => x.type === 'minute').value, wd: p.find((x) => x.type === 'weekday').value }; };
    let dayIdx = 0;
    const isOpen = (t) => t.wd !== 'Sun' && t.h * 60 + t.m >= OPEN.from && t.h * 60 + t.m < OPEN.to;
    function nowIndex() { const t = ist(), mins = t.h * 60 + t.m; let idx = -1; if (isOpen(t)) day.forEach((s, i) => { if (s.h * 60 + s.m <= mins) idx = i; }); return { idx, mins }; }
    function showDay(i) {
      dayIdx = (i + day.length) % day.length; const s = day[dayIdx]; const { idx, mins } = nowIndex();
      day.forEach((d, j) => { d.el.classList.toggle('on', j === dayIdx); d.btn.setAttribute('aria-current', String(j === dayIdx)); d.btn.classList.toggle('past', j <= idx); });
      $('#dayTitle').textContent = s.n; $('#dayText').textContent = s.d;
      const nextStart = day[dayIdx + 1] ? day[dayIdx + 1].h * 60 + day[dayIdx + 1].m : OPEN.to;
      const live = dayIdx === idx && mins < nextStart; const badge = $('#dayBadge'); badge.classList.toggle('now', live);
      badge.textContent = live ? 'Happening now · ' + s.label : (dayIdx === idx + 1 || (idx === -1 && dayIdx === 0) ? 'Up next · ' : '') + s.label;
      $('#hh').style.transform = 'rotate(' + ((s.h % 12) * 30 + s.m * 0.5) + 'deg)'; $('#mm').style.transform = 'rotate(' + (s.m * 6 + 360 * s.h) + 'deg)';
      $('#dayFill').style.setProperty('--p', (idx < 0 ? 0 : Math.min(100, (idx + 0.5) / day.length * 100)) + '%');
    }
    const t = ist(), { idx } = nowIndex();
    const now = ((t.h + 11) % 12 + 1) + ':' + String(t.m).padStart(2, '0') + (t.h < 12 ? ' AM' : ' PM');
    const mins = t.h * 60 + t.m;
    $('#dayNow').textContent = isOpen(t) ? "It's " + now + " in Kochi. We're open until 6:00 PM."
      : t.wd === 'Sun' ? "It's Sunday in Kochi. We're closed today and open Monday at 9:30 AM."
        : mins < OPEN.from ? "It's " + now + ' in Kochi. We open at 9:30 AM.'
          : "It's " + now + " in Kochi. We're closed now and open " + (t.wd === 'Sat' ? 'Monday' : 'tomorrow') + ' at 9:30 AM.';
    showDay(idx < 0 ? 0 : idx);
    $('#dayPrev').addEventListener('click', () => showDay(dayIdx - 1));
    $('#dayNext').addEventListener('click', () => showDay(dayIdx + 1));
  }

  /* ================= home: find your fit ================= */
  const fitMain = $('#fitMain'), fitSays = $('#fitSays');
  if (fitMain) {
    const IC = {
      me: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>', parent: '<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15 14.2c2.4-.3 4.6 1.2 5 4"/>', heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
      home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>', chat: '<path d="M4 6h16v10H9l-5 4z"/>',
      cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>'
    };
    const qs = [
      { q: 'Who are you exploring KareNest for?', s: 'Pick the closest match.', o: [['Myself', "I'm planning my own next chapter", 'me', [0, 0, 0]], ['A parent', 'Mum, Dad or both', 'parent', [0, 0, 0]], ['Someone I love', 'A relative or a close friend', 'heart', [0, 0, 0]]], say: ["Lovely, let's plan for you!", 'How thoughtful of you.', "They're lucky to have you."] },
      { q: 'What would help the most right now?', s: 'There are no wrong answers.', o: [['Everyday support', 'Care, meals and company, every day', 'home', [3, 0, 0]], ['Things to do', 'Activities, wellness and new friends', 'sun', [0, 3, 1]], ['Staying in touch', 'Events, updates and a friendly network', 'chat', [0, 1, 3]]], say: ['Got it.', 'Sounds fun!', 'Connection matters.'] },
      { q: 'How often do you picture being here?', s: 'You can always change your mind later.', o: [['Living here', 'A home with a community around it', 'home', [3, 0, 0]], ['A few days a week', 'Come for the day, go home in the evening', 'cal', [0, 3, 0]], ['Now and then', 'Join events and celebrations', 'star', [0, 0, 3]]], say: ['', '', ''] }
    ];
    const recs = [
      { h: 'Live With Us', p: 'A home with support, care and a vibrant community around you, every single day.', l: ['KarePlus shared living or a KarePremium private room', 'Five daily food and beverage services', 'A Kare@Home preventive check-up plan included'], href: '/live-with-us', cta: 'See resident packages' },
      { h: 'Visit & Participate', p: 'Spend your days with us: activities, wellness programmes and good company, then head home in the evening.', l: ['Yoga, walks, arts and learning sessions', 'Lunch with friends', 'A day, a week or a month: Bloom, Flourish or Thrive'], href: '/visit-and-participate', cta: 'See visitor passes' },
      { h: 'Join Our Community', p: 'Stay connected with KareNest through events, celebrations and regular updates.', l: ['Invites to festivals and talks', "Updates on what's happening", 'A friendly network of seniors and families'], href: '/community#join', cta: 'Join Our Community' }
    ];
    let step = 0, score = [0, 0, 0], hist = [];
    const prog2 = () => '<div class="fit-prog" aria-hidden="true">' + qs.map((_, i) => '<i class="' + (i < step || step >= qs.length ? 'on' : '') + '"></i>').join('') + '</div>';
    function renderFit(focus) {
      if (step >= qs.length) {
        const r = recs[score.indexOf(Math.max(...score))];
        fitSays.textContent = "I think you'll love this!";
        fitMain.innerHTML = prog2() + '<div class="fit-step result"><span class="rtag">Our suggestion</span><h3 tabindex="-1">' + r.h + '</h3><p>' + r.p + '</p><ul>' + r.l.map((x) => '<li><svg class="ico" aria-hidden="true"><use href="#chk"/></svg>' + x + '</li>').join('') + '</ul><div class="row"><a class="btn btn-primary" href="' + url(r.href) + '">' + r.cta + '<svg class="ico arr" aria-hidden="true"><use href="#arr"/></svg></a><button type="button" class="btn btn-ghost" id="fitAgain">Start again</button></div></div>';
        $('#fitAgain').addEventListener('click', () => { step = 0; score = [0, 0, 0]; hist = []; fitSays.textContent = "Let's try again!"; renderFit(true); });
        $('h3', fitMain).focus({ preventScroll: true });
        const rr = fitMain.getBoundingClientRect(); burst(rr.left + rr.width / 2, rr.top + 80, 18);
        return;
      }
      const Q = qs[step];
      fitMain.innerHTML = prog2() + '<div class="fit-step"><div class="fit-small">Question ' + (step + 1) + ' of ' + qs.length + '</div><h3 class="fit-q" tabindex="-1">' + Q.q + '</h3><div class="fit-small">' + Q.s + '</div><div class="opts">' + Q.o.map((o, i) => '<button type="button" class="opt" data-i="' + i + '"><span class="oi"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + IC[o[2]] + '</svg></span><b>' + o[0] + '</b><span>' + o[1] + '</span></button>').join('') + '</div>' + (step ? '<button type="button" class="fit-back" id="fitBack">← Back</button>' : '') + '</div>';
      $$('.opt', fitMain).forEach((b) => b.addEventListener('click', () => { const o = Q.o[+b.dataset.i]; hist.push(o[3]); o[3].forEach((v, k) => { score[k] += v; }); if (Q.say[+b.dataset.i]) fitSays.textContent = Q.say[+b.dataset.i]; step++; renderFit(true); }));
      const bk = $('#fitBack'); if (bk) bk.addEventListener('click', () => { const h = hist.pop(); h.forEach((v, k) => { score[k] -= v; }); step--; renderFit(true); });
      if (focus) $('.fit-q', fitMain).focus({ preventScroll: true });
    }
    renderFit(false);
  }

  /* ================= photo viewer (activities, community) ================= */
  const lb = $('#lb');
  if (lb) {
    const more = {
      'Yoga & Fitness': 'Morning yoga on the lawn, chair exercises and gentle strength sessions, guided at a comfortable pace.', 'Arts & Crafts': 'Painting, clay, mural work and thread crafts. Finished pieces go up on our community wall.', 'Music & Cultural Events': 'Bhajans, film-song evenings, festival celebrations and visiting performers.', 'Walking Clubs': 'Easy loops through shaded garden paths, with plenty of benches along the way.', 'Learning Sessions': 'Smartphone basics, video calls with family, new hobbies and expert talks.', 'Games & Social Moments': 'Carroms, chess, cards and quiz afternoons, always with tea.',
      'Make New Friends': 'Shared meals, tea on the verandah and clubs for every interest make it easy to meet people.', 'Share Your Talents': 'Teach a recipe, sing at music night or lead a craft. Everyone has something to share.', 'Stay Active': 'Walks, yoga and outings keep days lively and bodies moving.', 'Be Part of Something Meaningful': 'Mentor, volunteer and give back to the wider community.'
    };
    const gallery = [];
    $$('.act').forEach((a) => gallery.push({ el: a, img: $('img', a), kick: 'Activities & Wellness', t: $('h3', a).textContent, meta: ($('.when', a) || {}).textContent || '' }));
    $$('.tile').forEach((a) => gallery.push({ el: a, img: $('img', a), kick: 'Our community', t: $('b', a).textContent, meta: '' }));
    let gi = 0, lastFocus = null;
    function showLb(i) {
      gi = (i + gallery.length) % gallery.length; const g = gallery[gi];
      $('#lbImg').innerHTML = '<img src="' + g.img.currentSrc.replace(/"/g, '') + '" alt="' + g.img.alt.replace(/"/g, '') + '">'; if (!g.img.currentSrc) $('#lbImg img').src = g.img.src;
      $('#lbKick').textContent = g.kick; $('#lbTitle').textContent = g.t;
      $('#lbMeta').innerHTML = g.meta ? '<svg class="ico" aria-hidden="true"><use href="#clk"/></svg>' + g.meta.replace(/</g, '&lt;') : '';
      $('#lbText').textContent = more[g.t] || ''; $('#lbCount').textContent = (gi + 1) + ' / ' + gallery.length;
    }
    function openLb(i) { lastFocus = document.activeElement; lb.hidden = false; showLb(i); requestAnimationFrame(() => lb.classList.add('open')); document.body.style.overflow = 'hidden'; $('#lbX').focus(); }
    function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; setTimeout(() => { lb.hidden = true; }, 400); if (lastFocus) lastFocus.focus(); }
    gallery.forEach((g, i) => {
      g.el.classList.add('zoomable');
      const h = document.createElement('span'); h.className = 'zoom-hint'; h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/></svg>';
      ($('.act-img', g.el) || g.el).appendChild(h);
      g.el.setAttribute('role', 'button'); g.el.setAttribute('aria-label', 'View ' + g.t);
      g.el.addEventListener('click', (e) => { e.preventDefault(); openLb(i); });
      g.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); } });
    });
    $('#lbX').addEventListener('click', closeLb);
    $('#lbPrev').addEventListener('click', () => showLb(gi - 1));
    $('#lbNext').addEventListener('click', () => showLb(gi + 1));
    $('#lbCta').addEventListener('click', () => closeLb());
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', (e) => {
      if (lb.hidden) return;
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowRight') showLb(gi + 1);
      else if (e.key === 'ArrowLeft') showLb(gi - 1);
      else if (e.key === 'Tab') { const f = $$('button,a', lb); const k = f.indexOf(document.activeElement); if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    });
    let tx = null;
    lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) showLb(gi + (dx < 0 ? 1 : -1)); tx = null; });
  }

  /* ================= which sign-in providers are switched on (shared) ================= */
  let providersP = null;
  const providers = () => providersP || (providersP = fetch(api() + '/api/app/auth/providers', { credentials: 'omit' }).then((r) => r.json()).then((d) => (d && d.providers) || {}).catch(() => ({})));
  const PROV = { google: 'Google', facebook: 'Facebook' };
  const PROV_ICON = {
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.6L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>'
  };
  // where My KareIQ opens after signing in: the "What would you like to set up?" page, with the
  // chosen package's form already open when they came from a package
  const nextFor = (plan) => (plan ? '#/plans?brand=karenest&plan=' + encodeURIComponent(plan) : '#/plans');
  const provHref = (p, plan) => api() + '/api/app/auth/' + p + '/start?brand=karenest&next=' + encodeURIComponent(nextFor(plan)) + '&back=' + encodeURIComponent(location.origin + url('/sign-in'));

  /* ================= sign in / create account popup =================
     The popup talks to the KareIQ server, which answers with a one-time link. Opening that
     link signs the person in to My KareIQ and continues to the package they picked. */
  const auth = $('#authDlg');
  if (auth) {
    const fIn = $('#authSignin'), fUp = $('#authSignup');
    let mode = 'signin', plan = '';
    const planName = (id) => { const b = $('[data-plan="' + id + '"]'); const card = b && b.closest('.pkg,.kb-plan,.pd-card,.phero'); const h = card && card.querySelector('h1,h2,h3,h4'); return h ? h.textContent.trim() : ''; };
    function setMode(m) {
      mode = m;
      fIn.hidden = m !== 'signin'; fUp.hidden = m !== 'signup';
      $('#authTitle').textContent = m === 'signin' ? 'Sign in to KareNest' : 'Create your account';
      $('#authSub').textContent = m === 'signin' ? 'One sign-in for KareNest and Kare@Home.' : 'It takes a minute. Our team will call you to confirm the details.';
      $('#authSwitchText').textContent = m === 'signin' ? 'New to KareNest?' : 'Already have an account?';
      $('#authSwitch').textContent = m === 'signin' ? 'Create an account' : 'Sign in';
      $$('[data-auth-err]', auth).forEach((x) => { x.textContent = ''; });
      setTimeout(() => { const f = $('input', m === 'signin' ? fIn : fUp); if (f) f.focus(); }, 30);
    }
    function openAuth(m, p) {
      plan = p || '';
      const pl = $('#authPlan'), name = plan && planName(plan);
      pl.hidden = !plan; pl.textContent = plan ? 'Sign in to continue with ' + (name || 'your package') : '';
      setMode(m || 'signin');
      providers().then((on) => {
        const box = $('#authProv'), keys = Object.keys(PROV).filter((k) => on[k]);
        box.hidden = !keys.length;
        box.innerHTML = keys.map((k) => '<a href="' + provHref(k, plan) + '">' + PROV_ICON[k] + 'Continue with ' + PROV[k] + '</a>').join('') + (keys.length ? '<p class="or">or use your mobile number or email</p>' : '');
      });
      if (!auth.open) { if (auth.showModal) auth.showModal(); else auth.setAttribute('open', ''); }
    }
    const closeAuth = () => { if (auth.close) auth.close(); else auth.removeAttribute('open'); };
    $('[data-auth-close]', auth).addEventListener('click', closeAuth);
    auth.addEventListener('click', (e) => { if (e.target === auth) closeAuth(); });
    $('#authSwitch').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
    $$('[data-peek]', auth).forEach((b) => b.addEventListener('click', () => { const i = b.previousElementSibling; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }));
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-auth]');
      if (!t) return;
      e.preventDefault();
      if (document.body.classList.contains('menu-open')) setMenu(false);
      openAuth(t.dataset.auth === 'signup' ? 'signup' : 'signin', t.dataset.plan);
    });
    async function send(form, path, body) {
      const err = $('[data-auth-err]', form), btn = $('.auth-go', form), label = btn.textContent;
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Please wait…';
      try {
        const r = await fetch(api() + '/api/app/' + path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kareiq' }, body: JSON.stringify({ ...body, handoff: true, next: nextFor(plan) }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok && d.go) { btn.textContent = 'Opening My KareIQ…'; location.href = d.go; return; }
        const er = d.errors || {};
        $$('input', form).forEach((i) => { if (er[i.name]) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
        err.textContent = er.name || er.phone || er.email || er.password || d.message || 'Sorry, that did not work. Please try again.';
      } catch (e2) { err.textContent = 'We could not reach the sign-in service. Please check your internet and try again.'; }
      btn.disabled = false; btn.textContent = label;
    }
    fIn.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = fIn.elements.id.value.trim(), pw = fIn.elements.password.value;
      if (!id || !pw) { $('[data-auth-err]', fIn).textContent = 'Please enter your mobile number or email, and your password.'; (id ? fIn.elements.password : fIn.elements.id).focus(); return; }
      send(fIn, 'login', { id, password: pw });
    });
    fUp.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (n) => fUp.elements[n].value.trim();
      const digits = v('phone').replace(/\D/g, '');
      const err = $('[data-auth-err]', fUp);
      if (v('name').length < 2) { err.textContent = 'Please enter your name.'; fUp.elements.name.focus(); return; }
      if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith('91')))) { err.textContent = 'Please enter a 10-digit mobile number.'; fUp.elements.phone.focus(); return; }
      if (fUp.elements.password.value.length < 8) { err.textContent = 'Please choose a password with at least 8 characters.'; fUp.elements.password.focus(); return; }
      send(fUp, 'signup', { name: v('name'), phone: v('phone'), email: v('email'), password: fUp.elements.password.value });
    });
    // /sign-in?plan=kareplus (from a package button without JavaScript, or a shared link)
    const q = new URLSearchParams(location.search);
    if (PAGE === 'signin' && q.get('plan')) openAuth('signin', q.get('plan'));
  }

  /* ================= Sign In page ================= */
  const prov = $('#providers');
  if (prov) {
    const msg = $('#provMsg');
    const params = new URLSearchParams(location.search);
    if (params.get('error')) { msg.textContent = params.get('error').slice(0, 200); msg.classList.add('err'); }
    // Google / Facebook buttons appear only once their keys are set on the server
    providers().then((on) => {
      $$('[data-provider=google],[data-provider=facebook]', prov).forEach((b) => {
        const p = b.dataset.provider;
        if (!on[p]) return;
        b.href = provHref(p, params.get('plan'));
        b.removeAttribute('aria-disabled'); b.hidden = false; $('[data-st]', b).textContent = '';
        b.addEventListener('click', () => { b.classList.add('loading'); $('[data-st]', b).textContent = 'Opening ' + PROV[p] + '…'; });
      });
    });
    addEventListener('pageshow', () => $$('.prov-btn.loading', prov).forEach((b) => { b.classList.remove('loading'); $('[data-st]', b).textContent = ''; }));
  }

  /* ================= header: never let the menu overlap the buttons ================= */
  if (nav) {
    const main = $('.nav-main', nav), inner = $('.nav-in', nav);
    // compare the last menu item with the space the menu has (the hidden dropdown panels are ignored)
    const over = () => {
      const lis = $$('.links > li', main); if (!lis.length) return false;
      const last = lis[lis.length - 1].getBoundingClientRect(), m = main.getBoundingClientRect(), cta = ($('.nav-cta', nav) || main).getBoundingClientRect();
      return last.right > m.right + 1 || last.right > cta.left - 4;
    };
    const fit = () => {
      nav.classList.remove('compact', 'tight');
      if (!main || getComputedStyle(main).display === 'none') return;
      if (over()) nav.classList.add('compact');
      if (over()) nav.classList.add('tight');
    };
    fit();
    addEventListener('resize', () => requestAnimationFrame(fit), { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    addEventListener('load', fit);
    $$('#fsSeg button').forEach((b) => b.addEventListener('click', () => requestAnimationFrame(fit)));
  }

  measure();
})();
