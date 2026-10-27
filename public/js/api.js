/* Where the KareIQ API server lives (Render). Bookings, enquiries and admin-edited content
   all come from here. When the api.<your domain> address is set up in Render, change ONLY
   the line below, e.g. 'https://api.karenest.co.in'. On your own computer (localhost) the
   local server is used automatically. */
window.KARE_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://kareiq-api.onrender.com';

/* Admin-edited text and prices load in the background so the page never waits for the
   server (a free Render server can take a while to wake up). Scripts that use them call
   KareWhenContent(fn); fn runs once the content has arrived, or after 4 seconds with the
   built-in defaults. */
(function () {
  var done = false, queue = [];
  function ready() {
    if (done) return;
    done = true;
    queue.splice(0).forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }
  window.KareWhenContent = function (fn) { if (done) fn(); else queue.push(fn); };
  var s = document.createElement('script');
  s.src = window.KARE_API + '/api/content.js';
  s.async = true;
  s.onload = ready;
  s.onerror = ready;
  document.head.appendChild(s);
  setTimeout(ready, 4000);
})();
