/* "Our Packages" dropdown for the KareIQ and Kare@Home headers (the KareNest menu works the same
   way, in karenest/app.js). Opens on hover (with a short close delay so the pointer can travel to
   the Wellness submenu), on click or tap, and with the keyboard (Enter/Space, arrows, Home/End,
   Escape). In the phone/tablet drawer, Our Packages and Wellness are accordions. */
(function () {
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var dds = $$('.has-dd');
  function setDD2(li, open) {
    if (open) {
      li.classList.remove('flip');
      var r = li.getBoundingClientRect();
      if (r.right + 290 > document.documentElement.clientWidth) li.classList.add('flip');
    }
    li.classList.toggle('open', open);
    var b = $('.dd2-btn', li);
    if (b) b.setAttribute('aria-expanded', String(open));
  }
  function setDD(li, open) {
    li.classList.toggle('open', open);
    var b = $('.dd-btn', li);
    if (b) b.setAttribute('aria-expanded', String(open));
    if (!open) $$('.has-dd2', li).forEach(function (s) { setDD2(s, false); });
  }
  function closeAll(except) { dds.forEach(function (d) { if (d !== except && d.classList.contains('open')) setDD(d, false); }); }

  dds.forEach(function (li) {
    var btn = $('.dd-btn', li), menu = $('.dd', li), t, hoverAt = 0;
    if (!btn || !menu) return;
    var items = function () { return $$('a,button', menu).filter(function (el) { return !el.closest('.dd2') || el.closest('.has-dd2').classList.contains('open'); }); };
    btn.addEventListener('click', function () {
      // a mouse that just opened the menu by hovering should not close it again with the same click
      if (li.classList.contains('open') && Date.now() - hoverAt < 700) return;
      var o = !li.classList.contains('open'); closeAll(li); setDD(li, o);
    });
    li.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(t); if (!li.classList.contains('open')) hoverAt = Date.now(); closeAll(li); setDD(li, true); });
    li.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(t); t = setTimeout(function () { setDD(li, false); }, 300); });
    li.addEventListener('keydown', function (e) {
      var list = items(), i = list.indexOf(document.activeElement), l;
      if (e.key === 'Escape') { e.preventDefault(); setDD(li, false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (!li.classList.contains('open')) setDD(li, true); l = items(); (l[i + 1] || l[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!li.classList.contains('open')) setDD(li, true); l = items(); (i > 0 ? l[i - 1] : l[l.length - 1]).focus(); }
      else if ((e.key === 'Home' || e.key === 'End') && li.classList.contains('open') && i > -1) { e.preventDefault(); l = items(); (e.key === 'Home' ? l[0] : l[l.length - 1]).focus(); }
    });
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) setDD(li, false); });
    // following a link (including one to a section of the same page) closes the menu
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setDD(li, false); }); });
    $$('.has-dd2', li).forEach(function (sub) {
      var b2 = $('.dd2-btn', sub), t2, hoverAt2 = 0;
      b2.addEventListener('click', function (e) {
        e.stopPropagation();
        if (sub.classList.contains('open') && Date.now() - hoverAt2 < 700) return;
        var o = !sub.classList.contains('open');
        setDD2(sub, o);
        if (o && e.detail === 0) { var first = $('.dd2 a', sub); if (first) first.focus(); } // keyboard "click"
      });
      sub.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(t2); if (!sub.classList.contains('open')) hoverAt2 = Date.now(); setDD2(sub, true); });
      sub.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(t2); t2 = setTimeout(function () { setDD2(sub, false); }, 300); });
      sub.addEventListener('keydown', function (e) {
        var inNested = e.target.closest('.dd2');
        if (e.key === 'ArrowRight' && !inNested) { e.preventDefault(); e.stopPropagation(); setDD2(sub, true); var f = $('.dd2 a', sub); if (f) f.focus(); }
        else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && inNested) { e.preventDefault(); e.stopPropagation(); setDD2(sub, false); b2.focus(); }
      });
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.has-dd')) closeAll(); });

  /* drawer accordions */
  $$('.drawer .acc-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = document.getElementById(b.getAttribute('aria-controls'));
      var o = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(o));
      if (p) p.hidden = !o;
    });
  });
})();
