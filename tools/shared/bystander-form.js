// The Bystander booking form (KareIQ /bystander and Kare@Home /kare-at-home/bystander).
// No sign-in: the visitor picks Half Day, Full Day, Round the Clock or long-term, and gives their own
// details, the patient's details, the date and start time, and where the service is needed.
// Behaviour: public/js/bystander.js · Styles: public/css/bystander.css · Checked again on the server
// (src/validate.js validateBystander). Any element with data-bystander="by-half|by-full|by-24|by-long"
// opens the form with that option chosen.
const W = require('./wellness');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bystanderForm(page) {
  const B = W.bystander;
  const opts = B.options.map((o) => ({ id: o.id, name: o.name, label: o.label, price: o.price, sub: `${o.label} · ${W.rupees(o.price)}` }))
    .concat([{ id: 'by-long', name: 'Long-term', label: 'to be discussed', price: 0, sub: 'Discussed case by case' }]);
  const field = (id, label, input, opt = false, cls = '') => `<div class="bf-field${cls ? ' ' + cls : ''}"><label for="bf-${id}">${label}${opt ? ' <span class="bf-opt">(optional)</span>' : ''}</label>${input}<span class="bf-err" id="bf-${id}-err"></span></div>`;
  const select = (name, options, placeholder, required = true) => `<select id="bf-${name}" name="${name}" aria-describedby="bf-${name}-err"${required ? ' required' : ''}><option value="">${placeholder}</option>${Object.entries(options).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`;
  return `<!-- ============ BYSTANDER BOOKING (written by tools/shared/bystander-form.js) ============ -->
<dialog class="bf" id="bystanderForm" aria-labelledby="bfTitle" data-page="${page}">
  <div class="bf-sheet">
    <button class="bf-x" type="button" data-bf-close aria-label="Close">×</button>
    <div class="bf-view" data-bf-view="form">
      <p class="bf-eyebrow">${esc(B.title)}</p>
      <h2 id="bfTitle">Book a Bystander</h2>
      <p class="bf-sub">No sign-in needed. Tell us what you need and our team will call to confirm the caregiver and timing.</p>
      <form id="bfForm" novalidate>
        <div class="bf-alert" role="alert" hidden></div>
        <fieldset class="bf-set">
          <legend>1. Choose the support</legend>
          <div class="bf-opts" role="radiogroup" aria-describedby="bf-package-err">
            ${opts.map((o) => `<label class="bf-opt-card"><input type="radio" name="package" value="${o.id}" data-name="${esc(o.name)}" data-label="${esc(o.label)}" data-price="${o.price}"><span><b>${esc(o.name)}</b><small>${esc(o.sub)}</small></span></label>`).join('\n            ')}
          </div>
          <span class="bf-err" id="bf-package-err"></span>
          <p class="bf-note">${esc(B.longTerm)}</p>
          <div class="bf-row">
            ${field('date', 'Date needed', '<input id="bf-date" name="date" type="date" required aria-describedby="bf-date-err">')}
            ${field('startTime', 'Start time', '<input id="bf-startTime" name="startTime" type="time" required step="900" aria-describedby="bf-startTime-err">')}
          </div>
        </fieldset>

        <fieldset class="bf-set">
          <legend>2. Your details</legend>
          ${field('name', 'Your name', '<input id="bf-name" name="name" autocomplete="name" placeholder="e.g. Priya Raman" required aria-describedby="bf-name-err">')}
          <div class="bf-row">
            ${field('phone', 'Mobile number', '<input id="bf-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required aria-describedby="bf-phone-err">')}
            ${field('altPhone', 'Another contact number', '<input id="bf-altPhone" name="altPhone" type="tel" inputmode="tel" placeholder="Family member or patient" aria-describedby="bf-altPhone-err">', true)}
          </div>
          <div class="bf-row">
            ${field('email', 'Email', '<input id="bf-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" aria-describedby="bf-email-err">', true)}
            ${field('careFor', 'The Bystander is for', select('careFor', { parent: 'My parent', grandparent: 'My grandparent', spouse: 'My spouse', self: 'Myself', other: 'Someone else' }, 'Choose'))}
          </div>
        </fieldset>

        <fieldset class="bf-set">
          <legend>3. Patient details</legend>
          <div class="bf-row bf-row-3">
            ${field('patientName', "Patient's name", '<input id="bf-patientName" name="patientName" placeholder="e.g. Lakshmi Nair" required aria-describedby="bf-patientName-err">', false, 'bf-wide')}
            ${field('patientAge', 'Age', '<input id="bf-patientAge" name="patientAge" type="number" inputmode="numeric" min="1" max="120" placeholder="72" required aria-describedby="bf-patientAge-err">')}
          </div>
          <div class="bf-row">
            ${field('patientGender', 'Gender', select('patientGender', { female: 'Female', male: 'Male', other: 'Other', none: 'Prefer not to say' }, 'Choose', false), true)}
            ${field('mobility', 'Moving around', select('mobility', { independent: 'Walks independently', assisted: 'Needs help to walk', wheelchair: 'Uses a wheelchair', bedbound: 'Mostly in bed' }, 'Choose'))}
          </div>
          ${field('needs', 'Health conditions and care needs', '<textarea id="bf-needs" name="needs" rows="2" maxlength="600" placeholder="e.g. diabetic, recovering from knee surgery, needs help with meals and medicines" aria-describedby="bf-needs-err"></textarea>', true)}
        </fieldset>

        <fieldset class="bf-set">
          <legend>4. Where the service is needed</legend>
          ${field('location', 'Location', select('location', { home: 'At home', hospital: 'In hospital', other: 'Somewhere else' }, 'Choose'))}
          ${field('address', 'Full address', '<textarea id="bf-address" name="address" rows="2" maxlength="300" autocomplete="street-address" placeholder="House or flat number, street, landmark. For a hospital: hospital name, ward and room" required aria-describedby="bf-address-err"></textarea>')}
          <div class="bf-row">
            ${field('area', 'Area / city', '<input id="bf-area" name="area" autocomplete="address-level2" placeholder="e.g. Kakkanad, Kochi" required aria-describedby="bf-area-err">')}
            ${field('pincode', 'PIN code', '<input id="bf-pincode" name="pincode" inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder="682030" required aria-describedby="bf-pincode-err">')}
          </div>
        </fieldset>

        <fieldset class="bf-set">
          <legend>5. Anything else</legend>
          ${field('notes', 'Notes or special requirements', '<textarea id="bf-notes" name="notes" rows="3" maxlength="1000" placeholder="Language preference, preferred caregiver (male or female), pets at home, parking…"></textarea>', true)}
        </fieldset>

        <div class="bf-hp" aria-hidden="true"><label for="bf-website">Leave this empty</label><input id="bf-website" name="website" tabindex="-1" autocomplete="off"></div>
        <label class="bf-check"><input type="checkbox" name="consent" id="bf-consent" aria-describedby="bf-consent-err"><span>I agree to be contacted by KareIQ about this booking. See our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
        <span class="bf-err" id="bf-consent-err"></span>
        <div class="bf-foot">
          <p class="bf-total" aria-live="polite" data-bf-total>Choose an option to see the price.</p>
          <button class="bf-go" type="submit">Request booking <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></button>
        </div>
      </form>
    </div>
    <div class="bf-view bf-done" data-bf-view="done" hidden tabindex="-1">
      <div class="bf-tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h2>Booking request received</h2>
      <p>Thank you, <b data-bf-name></b>. Our team will call you on <b data-bf-phone></b> to confirm the caregiver and timing.</p>
      <dl class="bf-summary" data-bf-summary></dl>
      <p class="bf-ref">Your reference <b data-bf-ref></b></p>
      <button class="bf-go bf-again" type="button" data-bf-close>Done</button>
    </div>
  </div>
</dialog>`;
}

module.exports = { bystanderForm };
