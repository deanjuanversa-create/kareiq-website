/* FAQ pages (KareIQ, Kare@Home and KareNest; markup from tools/shared/faq.js):
   - a search box that filters the questions as you type (question and answer text);
   - topic links that highlight the topic being read;
   - a question can be linked to: /faq#q-<n> opens and shows it.
   Without this script every question is still there, in native <details> accordions. */
(function () {
  var root = document.querySelector('[data-faq]');
  if (!root) return;
  var box = root.querySelector('.faq-search'), input = root.querySelector('#faq-q'), clear = root.querySelector('.faq-clear');
  var count = root.querySelector('.faq-count'), empty = document.querySelector('.faq-empty');
  var groups = [].slice.call(document.querySelectorAll('.faq-group'));
  var items = [].slice.call(document.querySelectorAll('.faq-group .faq'));
  var topics = [].slice.call(root.querySelectorAll('.faq-topics a'));
  var norm = function (s) { return (s || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim(); };
  var text = items.map(function (d) { return norm(d.textContent); });
  var opened = []; // questions opened by a search, closed again when it is cleared

  items.forEach(function (d, i) { if (!d.id) d.id = 'q-' + (i + 1); });
  box.hidden = false;

  function run() {
    var q = norm(input.value), words = q ? q.split(' ') : [], shown = 0;
    items.forEach(function (d, i) {
      var hit = words.every(function (w) { return text[i].indexOf(w) >= 0; });
      d.hidden = !hit;
      if (hit) shown++;
    });
    groups.forEach(function (g) { g.hidden = !g.querySelector('.faq:not([hidden])'); });
    topics.forEach(function (a) {
      var g = document.getElementById(a.getAttribute('href').slice(1));
      a.classList.toggle('off', !!(g && g.hidden));
    });
    clear.hidden = !q;
    empty.hidden = !q || shown > 0;
    count.textContent = q ? (shown ? shown + (shown === 1 ? ' question matches' : ' questions match') : '') : '';
    // a search that narrows things to a few questions opens them
    opened.forEach(function (d) { if (d.hidden || !q) d.open = false; });
    opened = [];
    if (q && shown && shown <= 3) items.forEach(function (d) { if (!d.hidden && !d.open) { d.open = true; opened.push(d); } });
  }
  input.addEventListener('input', run);
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; run(); } });
  clear.addEventListener('click', function () { input.value = ''; run(); input.focus(); });

  // the topic being read is marked in the topic links
  if ('IntersectionObserver' in window) {
    var cur = null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) cur = e.target.id; });
      topics.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + cur;
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    groups.forEach(function (g) { io.observe(g); });
  }

  // /faq#q-3 opens that question
  function fromHash() {
    var t = location.hash && document.getElementById(location.hash.slice(1));
    if (t && t.classList.contains('faq')) { t.open = true; setTimeout(function () { t.scrollIntoView({ block: 'start' }); }, 0); }
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
