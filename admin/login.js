(function () {
  var form = document.getElementById('loginForm');
  var pw = document.getElementById('password');
  var err = document.getElementById('err');
  var btn = document.getElementById('submit');
  var eye = document.getElementById('eye');

  fetch('/api/admin/session', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
    if (s.signedIn) { location.replace('/admin/'); return; }
    if (!s.configured) { document.getElementById('notConfigured').hidden = false; pw.disabled = true; btn.disabled = true; }
  }).catch(function () { err.textContent = 'Could not reach the server. Make sure it is running with node server.js.'; });

  eye.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', show);
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pw.focus();
  });
  pw.addEventListener('input', function () { pw.classList.remove('bad'); err.textContent = ''; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pw.value) { pw.classList.add('bad'); err.textContent = 'Enter the admin password.'; pw.focus(); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    fetch('/api/admin/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw.value }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok) { btn.textContent = 'Welcome'; location.replace('/admin/' + (location.hash || '')); return; }
        pw.classList.add('bad'); err.textContent = x.d.message || 'Sign in failed.';
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
        pw.select();
        btn.disabled = false; btn.textContent = 'Sign in';
      })
      .catch(function () { err.textContent = 'Could not reach the server. Make sure it is running.'; btn.disabled = false; btn.textContent = 'Sign in'; });
  });
  pw.focus();
})();
