/* Shared form helpers for KareIQ and Kare@Home.
   Sends JSON to the Node server and shows field errors returned by it. */
(function () {
  const CONTACT = {
    phone: '+918129345178',          // change in one place: also update the footer text in the HTML pages
    display: '+91 81293 45178',
    whatsapp: 'https://wa.me/918129345178'
  };

  function phoneOk(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d);
  }

  function clearErrors(form) {
    form.querySelectorAll('.field.has-err').forEach((f) => f.classList.remove('has-err'));
    form.querySelectorAll('.err').forEach((e) => { e.textContent = ''; });
    const box = form.querySelector('.form-alert');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  function setError(form, name, msg) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return false;
    const field = input.closest('.field');
    if (!field) return false;
    field.classList.add('has-err');
    const err = field.querySelector('.err');
    if (err) err.textContent = msg;
    return true;
  }

  function showErrors(form, errors) {
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      if (setError(form, name, msg) && !first) first = form.querySelector(`[name="${name}"]`);
    });
    if (first) first.focus({ preventScroll: false });
    return first;
  }

  function alert(form, html) {
    const box = form.querySelector('.form-alert');
    if (!box) return;
    box.innerHTML = html;
    box.hidden = false;
  }

  function offlineMessage() {
    return `We couldn't reach our booking system just now. Please call or WhatsApp us on <a href="tel:${CONTACT.phone}">${CONTACT.display}</a> and we'll take your request directly.`;
  }

  async function send(url, data) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }
    let body = {};
    try { body = await res.json(); } catch (e) { /* non-JSON, e.g. page opened without the server */ }
    if (!res.ok || !body.ok) {
      const err = new Error(body.message || 'offline');
      err.errors = body.errors;
      err.offline = !body.message;
      throw err;
    }
    return body;
  }

  function data(form) {
    const out = {};
    new FormData(form).forEach((v, k) => { out[k] = typeof v === 'string' ? v.trim() : v; });
    form.querySelectorAll('input[type="checkbox"]').forEach((c) => { out[c.name] = c.checked; });
    return out;
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${label || 'Sending…'}`;
      btn.disabled = true;
    } else {
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
      btn.disabled = false;
    }
  }

  window.Kare = { CONTACT, phoneOk, clearErrors, setError, showErrors, alert, offlineMessage, send, data, busy };
})();
