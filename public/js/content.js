/* Applies admin-edited content (window.KARE_CONTENT, served by /api/content.js)
   to the page. When the page is opened without the server, the text already
   in the HTML is used. */
(function () {
  const C = window.KARE_CONTENT;
  if (!C) return;
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), C);

  document.querySelectorAll('[data-c]').forEach((el) => {
    const v = get(el.dataset.c);
    if (typeof v === 'string' && v) el.textContent = v;
  });

  const ct = C.contact || {};
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => { if (ct.phone) a.href = 'tel:' + ct.phone; });
  document.querySelectorAll('a[href*="wa.me/"]').forEach((a) => {
    if (!ct.whatsapp) return;
    const q = a.href.includes('?') ? a.href.slice(a.href.indexOf('?')) : '';
    a.href = 'https://wa.me/' + ct.whatsapp + q;
  });
  document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
    if (!ct.email) return;
    a.href = 'mailto:' + ct.email;
    if (a.textContent.includes('@')) a.textContent = ct.email;
  });
  document.querySelectorAll('a[href*="instagram.com/"]').forEach((a) => {
    if (!ct.instagram) return;
    a.href = 'https://instagram.com/' + ct.instagram;
    const t = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('@'));
    if (t) t.textContent = '@' + ct.instagram;
  });

  if (window.Kare && Kare.CONTACT) {
    if (ct.phone) Kare.CONTACT.phone = ct.phone;
    if (ct.phoneDisplay) Kare.CONTACT.display = ct.phoneDisplay;
    if (ct.whatsapp) Kare.CONTACT.whatsapp = 'https://wa.me/' + ct.whatsapp;
  }
})();
