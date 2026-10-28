// KareNest pages. Each page has its own content; shared parts come from layout.js and the
// package details from data.js. Text is taken from the existing website and the approved
// package documents; nothing here is placeholder copy.

const D = require('./data');

module.exports = function pages(L) {
  const { u, img, ico, esc } = L;
  const G = D.groups;

  // ---------- small building blocks ----------
  const arrow = ico('arr', 'ico arr');
  const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([label, href], i) =>
    i === items.length - 1 ? `<li aria-current="page">${label}</li>` : `<li><a href="${href}">${label}</a></li>`).join('')}</ol></nav>`;
  const HOME = ['Home', L.home];
  const PKGS = ['Our Packages', u('/packages')];
  const WELL = ['Wellness', u('/wellness')];

  function hero({ crumbs: cr, eyebrow, h1, lede, actions = '', image, alt, caption, solo, extra = '' }) {
    return `<section class="phero${solo ? ' solo' : ''}">
  <div class="wrap phero-in">
    <div class="phero-copy">
      ${cr ? crumbs(cr) : ''}
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <h1>${h1}</h1>
      ${lede ? `<p class="lede">${lede}</p>` : ''}
      ${extra}
      ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
    </div>
    ${image ? `<figure class="phero-photo"><img src="${img(image)}" alt="${esc(alt)}" width="1200" height="960" fetchpriority="high">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>` : ''}
  </div>
</section>`;
  }

  const visitBtn = (cls = 'btn btn-ghost mag', label = 'Plan a Visit') => `<a class="${cls}" href="${u('/contact')}?type=karenest-visit#enquiry" data-open="visit">${ico('cal')}${label}</a>`;
  const detailHref = (p) => u(D.pathOf(p));
  const badgeOf = (p) => (p.type === p.tagline ? G[p.group].name : p.type);
  // monthly packages can be paid monthly, quarterly, half-yearly or yearly (savings set in the admin page)
  const DUR = [['1', 'Monthly'], ['3', 'Quarterly (3 months)'], ['6', 'Half-yearly (6 months)'], ['12', 'Yearly (12 months)']];
  const priceHtml = (p) => p.unit === 'month'
    ? `<div class="pkg-price" data-pp="${p.id}" data-base="${p.price}"><b>${D.rupees(p.price)}</b><span>/ month</span></div>
  <label class="pkg-dur"><span>Payment plan</span><select data-dur="${p.id}" aria-label="Payment plan for ${esc(p.name)}">${DUR.map((d) => `<option value="${d[0]}" data-label="${d[1]}">${d[1]}</option>`).join('')}</select></label>
  <p class="pkg-bill" data-bill>Billed monthly</p>`
    : `<div class="pkg-price" data-pp="${p.id}" data-base="${p.price}"><b>${D.rupees(p.price)}</b><span>${esc(D.unitLabel(p))}</span></div>`;
  const list = (items) => `<ul class="pkg-list">${items.map((t) => `<li>${ico('chk')}<span>${esc(t)}</span></li>`).join('')}</ul>`;

  function pkgCard(p, { compact = false, level = 3, includes = true } = {}) {
    const h = `h${level}`;
    return `<article class="pkg c-${p.color}${compact ? ' compact' : ''}" aria-labelledby="pk-${p.id}">
  <div class="pkg-top"><span class="pkg-type">${esc(badgeOf(p))}</span>${p.flag ? `<span class="pkg-flag">${esc(p.flag)}</span>` : ''}</div>
  <${h} id="pk-${p.id}"><a href="${detailHref(p)}">${esc(p.name)}</a></${h}>
  <p class="pkg-tag">${esc(p.tagline)}</p>
  ${priceHtml(p)}
  ${p.note ? `<p class="pkg-note">${esc(p.note)}</p>` : ''}
  ${p.desc && !compact ? `<p class="pkg-desc">${esc(p.desc)}</p>` : ''}
  ${p.includes && includes && !compact ? `<hr><p class="pkg-inc-h">${esc(p.listTitle)}</p>${list(p.includes)}` : ''}
  ${p.best && !compact ? `<p class="pkg-best"><b>Best for:</b> ${esc(p.best)}</p>` : ''}
  <div class="pkg-actions">
    ${compact ? '' : `<a class="btn btn-primary" href="${u('/sign-in')}?plan=${p.id}" data-auth data-plan="${p.id}">${esc(p.cta)}</a>`}
    <a class="link-arrow" href="${detailHref(p)}">View details<span class="sr-only"> of ${esc(p.name)}</span>${ico('arr')}</a>
  </div>
</article>`;
  }

  function compare(spec, { id = 'compare', minw = 0, title, sub, level = 2 } = {}) {
    const h = `h${level}`;
    return `<div class="cmp" id="${id}">
  <${h} class="h3x">${esc(title || spec.title)}</${h}>
  ${sub ? `<p class="sub">${sub}</p>` : ''}
  <div class="cmp-scroll" role="region" aria-label="${esc(title || spec.title)}" tabindex="0" style="--minw:${minw}px">
    <table>
      <thead><tr><th scope="col">${spec.cols.length === 2 ? 'Service' : 'Feature'}</th>${spec.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${spec.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td${/^(Included|Yes|Complimentary)$/.test(c) ? ' class="yes"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>
  ${minw ? '<p class="cmp-hint">Swipe sideways to see every package.</p>' : ''}
</div>`;
  }

  const notIncluded = (open = false) => `<details class="faq"${open ? ' open' : ''}>
  <summary>What is not included in the monthly price?</summary>
  <div class="faq-body">
    <p style="margin:0 0 12px">Services charged separately:</p>
    <ul>${D.NOT_INCLUDED.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>
</details>`;

  const feats = (items) => `<ul class="feats">${items.map(([t, s, i]) => `<li><span class="fi">${ico(i)}</span><div><b>${esc(t)}</b><span>${esc(s)}</span></div></li>`).join('')}</ul>`;

  // Enquiry form. Sends to the KareIQ server (/api/enquiries), which validates it again.
  let formSeq = 0;
  function enquiry({ title, lede, interest, plans = [], selected = '', what, points = [], nestu, eyebrow = 'Enquire', id = 'enquire', heading = 'Send an enquiry', notSure = 'Not sure yet, help me choose', planLabel = 'Package', extraFields = '' }) {
    const n = ++formSeq, f = (s) => `e${n}${s}`;
    const opts = plans.map((pid) => {
      const p = D.packages.find((x) => x.id === pid);
      return `<option value="${p.id}" data-interest="${G[p.group].interest}"${p.id === selected ? ' selected' : ''}>${esc(p.name)} · ${D.rupees(p.price)} ${esc(D.unitLabel(p))}</option>`;
    }).join('');
    const planField = plans.length ? `<div class="field"><label for="${f('Plan')}">${planLabel}</label>
        <select id="${f('Plan')}" name="plan">${opts}<option value=""${selected ? '' : ' selected'}>${esc(notSure)}</option></select></div>` : '';
    return `<section class="sec enq" id="${id}" aria-labelledby="${f('T')}">
  <div class="wrap contact-in">
    <div class="contact-copy rv">
      <div class="eyebrow">${eyebrow}</div>
      <h2 class="h2" id="${f('T')}" style="margin-top:12px">${title}</h2>
      ${lede ? `<p class="sub">${lede}</p>` : ''}
      ${points.length ? `<ul class="enq-points">${points.map((t) => `<li>${ico('chk')}<span>${t}</span></li>`).join('')}</ul>` : ''}
      <div class="contact-nestu"><img loading="lazy" decoding="async" src="${img('head.webp')}" alt="" width="58" height="58"><span><b>Nestu says</b>${nestu || 'Leave your name and number and our team will call you back, usually the same day.'}</span></div>
    </div>
    <div class="contact-card rv" style="--d:.1s">
      <form class="visit cform" novalidate data-enquiry data-interest="${interest}" data-what="${esc(what)}">
        <h3>${heading}</h3>
        <div class="field"><label for="${f('Name')}">Name</label><input id="${f('Name')}" name="name" autocomplete="name" placeholder="e.g. Meera Nair" required aria-describedby="${f('NameErr')}"><span class="err" id="${f('NameErr')}" data-err="name"></span></div>
        <div class="field"><label for="${f('Phone')}">Phone number</label><input id="${f('Phone')}" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98xxx xxxxx" required aria-describedby="${f('PhoneErr')}"><span class="err" id="${f('PhoneErr')}" data-err="phone"></span></div>
        ${planField}
        ${extraFields.replace(/@@/g, f(''))}
        <div class="field"><label for="${f('Note')}">Anything we should know? <span class="opt-l">(optional)</span></label><textarea id="${f('Note')}" name="note" maxlength="500" rows="3" placeholder="For example, the best time to call"></textarea></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp-field">
        <div class="err" data-err="form" role="alert"></div>
        <p class="consent">By sending this, you agree that the KareNest team may call you about your enquiry.</p>
        <button class="btn btn-primary" type="submit">Send enquiry${arrow}</button>
      </form>
      <div class="cdone" hidden tabindex="-1">
        <div class="tick"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 25l8 8 16-17"/></svg></div>
        <h3>Thank you!</h3>
        <p data-done-msg>We'll call you soon.</p>
        <div class="row"><a class="btn btn-primary" data-done-app href="/app/#/start" data-app-path="#/start" hidden>Create your account</a><button class="btn btn-ghost" type="button" data-again>Send another</button></div>
      </div>
    </div>
  </div>
</section>`;
  }

  const lcard = ({ href, image, alt, kick, title, text, link = 'Learn More', site }) => `<article class="lcard rv">
  ${image ? `<div class="lcard-img"><img loading="lazy" decoding="async" src="${img(image)}" alt="${esc(alt)}" width="800" height="500"></div>` : ''}
  <div class="lcard-body">${kick ? `<span class="kick">${kick}</span>` : ''}<h3>${title}</h3><p>${text}</p><a class="link-arrow" href="${href}"${site ? ` data-site="${site}"` : ''}>${link}<span class="sr-only">: ${title.replace(/<[^>]+>/g, '')}</span>${ico('arr')}</a></div>
</article>`;

  // ---------- reused sections ----------
  const FOCUS = `<section class="focus" id="focus" aria-labelledby="focus-title">
  <div class="focus-in">
    <div class="focus-photo rv-img"><img loading="lazy" decoding="async" src="${img('yoga.webp')}" alt="A smiling member stretching during outdoor yoga" width="900" height="1100"></div>
    <div class="focus-copy rv">
      <div class="eyebrow">Our focus</div>
      <h2 id="focus-title" style="margin-top:12px"><span class="w1">Health.</span> <span class="w2">Dignity.</span> <span class="w3">Happiness.</span></h2>
      <p class="sub">Everything we do at KareNest is built around three core pillars, helping older adults live healthier lives, with dignity and joy.</p>
    </div>
    <div class="pillars">
      <div class="pillar rv" style="--c:#12917A;--pbg:linear-gradient(160deg,#E6F5EE,#F3FAF7)">
        <div class="pic"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/><path d="M6.5 12h3l1.4-2.5 2 4.5 1.4-2h3.2"/></svg></div>
        <h3>HEALTH</h3>
        <ul><li>${ico('chk')}Wellness &amp; Fitness</li><li>${ico('chk')}Preventive Care</li><li>${ico('chk')}Nutrition &amp; Mental Wellbeing</li></ul>
      </div>
      <div class="pillar rv" style="--c:#7A4CBF;--pbg:linear-gradient(160deg,#EFE8FA,#F8F5FD);--d:.1s">
        <div class="pic"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6M8 10.5l4 1.5 4-1.5M9.5 21l2.5-7 2.5 7"/><path d="M5 16c1.5 1.5 4 2.5 7 2.5s5.5-1 7-2.5"/></svg></div>
        <h3>DIGNITY</h3>
        <ul><li>${ico('chk')}Independence</li><li>${ico('chk')}Respect &amp; Choice</li><li>${ico('chk')}Meaningful Engagement</li></ul>
      </div>
      <div class="pillar rv" style="--c:#D6568C;--pbg:linear-gradient(160deg,#FCE9F1,#FDF5F8);--d:.2s">
        <div class="pic"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg></div>
        <h3>HAPPINESS</h3>
        <ul><li>${ico('chk')}Friendships</li><li>${ico('chk')}Hobbies &amp; Learning</li><li>${ico('chk')}Celebrations &amp; Fun</li></ul>
      </div>
    </div>
  </div>
</section>`;

  const ACTIVITIES = [
    ['a1.webp', 'Group yoga on the lawn', 'Mon–Sat · 10:00 AM', 'Yoga &amp; Fitness', 'Stay active, flexible and energised.'],
    ['a2.webp', 'Members at an arts and crafts table', 'Tue &amp; Fri · 11:15 AM', 'Arts &amp; Crafts', 'Express your creativity.'],
    ['a3.webp', 'A music and cultural gathering', 'Wed · 3:30 PM', 'Music &amp; Cultural Events', 'Celebrate life, together.'],
    ['a4.webp', 'A walking club on a tree-lined path', 'Mon–Sat · 5:30 PM', 'Walking Clubs', 'Fresh air, good company.'],
    ['a5.webp', 'A learning session in a classroom', 'Mon &amp; Thu · 2:00 PM', 'Learning Sessions', 'New skills, new hobbies.'],
    ['a6.webp', 'Friends playing table games', 'Mon–Sat · 4:30 PM', 'Games &amp; Social Moments', 'Because life is better together.']
  ];
  const actCards = (items) => items.map(([f, alt, when, h, p], i) => `<article class="act rv" tabindex="0" style="--d:${(i * 0.06).toFixed(2)}s"><div class="act-img"><img loading="lazy" decoding="async" src="${img(f)}" alt="${alt}" width="600" height="450"><span class="when">${ico('clk')}${when}</span></div><div class="act-body"><h3>${h}</h3><p>${p}</p></div></article>`).join('\n      ');

  const TILES = `<div class="tiles">
      <a class="tile rv" href="${u('/community')}#join"><img loading="lazy" decoding="async" src="${img('c1.webp')}" alt="Friends chatting around a garden table" width="600" height="500"><span class="cap"><b>Make New Friends</b><span class="go">${ico('arr')}</span></span></a>
      <a class="tile rv" href="${u('/community')}#join" style="--d:.08s"><img loading="lazy" decoding="async" src="${img('c2.webp')}" alt="A member playing guitar" width="600" height="500"><span class="cap"><b>Share Your Talents</b><span class="go">${ico('arr')}</span></span></a>
      <a class="tile rv" href="${u('/community')}#join" style="--d:.16s"><img loading="lazy" decoding="async" src="${img('c3.webp')}" alt="Members walking together" width="600" height="500"><span class="cap"><b>Stay Active</b><span class="go">${ico('arr')}</span></span></a>
      <a class="tile rv" href="${u('/community')}#join" style="--d:.24s"><img loading="lazy" decoding="async" src="${img('c4.webp')}" alt="A smiling member in the garden" width="600" height="500"><span class="cap"><b>Be Part of Something Meaningful</b><span class="go">${ico('arr')}</span></span></a>
    </div>`;

  const kbIcons = {
    'kb-base': '<circle cx="12" cy="4.2" r="2"/><path d="M12 6.8v7.4M12 14.2 8.6 21M12 14.2l3.6 2.6M5.5 10h13"/>',
    'kb-plus': '<path d="M7 7l10 10M3.8 10.2l6.4-6.4M13.8 20.2l6.4-6.4M2 12l2-2M20 14l2-2M5.4 13.2l7.8-7.8M10.8 18.6l7.8-7.8"/>',
    'kb-premium': '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>'
  };
  const kbCheck = '<svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
  const kbPlan = (p, i) => `<article class="kb-plan ${['', 'c2', 'c3'][i]}" aria-labelledby="pk-${p.id}">
          <div class="kb-plan-head"><span class="kb-plan-ic"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true">${kbIcons[p.id]}</svg></span><div><h3 class="h4x" id="pk-${p.id}"><a href="${detailHref(p)}">${esc(p.name)}</a></h3><p class="kb-plan-sub">${esc(p.tagline)}</p></div></div>
          <p class="kb-price" data-pp="${p.id}" data-base="${p.price}">${D.rupees(p.price)}</p><p class="kb-unit">${esc(p.unitText)}</p>
          <hr>
          <p class="kb-inc-h">What's included</p>
          <ul class="kb-inc">${p.includes.map((t) => `<li>${kbCheck}<span>${esc(t)}</span></li>`).join('')}</ul>
          <div class="kb-best"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c.8-4 3.5-6 7-6s6.2 2 7 6"/></svg><p><b>Best for:</b> ${esc(p.best)}</p></div>
          <a class="btn btn-primary kb-choose" href="${u('/sign-in')}?plan=${p.id}" data-auth data-plan="${p.id}">${esc(p.cta)}</a>
          <a class="kb-link kb-more" href="${detailHref(p)}">View details<span class="sr-only"> of ${esc(p.name)}</span> <svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></a>
        </article>`;

  // ===================================================================== pages
  const list_ = [];
  const add = (pg) => list_.push(pg);

  // ---------------- Home ----------------
  add({
    key: 'home', path: '/', nav: 'home', preload: 'hero.webp',
    title: 'KareNest', description: 'KareNest is a community in Kochi where ageing is embraced with health, dignity and happiness. Live with us, visit for the day, or join a wellness programme.',
    body: () => `<section class="hero" id="hero">
  <div class="hero-photo" id="heroPhoto"><img src="${img('hero.webp')}" alt="Four KareNest members laughing together on a garden bench" width="1600" height="1000" fetchpriority="high"></div>
  <svg class="sprig" viewBox="0 0 110 170" aria-hidden="true">
    <path d="M30 168C40 120 52 80 92 18"/>
    <path class="lf" style="animation-delay:1.4s,0s" d="M46 112c-22-4-34-18-36-34 18 2 32 14 36 34z"/>
    <path class="lf" style="animation-delay:1.6s,-1s" d="M56 90c4-22 20-34 38-34-2 18-16 32-38 34z"/>
    <path class="lf" style="animation-delay:1.8s,-2s" d="M68 62c-18-8-26-24-24-40 16 6 26 20 24 40z"/>
    <path class="lf" style="animation-delay:2s,-3s" d="M80 40c6-18 20-26 30-26-4 16-16 26-30 26z"/>
  </svg>
  <div class="glass g1" aria-hidden="true"><div class="ic" style="background:var(--g-soft);color:var(--teal)">${ico('yoga')}</div><div><b>Yoga on the lawn</b><span class="live">Mon to Sat · 10:00 AM</span></div></div>
  <div class="glass g2" aria-hidden="true"><div class="ic" style="background:var(--r-soft);color:var(--rose)">${ico('heart')}</div><div><b>Update sent to family</b><span>“Amma loved the music hour”</span></div></div>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <div class="eyebrow">KareNest</div>
      <h1>
        <span class="ln"><span>Live Well.</span></span>
        <span class="ln"><span>Stay Connected.</span></span>
        <span class="ln"><span class="violet">Keep Growing.</span></span>
      </h1>
      <p class="lede">A community where ageing is embraced with Health, Dignity &amp; Happiness.</p>
      <div class="hero-actions">
        <a class="btn btn-primary mag" href="${u('/packages')}">Explore Our Packages${arrow}</a>
        ${visitBtn()}
        <a class="btn btn-ghost mag" href="${u('/community')}#join">${ico('ppl')}Join Our Community</a>
      </div>
    </div>
  </div>
  <a class="scroll-cue" href="#experience" aria-label="Scroll to the next section"></a>
</section>

<section class="sec" id="experience" aria-labelledby="exp-title">
  <div class="wrap exp">
    <div class="rv">
      <h2 class="h2" id="exp-title">How would you like to experience <span class="kn">KareNest?</span></h2>
      <p class="sub">Whether you want to live with us, visit for the day, or look after your health and wellbeing, there's a place for you in our community.</p>
    </div>
    <div class="xcards">
      <article class="xcard tilt rv">
        <div class="xmedia"><img loading="lazy" decoding="async" src="${img('exp1.webp')}" alt="A resident couple chatting in the garden" width="600" height="400"><div class="xicon"><svg class="ico" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 19 20 7l14 12"/><path d="M10 16v17h20V16"/><path d="M17 33v-8h6v8"/></svg></div></div>
        <div class="xbody"><h3>Live With Us</h3><p>For active living, support, care and a vibrant community.</p><a class="link-arrow" href="${u('/live-with-us')}">Learn More<span class="sr-only"> about living with us</span>${ico('arr')}</a></div>
      </article>
      <article class="xcard tilt rv" style="--d:.1s">
        <div class="xmedia"><img loading="lazy" decoding="async" src="${img('exp2.webp')}" alt="Day visitors joining a group session" width="600" height="400"><div class="xicon" style="color:var(--teal)"><svg class="ico" viewBox="0 0 40 40" aria-hidden="true"><path d="M10 31C10 17 18 9 32 8c0 14-8 23-22 23Z"/><path d="M10 31 24 17M16 25h5M20 21v-5"/></svg></div></div>
        <div class="xbody"><h3>Visit &amp; Participate</h3><p>Join activities, wellness programmes and community experiences during the day.</p><a class="link-arrow" href="${u('/visit-and-participate')}">Learn More<span class="sr-only"> about visitor passes</span>${ico('arr')}</a></div>
      </article>
      <article class="xcard tilt rv" style="--d:.2s">
        <div class="xmedia"><img loading="lazy" decoding="async" src="${img('a1.webp')}" alt="Members doing yoga together on the lawn" width="600" height="400"><div class="xicon" style="color:var(--violet)"><svg class="ico" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 32C8 18 17 9 32 8c0 15-9 24-24 24Z"/><path d="M8 32 22 18"/><circle cx="27" cy="27" r="5"/></svg></div></div>
        <div class="xbody"><h3>Wellness</h3><p>Personalised programmes for balance, mobility and mental wellbeing: KareBalance and KareMind.</p><a class="link-arrow" href="${u('/wellness')}">Learn More<span class="sr-only"> about wellness programmes</span>${ico('arr')}</a></div>
      </article>
    </div>
  </div>
</section>

${FOCUS.replace('</section>', `  <div class="wrap" style="padding-bottom:40px"><a class="link-arrow" href="${u('/about')}">More about KareNest${ico('arr')}</a></div>\n</section>`)}

<section class="sec" id="glance" aria-labelledby="glance-title">
  <div class="wrap">
    <div class="head-row rv">
      <div><div class="eyebrow">Our packages</div><h2 class="h2" id="glance-title" style="margin-top:12px">Choose the way that suits you</h2><p class="sub">Resident living, flexible visitor passes and focused wellness programmes. Every price is shown up front.</p></div>
      <a class="link-arrow" href="${u('/packages')}">Compare all packages${ico('arr')}</a>
    </div>
    <div class="lcards">
      ${lcard({ href: u('/live-with-us'), image: 'exp1.webp', alt: 'A resident couple in the KareNest garden', kick: `From ${D.rupees(55000)} / month`, title: 'Live With Us', text: 'KarePlus shared living or a KarePremium private room, with meals, a diet plan and a Kare@Home check-up plan included.', link: 'See resident packages' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'exp2.webp', alt: 'Visitors joining a group session', kick: `From ${D.rupees(1499)} / day`, title: 'Visit &amp; Participate', text: 'Bloom for a day, Flourish for a week or Thrive for a month: activities, meals and friendship, all-inclusive.', link: 'See visitor passes' })}
      ${lcard({ href: u('/wellness'), image: 'yoga.webp', alt: 'A balance and stretching session on the lawn', kick: `From ${D.rupees(7999)}`, title: 'Wellness', text: 'KareBalance for steadier steps and fewer falls, and KareMind for emotional wellbeing.', link: 'See wellness programmes' })}
    </div>
  </div>
</section>

<section class="sec" id="discover" style="padding-top:0" aria-labelledby="disc-title">
  <div class="wrap">
    <div class="head-row rv">
      <div><h2 class="h2" id="disc-title" style="color:var(--blue)">Discover What Awaits You</h2><p class="sub" style="margin-top:8px">Activities, wellness, learning, and more, designed for happier, healthier days.</p></div>
      <a class="link-arrow" href="${u('/activities')}">View All Activities${ico('arr')}</a>
    </div>
    <div class="acts acts-3">
      ${actCards(ACTIVITIES.slice(0, 3))}
    </div>
  </div>
</section>

<section class="sec" id="families-teaser" style="padding-top:0" aria-label="For families and our community">
  <div class="wrap duo">
    <div class="fam rv">
      <div class="fam-photo rv-img"><img loading="lazy" decoding="async" src="${img('fam.webp')}" alt="A grandmother and granddaughter arranging flowers together" width="700" height="700"><span class="heart">${ico('heart', 'ico', ' style="width:20px;height:20px;fill:currentColor;stroke:none"')}</span></div>
      <div class="fam-copy">
        <span class="kick">For Families</span>
        <h2>Peace of Mind, Always.</h2>
        <p>Stay connected, get regular updates, and know your loved ones are safe, healthy and happy, wherever they live with us or visit for the day.</p>
        <a class="btn btn-primary mag" href="${u('/families')}">Learn How We Keep You Connected${arrow}</a>
      </div>
    </div>
    <div class="hl comm-card rv" style="--d:.1s">
      <div class="hl-head"><div><h3>More Than Activities. A Community.</h3><p>KareNest is not just a place. It's a family of caregivers, staff and members, all connected in a shared journey of care, purpose and joy.</p></div></div>
      <div class="mini-tiles">
        <img loading="lazy" decoding="async" src="${img('c1.webp')}" alt="Friends chatting around a garden table" width="300" height="250">
        <img loading="lazy" decoding="async" src="${img('c2.webp')}" alt="A member playing guitar" width="300" height="250">
        <img loading="lazy" decoding="async" src="${img('c3.webp')}" alt="Members walking together" width="300" height="250">
      </div>
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><a class="btn btn-primary" href="${u('/community')}#join">${ico('ppl')}Join Our Community</a><a class="btn btn-ghost" href="${u('/life')}">Life at KareNest${arrow}</a></div>
    </div>
  </div>
</section>

<section class="sec fit" id="fit" style="padding-top:10px" aria-labelledby="fit-title">
  <div class="wrap">
    <div class="fit-card rv">
      <div class="fit-side">
        <div>
          <div class="eyebrow">Find your fit</div>
          <h2 id="fit-title" style="margin-top:12px">Which KareNest experience suits you?</h2>
          <p>Three quick questions, under a minute. No sign-up needed.</p>
        </div>
        <div class="fit-head"><img loading="lazy" decoding="async" src="${img('head.webp')}" alt="" width="64" height="64"><span id="fitSays">I'll help you choose!</span></div>
      </div>
      <div class="fit-main" id="fitMain" aria-live="polite"></div>
    </div>
  </div>
</section>

<section class="cta" id="find-your-place" aria-labelledby="cta-title">
  <div class="cta-top" aria-hidden="true"></div>
  <div class="cta-band" id="ctaBand">
    <div class="cta-bg"><img loading="lazy" decoding="async" src="${img('garden.webp')}" alt="" width="1600" height="700"></div>
    <div class="wrap" style="width:100%">
      <div class="cta-copy rv">
        <h2 id="cta-title">Find Your Place at KareNest</h2>
        <p>Whether you prefer the companionship of shared living, the privacy of your own room or the flexibility of a visitor pass, KareNest welcomes you.</p>
        <p class="tag-line">KareNest — Where Care Feels Like Home.</p>
        <div class="hero-actions">
          <a class="btn btn-white mag" href="${u('/live-with-us')}">${ico('home')}Explore Resident Living</a>
          <a class="btn btn-ghost mag" href="${u('/visit-and-participate')}">${ico('cal')}Explore Visitor Passes</a>
        </div>
      </div>
    </div>
    <div class="bubble hide" id="bubble" role="status" aria-live="polite"></div>
    <button class="buddy" id="buddy" type="button" aria-label="Talk to Nestu, the KareNest guide">
      <span class="shadow"></span>
      <span class="body" id="buddyBody"><img loading="lazy" decoding="async" src="${img('mascot.webp')}" alt="" width="500" height="1100"></span>
    </button>
    <div class="cta-wave" aria-hidden="true">
      <svg class="w2" viewBox="0 0 2880 70" preserveAspectRatio="none"><path d="M0 40C240 10 480 66 720 40s480-56 720-26 480 56 720 26 480-56 720-26V70H0Z" fill="#E9DDF5"/></svg>
      <svg viewBox="0 0 2880 70" preserveAspectRatio="none"><path d="M0 52C240 30 480 70 720 52s480-40 720-20 480 40 720 20 480-40 720-20V70H0Z" fill="#fff"/></svg>
    </div>
  </div>
</section>`
  });

  // ---------------- About ----------------
  add({
    key: 'about', path: '/about', nav: 'about',
    title: 'About KareNest', description: 'KareNest is a community in Kochi, Kerala, built around three pillars: health, dignity and happiness. Learn how you can be part of it.',
    body: () => `${hero({
      crumbs: [HOME, ['About KareNest']], eyebrow: 'About KareNest',
      h1: 'A community where ageing is embraced with <span class="accent">Health</span>, <span class="violet">Dignity &amp; Happiness</span>.',
      lede: "KareNest is not just a place. It's a family of caregivers, staff and members, all connected in a shared journey of care, purpose and joy.",
      actions: `<a class="btn btn-primary mag" href="${u('/packages')}">Explore Our Packages${arrow}</a>${visitBtn()}`,
      image: 'c4.webp', alt: 'A smiling KareNest member in the garden', caption: `${ico('pin')}Kochi, Kerala · Mon to Sat, 9:30 AM – 6:00 PM`
    })}

${FOCUS}

<section class="sec" aria-labelledby="ways-title">
  <div class="wrap">
    <div class="sec-head rv"><div class="eyebrow">Three ways to be part of KareNest</div><h2 class="h2" id="ways-title" style="margin-top:12px">Live with us, visit for the day, or stay connected</h2><p class="sub">Whether you want to live with us, visit for the day, or simply stay connected, there's a place for you in our community.</p></div>
    <div class="lcards">
      ${lcard({ href: u('/live-with-us'), image: 'exp1.webp', alt: 'A resident couple chatting in the garden', title: 'Live With Us', text: 'For active living, support, care and a vibrant community.' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'exp2.webp', alt: 'Day visitors joining a group session', title: 'Visit &amp; Participate', text: 'Join activities, wellness programmes and community experiences during the day.' })}
      ${lcard({ href: u('/community'), image: 'exp3.webp', alt: 'A member staying in touch on his phone', title: 'Join Our Community', text: 'For seniors, families and caregivers who want to stay connected with KareNest.' })}
    </div>
  </div>
</section>

<section class="sec sec-alt" aria-labelledby="where-title">
  <div class="wrap">
    <div class="sec-head rv"><div class="eyebrow">Visit us</div><h2 class="h2" id="where-title" style="margin-top:12px">Where and when to find us</h2></div>
    <ul class="facts rv">
      <li><span class="ci">${ico('pin')}</span><span><b>Where</b>Kochi, Kerala</span></li>
      <li><span class="ci">${ico('clk')}</span><span><b>Open</b>Monday to Saturday, 9:30 AM to 6:00 PM</span></li>
      <li><span class="ci">${ico('mail')}</span><span><b>Email</b><a href="mailto:hello@karenest.in">hello@karenest.in</a></span></li>
    </ul>
    <div class="family-band rv" style="margin-top:28px">
      <img loading="lazy" decoding="async" src="${img('kareiq.webp')}" alt="KareIQ" width="140" height="44">
      <div><h2>A brand by KareIQ</h2><p>KareNest is part of the KareIQ family, alongside Kare@Home. Our resident packages include a Kare@Home preventive check-up plan.</p></div>
      <div class="row"><a class="btn btn-ghost" href="${L.kareiq}" data-site="kareiq">Visit KareIQ${arrow}</a><a class="btn btn-ghost" href="https://kareiq-website-full.vercel.app/kare-at-home" data-site="karehome">Visit Kare@Home${arrow}</a></div>
    </div>
  </div>
</section>`
  });

  // ---------------- Life at KareNest ----------------
  add({
    key: 'life', path: '/life', nav: 'life',
    title: 'Life at KareNest', description: 'A day at KareNest, Monday to Saturday, 9:30 AM to 6:00 PM: yoga, crafts, shared meals, music, games and the walking club, plus upcoming community events.',
    body: () => `${hero({
      crumbs: [HOME, ['Life at KareNest']], eyebrow: 'Life at KareNest',
      h1: 'Every hour has <span class="accent">something to look forward to</span>',
      lede: "We're open Monday to Saturday, 9:30 AM to 6:00 PM. Yoga on the lawn, home-style Kerala lunches, music, games and an evening walk through the garden.",
      actions: `${visitBtn('btn btn-primary mag', 'Plan a Visit')}<a class="btn btn-ghost mag" href="#events">Upcoming events${arrow}</a>`,
      image: 'c3.webp', alt: 'KareNest members walking together in the garden'
    })}

<section class="sec day" id="day" aria-labelledby="day-title">
  <div class="wrap day-grid">
    <div class="day-stage rv" id="dayStage">
      <div class="clock" aria-hidden="true"><i class="hh" id="hh"></i><i class="mm" id="mm"></i></div>
      <div class="day-cap" aria-live="polite"><span class="badge" id="dayBadge">Up next</span><p class="day-title" id="dayTitle">Yoga on the lawn</p><p id="dayText"></p></div>
    </div>
    <div class="rv" style="--d:.1s">
      <div class="eyebrow">A day at KareNest</div>
      <h2 class="h2" id="day-title" style="margin-top:12px">What a day with us <span class="grad-text">looks like</span></h2>
      <p class="sub">Tap a time to see what's happening.</p>
      <ul class="times" id="times"><span class="fill" id="dayFill"></span></ul>
      <div class="day-ctrl"><button type="button" id="dayPrev" aria-label="Previous time"><svg class="ico" style="transform:rotate(180deg)" aria-hidden="true"><use href="#arr"/></svg></button><button type="button" id="dayNext" aria-label="Next time"><svg class="ico" aria-hidden="true"><use href="#arr"/></svg></button><span id="dayNow"></span></div>
    </div>
  </div>
</section>

<section class="sec" id="events" style="padding-top:0" aria-labelledby="ev-title">
  <div class="wrap">
    <div class="hl rv">
      <div class="hl-head">
        <div><h2 class="h3x" id="ev-title">Community Highlights</h2><p>Events, workshops, wellness programmes and more.</p></div>
        <a class="link-arrow" href="${u('/activities')}">See all activities${ico('arr')}</a>
      </div>
      <div class="next" id="next"><span class="lbl">Next up · <b id="nextName">—</b></span><div class="cd" aria-hidden="true"><span><b id="cdD">00</b><small>days</small></span><span><b id="cdH">00</b><small>hrs</small></span><span><b id="cdM">00</b><small>min</small></span><span><b id="cdS">00</b><small>sec</small></span></div></div>
      <div class="evs" id="evs"></div>
    </div>
  </div>
</section>

<section class="sec sec-tint" aria-labelledby="life-ways">
  <div class="wrap">
    <div class="sec-head center rv"><h2 class="h2" id="life-ways">Come and be part of it</h2><p class="sub">Spend a day with us, come for a week or a month, or make KareNest your home.</p></div>
    <div class="lcards">
      ${lcard({ href: u('/visit-and-participate/bloom'), image: 'exp2.webp', alt: 'Visitors joining a session', kick: `${D.rupees(1499)} / day`, title: 'Try a day with Bloom', text: 'Ideal for first-time visitors who want to experience KareNest and enjoy a day of activities, meals and social interaction.', link: 'See KareNest Bloom' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'a4.webp', alt: 'A walking club on a tree-lined path', kick: 'Weekly and monthly passes', title: 'Make it part of your routine', text: 'Flourish for a week or Thrive for a month, with yoga, training programmes, meals and friendship.', link: 'See visitor passes' })}
      ${lcard({ href: u('/live-with-us'), image: 'exp1.webp', alt: 'A resident couple in the garden', kick: 'Resident living', title: 'Live With Us', text: 'For active living, support, care and a vibrant community.', link: 'See resident packages' })}
    </div>
  </div>
</section>`
  });

  // ---------------- Activities & Wellness ----------------
  add({
    key: 'activities', path: '/activities', nav: 'activities', lightbox: true,
    title: 'Activities & Wellness', description: 'Yoga and fitness, arts and crafts, music and cultural events, walking clubs, learning sessions and games at KareNest, plus KareBalance and KareMind wellness programmes.',
    body: () => `${hero({
      crumbs: [HOME, ['Activities &amp; Wellness']], eyebrow: 'Activities &amp; Wellness',
      h1: 'Discover <span class="accent">What Awaits You</span>',
      lede: 'Activities, wellness, learning, and more, designed for happier, healthier days. Monday to Saturday, 9:30 AM to 6:00 PM.',
      actions: `${visitBtn('btn btn-primary mag')}<a class="btn btn-ghost mag" href="${u('/visit-and-participate')}">See visitor passes${arrow}</a>`,
      image: 'a1.webp', alt: 'A group yoga session on the KareNest lawn', caption: `${ico('clk')}Yoga on the lawn · Mon to Sat, 10:00 AM`
    })}

<section class="sec" id="all-activities" aria-labelledby="acts-title">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="acts-title" style="color:var(--blue)">Something for every day</h2><p class="sub">Tap any activity to see more.</p></div>
    <div class="acts">
      ${actCards(ACTIVITIES)}
    </div>
  </div>
</section>

<section class="sec sec-tint" aria-labelledby="wp-title">
  <div class="wrap">
    <div class="sec-head rv"><div class="eyebrow">Wellness programmes</div><h2 class="h2" id="wp-title" style="margin-top:12px">Personal programmes, with professionals</h2><p class="sub">Alongside everyday activities, two structured programmes look after balance, mobility and mental wellbeing.</p></div>
    <div class="lcards">
      ${lcard({ href: u('/karebalance'), image: 'yoga.webp', alt: 'A balance and stretching session on the lawn', kick: 'From ' + D.rupees(7999), title: 'KareBalance', text: 'Better Balance. Stronger Steps. Fewer Falls. A personalised fall prevention and mobility programme.', link: 'Explore KareBalance' })}
      ${lcard({ href: u('/karemind'), image: 'c1.webp', alt: 'Friends chatting at a garden table', kick: 'From ' + D.rupees(8999), title: 'KareMind', text: 'Nurture Your Mind. Enhance Your Wellbeing. A structured mental wellness program, personal and compassionate.', link: 'Explore KareMind' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'a5.webp', alt: 'A learning session in a classroom', kick: 'Included in every visitor pass', title: 'Yoga, training &amp; social activities', text: 'Scheduled yoga classes and monitored activities, access to included training programmes, and recreation with friends.', link: 'See what passes include' })}
    </div>
  </div>
</section>`
  });

  // ---------------- Our Packages ----------------
  const allPlanIds = D.packages.map((p) => p.id);
  add({
    key: 'packages', path: '/packages', nav: 'packages', sub: 'packages',
    title: 'Our Packages', description: 'All KareNest packages and prices: KarePlus and KarePremium resident living, Bloom, Flourish and Thrive visitor passes, and KareBalance and KareMind wellness programmes.',
    body: () => `${hero({
      crumbs: [HOME, ['Our Packages']], eyebrow: 'Our Packages', solo: true,
      h1: 'Find the package that <span class="accent">fits your life</span>',
      lede: 'Live with us, visit and take part, or join a wellness programme. Choose a package to see everything it includes, or send us an enquiry and we\'ll help you decide.',
      actions: `<a class="btn btn-primary mag" href="#live">Live With Us</a><a class="btn btn-ghost mag" href="#visit">Visit &amp; Participate</a><a class="btn btn-ghost mag" href="#wellness">Wellness</a>`
    })}

<section class="sec" style="padding-top:20px" aria-label="All packages">
  <div class="wrap">
    <section class="pgroup rv" id="live" aria-labelledby="g-live">
      <div class="pgroup-head"><div><div class="eyebrow">Resident living</div><h2 id="g-live" style="margin-top:8px">Live With Us</h2><p>${esc(G.live.short)} ${esc(D.GST_LIVE)}</p></div><a class="link-arrow" href="${u('/live-with-us')}">Compare resident packages${ico('arr')}</a></div>
      <div class="pkgs two">${D.byGroup('live').map((p) => pkgCard(p, { compact: true })).join('')}</div>
    </section>
    <section class="pgroup rv" id="visit" aria-labelledby="g-visit">
      <div class="pgroup-head"><div><div class="eyebrow">Visitor passes</div><h2 id="g-visit" style="margin-top:8px">Visit &amp; Participate</h2><p>Join KareNest for a day, a week or a month. ${esc(D.GST_VISIT)}</p></div><a class="link-arrow" href="${u('/visit-and-participate')}">See what every pass includes${ico('arr')}</a></div>
      <div class="pkgs">${D.byGroup('visit').map((p) => pkgCard(p, { compact: true })).join('')}</div>
    </section>
    <section class="pgroup rv" id="wellness" aria-labelledby="g-well">
      <div class="pgroup-head"><div><div class="eyebrow">Wellness</div><h2 id="g-well" style="margin-top:8px">Wellness programmes</h2><p>Structured programmes for balance and mobility, and for emotional wellbeing.</p></div><a class="link-arrow" href="${u('/wellness')}">About our wellness programmes${ico('arr')}</a></div>
      <h3 class="psub"><a href="${u('/karebalance')}">KareBalance · Fall prevention &amp; mobility</a></h3>
      <div class="pkgs">${D.byGroup('karebalance').map((p) => pkgCard(p, { compact: true, level: 4 })).join('')}</div>
      <h3 class="psub"><a href="${u('/karemind')}">KareMind · Mental wellness</a></h3>
      <div class="pkgs">${D.byGroup('karemind').map((p) => pkgCard(p, { compact: true, level: 4 })).join('')}</div>
    </section>
  </div>
</section>

${enquiry({ title: 'Not sure which package is right?', lede: 'Tell us a little about what you\'re looking for and our team will call you to talk it through.', interest: 'karenest-general', plans: allPlanIds, what: 'package', points: ['Resident living, visitor passes and wellness programmes', 'Honest advice on what each package includes', 'Monday to Saturday, 9:30 AM to 6:00 PM'] })}`
  });

  // ---------------- Live With Us ----------------
  add({
    key: 'live', path: '/live-with-us', nav: 'packages', sub: 'live',
    title: 'Live With Us: KarePlus and KarePremium', description: 'Resident living at KareNest: KarePlus shared living at ₹55,000 a month and KarePremium private rooms at ₹99,000 a month, inclusive of 18% GST.',
    body: () => `${hero({
      crumbs: [HOME, PKGS, ['Live With Us']], eyebrow: 'Live With Us · Resident living',
      h1: 'A home with <span class="accent">care</span> and <span class="violet">community</span> around you',
      lede: 'For active living, support, care and a vibrant community. Choose shared living with KarePlus, or the privacy of your own room with KarePremium.',
      actions: `<a class="btn btn-primary mag" href="#packages">See the packages${arrow}</a><a class="btn btn-ghost mag" href="#enquire" data-enquire="">Enquire${arrow}</a>`,
      image: 'exp1.webp', alt: 'A resident couple chatting in the KareNest garden', caption: `${ico('home')}Meals, diet plan and a Kare@Home check-up plan included`
    })}

<section class="sec" id="packages" style="padding-top:30px" aria-labelledby="live-pk">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="live-pk">Resident packages</h2><p class="sub">${esc(D.GST_LIVE)}</p></div>
    <div class="pkgs two">${D.byGroup('live').map((p) => pkgCard(p)).join('')}</div>
    ${compare(D.liveCompare, { sub: 'Place the two packages side by side and see exactly what your monthly price covers.' })}
    ${notIncluded()}
  </div>
</section>

${enquiry({ title: 'Ask about living with us', lede: 'Choose a package, leave your number, and our team will call you to talk about rooms, availability and a visit.', interest: 'karenest-live', plans: ['kareplus', 'karepremium'], what: 'living with us', points: ['Air-conditioned twin-sharing or single-occupancy rooms', 'Five daily food and beverage services and a personalized diet plan', 'Kare@Home preventive check-up plan included'] })}`
  });

  // ---------------- Visit & Participate ----------------
  add({
    key: 'visit', path: '/visit-and-participate', nav: 'packages', sub: 'visit',
    title: 'Visit & Participate: visitor passes', description: 'KareNest visitor passes: Bloom ₹1,499 a day, Flourish ₹8,499 a week and Thrive ₹24,999 a month. All-inclusive with activities, yoga, meals and community.',
    body: () => `${hero({
      crumbs: [HOME, PKGS, ['Visit &amp; Participate']], eyebrow: 'Visit &amp; Participate · Visitor passes',
      h1: 'Your Community. <span class="accent">Your Routine.</span> <span class="violet">Your Well-being.</span>',
      lede: 'Join KareNest for a day, a week or a month. Enjoy wellness activities, nutritious meals, meaningful connections and a welcoming space to make every day count.',
      actions: `<a class="btn btn-primary mag" href="#passes">See the passes${arrow}</a>${visitBtn()}`,
      image: 'exp2.webp', alt: 'Day visitors joining a group session at KareNest', caption: `${ico('clk')}Mon to Sat · 9:30 AM – 6:00 PM`
    })}

<section class="sec" id="passes" style="padding-top:30px" aria-labelledby="passes-t">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="passes-t">Choose your pass</h2><p class="sub">Every pass is all-inclusive.</p></div>
    <div class="pkgs">${D.byGroup('visit').map((p) => pkgCard(p)).join('')}</div>
  </div>
</section>

<section class="sec sec-tint" id="included" aria-labelledby="inc-t">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="inc-t">What's included in every visitor pass?</h2></div>
    <div class="rv">${feats(D.passIncludes)}</div>
    <p class="foot-note">${esc(D.GST_VISIT)}</p>
  </div>
</section>

${enquiry({ title: 'Choose your pass', lede: 'Pick a pass and tell us when you\'d like to start. Our team will call you to confirm the details.', interest: 'karenest-pass', plans: ['bloom', 'flourish', 'thrive'], what: 'visitor pass', planLabel: 'Visitor pass',
    extraFields: '<div class="field"><label for="@@Start">Preferred start date <span class="opt-l">(optional)</span></label><input id="@@Start" name="start" type="date" data-msg="Preferred start date" data-min-today></div>',
    points: ['Community access, yoga, training programmes and social activities', 'Morning refreshments, a balanced lunch and evening tea with snacks', 'Monday to Saturday, 9:30 AM to 6:00 PM'] })}`
  });

  // ---------------- Wellness ----------------
  add({
    key: 'wellness', path: '/wellness', nav: 'packages', sub: 'wellness',
    title: 'Wellness programmes', description: 'KareNest wellness: KareBalance for fall prevention and mobility, KareMind for mental wellbeing, and everyday yoga and activities.',
    body: () => `${hero({
      crumbs: [HOME, PKGS, ['Wellness']], eyebrow: 'Wellness',
      h1: 'Look after your <span class="accent">body</span> and your <span class="violet">mind</span>',
      lede: 'Wellness & fitness, preventive care, nutrition and mental wellbeing sit at the heart of KareNest. Our structured programmes give you personal support from qualified professionals.',
      actions: `<a class="btn btn-primary mag" href="${u('/karebalance')}">KareBalance${arrow}</a><a class="btn btn-ghost mag" href="${u('/karemind')}">KareMind${arrow}</a>`,
      image: 'yoga.webp', alt: 'A smiling member stretching during outdoor yoga'
    })}

<section class="sec" style="padding-top:30px" aria-labelledby="well-t">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="well-t">Our wellness programmes</h2></div>
    <div class="well-grid">
      <article class="well rv">
        <div class="well-img"><img loading="lazy" decoding="async" src="${img('a4.webp')}" alt="KareNest members out for a group walk in the garden" width="800" height="450"></div>
        <div class="well-body">
          <span class="eyebrow">Fall prevention &amp; mobility</span>
          <h3 class="h2x"><a href="${u('/karebalance')}">KareBalance</a></h3>
          <p>${esc(G.karebalance.short)}</p>
          <div class="tiers">${D.byGroup('karebalance').map((p) => `<span>${esc(p.name.replace('KareBalance ', ''))} · <span data-ppt="${p.id}">${D.rupees(p.price)}</span></span>`).join('')}</div>
          <div class="row"><a class="btn btn-primary" href="${u('/karebalance')}">Explore KareBalance${arrow}</a><a class="btn btn-ghost" href="${u('/karebalance')}#enquire">Book a Consultation</a></div>
        </div>
      </article>
      <article class="well rv" style="--d:.1s">
        <div class="well-img"><img loading="lazy" decoding="async" src="${img('c1.webp')}" alt="Friends chatting together around a garden table" width="800" height="450"></div>
        <div class="well-body">
          <span class="eyebrow">Mental wellbeing</span>
          <h3 class="h2x"><a href="${u('/karemind')}">KareMind</a></h3>
          <p>Nurture Your Mind. Enhance Your Wellbeing. ${esc(G.karemind.short)}</p>
          <div class="tiers">${D.byGroup('karemind').map((p) => `<span>${esc(p.name.replace('KareMind ', ''))} · <span data-ppt="${p.id}">${D.rupees(p.price)}</span></span>`).join('')}</div>
          <div class="row"><a class="btn btn-primary" href="${u('/karemind')}">Explore KareMind${arrow}</a><a class="btn btn-ghost" href="${u('/karemind')}#enquire">Enquire</a></div>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="sec sec-tint" aria-labelledby="every-t">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="every-t">Everyday wellness at KareNest</h2><p class="sub">Wellness is part of every day here, not only a programme.</p></div>
    <div class="lcards">
      ${lcard({ href: u('/activities'), image: 'a1.webp', alt: 'Group yoga on the lawn', title: 'Yoga &amp; activities', text: 'Yoga on the lawn, walking clubs, learning sessions and more, Monday to Saturday.', link: 'See activities' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'exp2.webp', alt: 'Visitors joining a session', title: 'Visitor passes', text: 'Every pass includes scheduled yoga classes, monitored activities and access to included training programmes.', link: 'See visitor passes' })}
      ${lcard({ href: 'https://kareiq-website-full.vercel.app/kare-at-home', site: 'karehome', image: 'fam.webp', alt: 'A grandmother and granddaughter together', title: 'Preventive check-ups with Kare@Home', text: 'Our resident packages include a Kare@Home preventive check-up plan: HomeStart with KarePlus, HomePlus with KarePremium.', link: 'Visit Kare@Home' })}
    </div>
  </div>
</section>`
  });

  // ---------------- KareBalance ----------------
  const kb = D.byGroup('karebalance');
  add({
    key: 'karebalance', path: '/karebalance', nav: 'packages', sub: 'karebalance', kb: true,
    title: 'KareBalance: fall prevention & mobility', description: 'KareBalance is a personalised fall prevention and mobility programme for older adults. Base ₹7,999, Plus ₹39,999, Premium ₹90,000.',
    body: () => `<section class="kb" id="karebalance" aria-labelledby="kb-title">
    <div class="wrap">
      ${crumbs([HOME, PKGS, WELL, ['KareBalance']])}
      <div class="kb-intro">
        <div class="kb-copy rv">
          <span class="kb-eyebrow">KareBalance</span>
          <h1 class="kb-title" id="kb-title"><span>Better Balance.</span><span>Stronger Steps.</span><span>Fewer Falls.</span></h1>
          <p class="kb-lead">A personalised fall prevention and mobility programme that helps older adults stay steady, active, and independent.</p>
          <div class="kb-ctas">
            <a class="btn btn-primary mag" href="#enquire" data-enquire="">${ico('cal')}Book a Consultation</a>
            <a class="kb-link" href="#kb-plans">See programmes &amp; pricing <svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></a>
          </div>
        </div>
        <figure class="kb-photo rv-img">
          <img src="${img('yoga.webp')}" alt="KareNest members doing a balance and stretching session on the lawn" width="900" height="640" fetchpriority="high">
          <figcaption class="kb-note">Stay active.<br>Stay independent.</figcaption>
        </figure>
      </div>

      <div class="rv">
        <h2 class="kb-h">How KareBalance Helps</h2>
        <ul class="kb-helps">
          <li class="kb-help" style="--c:var(--kb-c1)"><span class="kb-badge"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.2" r="2"/><path d="M12 6.8v7.4M12 14.2 8.6 21M12 14.2l3.6 2.6M5.5 10h13"/></svg></span><h3 class="h4x">Improve Balance &amp; Stability</h3><p>Build better control while standing, turning and walking.</p></li>
          <li class="kb-help" style="--c:var(--kb-c2)"><span class="kb-badge"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M3.8 10.2l6.4-6.4M13.8 20.2l6.4-6.4M2 12l2-2M20 14l2-2M5.4 13.2l7.8-7.8M10.8 18.6l7.8-7.8"/></svg></span><h3 class="h4x">Build Strength</h3><p>Strengthen leg and core muscles for everyday activities.</p></li>
          <li class="kb-help" style="--c:var(--kb-c1d)"><span class="kb-badge"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13.5" cy="4" r="2"/><path d="M11 21l2.2-6.2-2.6-3 1.1-4.8 3 2.9 3 1.1M10.6 11.8 7.4 14M13.2 14.8 15.6 21"/></svg></span><h3 class="h4x">Move with Confidence</h3><p>Practise walking, stair climbing and sit-to-stand transitions.</p></li>
          <li class="kb-help" style="--c:var(--kb-c3)"><span class="kb-badge"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.9-3.4 8.1-8 9-4.6-.9-8-4.1-8-9V6l8-3Z"/><path d="M8.6 12.6 12 9.6l3.4 3V16H8.6v-3.4Z"/></svg></span><h3 class="h4x">Identify Fall Risks</h3><p>Assess personal risk factors, medication-related concerns and home safety hazards.</p></li>
          <li class="kb-help" style="--c:var(--kb-c5)"><span class="kb-badge"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3"/><path d="M2.8 20c.5-3.6 2.9-5.6 5.7-5.6s5.2 2 5.7 5.6"/><circle cx="17" cy="9.2" r="2.4"/><path d="M15.6 14.7c2.7.1 4.6 1.9 5.4 5"/></svg></span><h3 class="h4x">Stay Independent</h3><p>Develop safer movement habits and confidence in daily life.</p></li>
        </ul>
      </div>

      <div class="kb-for rv">
        <div class="kb-for-media"><img src="${img('a4.webp')}" alt="KareNest members out for a group walk in the garden" loading="lazy" decoding="async" width="700" height="520"></div>
        <div class="kb-for-body">
          <h2 class="kb-h">Who Is KareBalance For?</h2>
          <p class="kb-for-lead">KareBalance is designed for older adults who:</p>
          <ul class="kb-checks">
            ${['Have experienced a fall or near-fall.', 'Fear falling and have started avoiding everyday activities.', 'Feel unsteady while walking, turning or climbing stairs.', 'Are recovering mobility after an illness, hospitalisation or a period of inactivity.', 'Have reduced leg strength, balance or mobility.', 'Want to maintain their balance, strength and independence as they age.'].map((t) => `<li>${kbCheck}<span>${t}</span></li>`).join('\n            ')}
          </ul>
        </div>
      </div>

      <div id="kb-plans" class="rv">
        <h2 class="kb-h">Our Programmes &amp; Pricing</h2>
        <p class="kb-sub">Choose the right level of support for your needs and goals.</p>
      </div>
      <div class="kb-plans rv">
        ${kb.map(kbPlan).join('\n        ')}
      </div>

      <div class="kb-band rv">
        <span class="kb-band-ic"><svg class="kb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><path d="M2.5 20v-2.5A4.5 4.5 0 0 1 7 13a4.5 4.5 0 0 1 4.5 4.5M12.5 17.5A4.5 4.5 0 0 1 17 13a4.5 4.5 0 0 1 4.5 4.5V20"/><path d="M12 6.6c-.6-1.3-2.6-1.2-2.6.4 0 1.4 2.6 3 2.6 3s2.6-1.6 2.6-3c0-1.6-2-1.7-2.6-.4Z"/></svg></span>
        <div>
          <h2 class="h3x">Not sure which programme is right for your loved one?</h2>
          <p>Our team can help identify the most appropriate level of support based on mobility, fall history and individual goals.</p>
        </div>
        <a class="btn btn-primary mag" href="#enquire" data-enquire="">Talk to Our Team${arrow}</a>
      </div>
      <p class="kb-fine">${esc(D.KB_FINE)}</p>
    </div>
  </section>

${enquiry({ title: 'Book a KareBalance consultation', lede: 'Choose a programme, or let us help you pick one. Our team will call you to arrange the assessment.', interest: 'karenest-karebalance', plans: kb.map((p) => p.id), what: 'KareBalance', planLabel: 'Programme', points: ['Comprehensive fall risk assessment to start', 'Supervised balance and strength training', 'Home safety recommendations and family reports'] })}`
  });

  // ---------------- KareMind ----------------
  const km = D.byGroup('karemind');
  add({
    key: 'karemind', path: '/karemind', nav: 'packages', sub: 'karemind',
    title: 'KareMind: mental wellness program', description: 'KareMind is a structured mental wellness program for emotional wellbeing, stress management, sleep and social connection. Base ₹8,999, Plus ₹44,999, Premium ₹79,999.',
    body: () => `${hero({
      crumbs: [HOME, PKGS, WELL, ['KareMind']], eyebrow: 'KareMind · Mental wellbeing',
      h1: 'Nurture Your Mind. <span class="violet">Enhance Your Wellbeing.</span>',
      lede: "Mental wellbeing is an essential part of healthy ageing. At KareMind, we believe that everyone deserves the opportunity to feel emotionally balanced, stay socially connected, and navigate life's challenges with confidence and dignity.",
      actions: `<a class="btn btn-primary mag" href="#programs">See the programs${arrow}</a><a class="btn btn-ghost mag" href="#enquire" data-enquire="">Enquire${arrow}</a>`,
      image: 'c1.webp', alt: 'Friends chatting together around a garden table'
    })}

<section class="sec" style="padding-top:30px" aria-labelledby="km-about">
  <div class="wrap km-intro">
    <div class="rv">
      <h2 class="h2" id="km-about">A structured, personal program</h2>
      <p style="margin-top:16px">KareMind is a structured mental wellness program designed to support emotional wellbeing, stress management, healthy sleep habits, resilience, and meaningful social connections. Through personalised assessments, one-to-one support from qualified professionals, and practical strategies for everyday life, the program helps individuals better understand their emotional needs and build healthier routines.</p>
      <p>Whether you are experiencing everyday stress, adjusting to life changes, feeling socially disconnected, or simply looking to prioritise your mental wellbeing, KareMind offers support tailored to your individual needs.</p>
    </div>
    <div class="km-quote rv" style="--d:.1s">
      <b>Our approach is personal, compassionate, and focused on you.</b>
      <p>With ongoing guidance, progress reviews, and referrals to appropriate mental health professionals when needed, KareMind helps you take meaningful steps towards a healthier, more balanced life.</p>
    </div>
  </div>
</section>

<section class="sec sec-tint" id="programs" aria-labelledby="km-p">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="km-p">KareMind programs</h2><p class="sub">Start with an assessment, or choose ongoing support for three or six months.</p></div>
    <div class="pkgs">${km.map((p) => pkgCard(p)).join('')}</div>
    ${compare(D.mindCompare, { minw: 560 })}
    <p class="tagline"><span>KareMind</span> — Because your mental wellbeing matters at every stage of life.</p>
  </div>
</section>

${enquiry({ title: 'Ask about KareMind', lede: 'Choose a program, or start with a conversation. Our team will call you back in confidence.', interest: 'karenest-karemind', plans: km.map((p) => p.id), selected: '', what: 'KareMind', planLabel: 'Program', notSure: 'Not sure yet, help me choose', nestu: 'KareMind Base is the recommended starting program: an assessment and a clear plan.', points: ['Personalised assessment and written action plan', 'One-to-one sessions with qualified professionals', 'Referrals to appropriate mental health professionals when needed'] })}`
  });

  // ---------------- package detail pages ----------------
  for (const p of D.packages) {
    const g = G[p.group];
    const siblings = D.byGroup(p.group).filter((x) => x.id !== p.id);
    const crumbsFor = p.group === 'karebalance' || p.group === 'karemind'
      ? [HOME, PKGS, WELL, [g.name, u(g.path)], [esc(p.name)]]
      : [HOME, PKGS, [esc(g.name), u(g.path)], [esc(p.name)]];
    const sub = p.group;
    let main = '';
    if (p.group === 'live') {
      main = `<h2>${esc(p.listTitle)}</h2>${list(p.includes)}
      ${compare({ title: 'How it compares', cols: D.liveCompare.cols, rows: D.liveCompare.rows }, { id: 'compare', level: 3, sub: `KarePlus and KarePremium side by side. ${esc(D.GST_LIVE)}` })}
      ${notIncluded(false)}`;
    } else if (p.group === 'visit') {
      main = `<h2>About this pass</h2><p style="margin-top:12px;color:var(--ink-2)">${esc(p.desc)}</p>
      <h2 style="margin-top:34px">What's included in every visitor pass?</h2><div style="margin-top:18px">${feats(D.passIncludes)}</div>
      <p class="foot-note">${esc(D.GST_VISIT)}</p>`;
    } else if (p.group === 'karebalance') {
      main = `<h2>${esc(p.listTitle)}</h2>${list(p.includes)}<p class="pkg-best"><b>Best for:</b> ${esc(p.best)}</p>
      <div class="note-box">${esc(D.KB_FINE)}</div>
      <p style="margin-top:22px"><a class="link-arrow" href="${u('/karebalance')}#kb-plans">Compare all KareBalance programmes${ico('arr')}</a></p>`;
    } else {
      main = `<p style="color:var(--ink-2);font-size:1.05rem">${esc(p.desc)}</p><h2 style="margin-top:26px">${esc(p.listTitle)}</h2>${list(p.includes)}<p class="pkg-best"><b>Best for:</b> ${esc(p.best)}</p>
      ${compare(D.mindCompare, { id: 'compare', level: 3, minw: 560 })}`;
    }
    const side = `<aside class="pd-side" aria-label="${esc(p.name)} summary">
      <div class="pd-card c-${p.color}">
        <span class="pkg-type">${esc(badgeOf(p))}</span>
        <h2 class="h3x" style="margin-top:12px">${esc(p.name)}</h2>
        ${priceHtml(p)}
        ${p.note ? `<p class="pkg-note">${esc(p.note)}</p>` : ''}
        <a class="btn btn-primary" href="${u('/sign-in')}?plan=${p.id}" data-auth data-plan="${p.id}">${esc(p.cta)}${arrow}</a>
        <a class="link-arrow" href="${u(g.path)}">All ${esc(g.name)} ${p.group === 'visit' ? 'passes' : p.group === 'live' ? 'packages' : 'programmes'}${ico('arr')}</a>
      </div>
      ${siblings.length ? `<div class="pd-other"><span class="eyebrow" style="margin:6px 4px 2px">Also in ${esc(g.name)}</span>${siblings.map((s) => `<a href="${detailHref(s)}">${esc(s.name)}<span><span data-ppt="${s.id}">${D.rupees(s.price)}</span> ${esc(D.unitLabel(s))}</span></a>`).join('')}</div>` : ''}
    </aside>`;
    add({
      key: p.id, path: D.pathOf(p), nav: 'packages', sub,
      title: `${p.name}${p.group === 'live' || p.group === 'visit' ? ': ' + p.tagline : ''}`,
      description: `${p.name}: ${p.tagline}. ${D.rupees(p.price)} ${D.unitLabel(p)}. ${p.desc || p.note || ''}`.replace(/\s+/g, ' ').trim().slice(0, 300),
      body: () => `${hero({
        crumbs: crumbsFor, eyebrow: `${esc(g.name)} · ${esc(badgeOf(p))}`, solo: true,
        h1: `${esc(p.name)}`, lede: esc(p.tagline + (p.desc && p.group !== 'karemind' && p.group !== 'visit' ? '' : '')),
        extra: `<div class="price-chip"><b data-ppt="${p.id}">${D.rupees(p.price)}</b><span>${esc(D.unitLabel(p))}${p.note ? ' · ' + esc(p.note.replace(/\.$/, '')) : ''}</span></div>${p.flag ? `<p style="margin-top:12px"><span class="pkg-flag" style="background:var(--teal)">${esc(p.flag)}</span></p>` : ''}`,
        actions: `<a class="btn btn-primary mag" href="${u('/sign-in')}?plan=${p.id}" data-auth data-plan="${p.id}">${esc(p.cta)}${arrow}</a><a class="btn btn-ghost mag" href="${u(g.path)}">Compare ${esc(g.name)}${arrow}</a>`
      })}
<section class="sec" style="padding-top:34px" aria-label="${esc(p.name)} details">
  <div class="wrap pd">
    <div class="pd-main rv">${main}</div>
    ${side}
  </div>
</section>

${enquiry({ title: `${esc(p.cta)}`, lede: 'Leave your name and number and our team will call you about this package.', interest: g.interest, plans: D.byGroup(p.group).map((x) => x.id), selected: p.id, what: p.name, planLabel: p.group === 'visit' ? 'Visitor pass' : p.group === 'live' ? 'Package' : 'Programme',
  extraFields: p.group === 'visit' ? '<div class="field"><label for="@@Start">Preferred start date <span class="opt-l">(optional)</span></label><input id="@@Start" name="start" type="date" data-msg="Preferred start date" data-min-today></div>' : '' })}`
    });
  }

  // ---------------- For Families ----------------
  add({
    key: 'families', path: '/families', nav: 'families',
    title: 'For Families', description: 'Peace of mind for families: regular updates, and My KareIQ to see visits, health readings and your plan for your loved one at KareNest.',
    body: () => `${hero({
      crumbs: [HOME, ['For Families']], eyebrow: 'For Families',
      h1: 'Peace of Mind, <span class="accent">Always.</span>',
      lede: 'Stay connected, get regular updates, and know your loved ones are safe, healthy and happy, wherever they live with us or visit for the day.',
      actions: `<a class="btn btn-primary mag" href="${u('/sign-in')}" data-auth>${ico('user')}Family Sign In</a><a class="btn btn-ghost mag" href="${u('/contact')}#enquiry">Talk to our team${arrow}</a>`,
      image: 'fam.webp', alt: 'A grandmother and granddaughter arranging flowers together', caption: `${ico('heart')}“Amma loved the music hour”`
    })}

<section class="sec" style="padding-top:30px" aria-labelledby="fam-app">
  <div class="wrap">
    <div class="sec-head rv"><div class="eyebrow">My KareIQ</div><h2 class="h2" id="fam-app" style="margin-top:12px">How we keep you connected</h2><p class="sub">One sign-in for KareNest and Kare@Home. Families can follow their requests and, once your loved one joins, see their care in one place.</p></div>
    <ul class="app-feats rv">
      <li><span class="fi">${ico('cal')}</span><b>Visits and updates</b><span>See each visit and the notes from the care team.</span></li>
      <li><span class="fi">${ico('chart')}</span><b>Health readings</b><span>Follow readings such as blood pressure and weight over time.</span></li>
      <li><span class="fi">${ico('shield')}</span><b>Your plan</b><span>See which plan your loved one is on and send requests to our team.</span></li>
    </ul>
    <div class="hero-actions" style="animation:none"><a class="btn btn-primary" href="${u('/sign-in')}" data-auth>Sign in to My KareIQ${arrow}</a><a class="btn btn-ghost" href="${u('/sign-in')}#create" data-auth="signup">Create an account</a></div>
  </div>
</section>

<section class="sec sec-tint" aria-labelledby="fam-plan">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="fam-plan">Planning for a parent?</h2><p class="sub">Whether they would like to live with us, spend their days here, or join a wellness programme, every option is open to visit first.</p></div>
    <div class="lcards">
      ${lcard({ href: u('/live-with-us'), image: 'exp1.webp', alt: 'A resident couple in the garden', title: 'Live With Us', text: 'Shared living with KarePlus or a private room with KarePremium, with meals and a preventive check-up plan included.', link: 'See resident packages' })}
      ${lcard({ href: u('/visit-and-participate'), image: 'exp2.webp', alt: 'Visitors joining a session', title: 'Visit &amp; Participate', text: 'A day, a week or a month of activities, meals and friendship, then home in the evening.', link: 'See visitor passes' })}
      ${lcard({ href: u('/wellness'), image: 'yoga.webp', alt: 'A balance session on the lawn', title: 'Wellness', text: 'KareBalance for steadier steps, KareMind for emotional wellbeing.', link: 'See wellness programmes' })}
    </div>
  </div>
</section>

${enquiry({ title: 'Talk to us about your loved one', lede: 'Tell us what you\'re looking for and we\'ll call you back, usually the same day.', interest: 'karenest-general', plans: allPlanIds, what: 'family', planLabel: 'Interested in', notSure: 'Not sure yet, please guide me', nestu: 'Not sure where to start? Choose “Not sure yet” and we\'ll guide you on the call.' })}`
  });

  // ---------------- Join Our Community ----------------
  add({
    key: 'community', path: '/community', nav: 'community', lightbox: true,
    title: 'Join Our Community', description: 'Join the KareNest community: invites to festivals and talks, updates on what is happening, and a friendly network of seniors and families.',
    body: () => `${hero({
      crumbs: [HOME, ['Join Our Community']], eyebrow: 'Join Our Community',
      h1: 'More Than Activities. <span class="accent">A Community.</span>',
      lede: "KareNest is not just a place. It's a family of caregivers, staff and members, all connected in a shared journey of care, purpose and joy.",
      actions: `<a class="btn btn-primary mag" href="#join">${ico('ppl')}Join the Community</a>${visitBtn()}`,
      image: 'exp3.webp', alt: 'A member staying in touch on his phone'
    })}

<section class="sec comm" style="padding-top:30px" aria-labelledby="comm-t">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="comm-t">For seniors, families and caregivers</h2><p class="sub">Stay connected with KareNest through events, celebrations and regular updates.</p></div>
    ${TILES}
    <ul class="enq-points rv" style="margin-top:30px">
      <li>${ico('chk')}<span>Invites to festivals and talks</span></li>
      <li>${ico('chk')}<span>Updates on what's happening</span></li>
      <li>${ico('chk')}<span>A friendly network of seniors and families</span></li>
    </ul>
  </div>
</section>

${enquiry({ id: 'join', eyebrow: 'Join the community', title: 'Be part of it', lede: 'Join our community for invites, updates and a whole lot of friendship. Leave your details and we\'ll be in touch.', interest: 'karenest-join', what: 'joining the community', heading: 'Join Our Community', nestu: 'Wonderful! We\'ll add you to the list for invites and updates.' })}`
  });

  // ---------------- Contact ----------------
  add({
    key: 'contact', path: '/contact', nav: 'contact',
    title: 'Contact Us', description: 'Contact KareNest in Kochi, Kerala. Leave your name and number and our team will call you back, usually the same day. Monday to Saturday, 9:30 AM to 6:00 PM.',
    body: () => `<section class="sec contact-sec" id="enquiry" aria-labelledby="contact-title" style="padding-top:clamp(26px,4vw,52px)">
  <div class="wrap contact-in">
    <div class="contact-copy rv">
      ${crumbs([HOME, ['Contact Us']])}
      <div class="eyebrow">Contact us</div>
      <h1 class="h2" id="contact-title" style="margin-top:12px">Let's talk about <span class="grad-text">what you need</span></h1>
      <p class="sub">Leave your name and number and tell us what you're interested in. Our team will call you back, usually the same day.</p>
      <ul class="contact-list">
        <li><span class="ci">${ico('clk')}</span><span><b>Monday to Saturday</b>9:30 AM to 6:00 PM</span></li>
        <li><span class="ci">${ico('mail')}</span><span><b>Email</b><a href="mailto:hello@karenest.in">hello@karenest.in</a></span></li>
        <li><span class="ci">${ico('pin')}</span><span><b>Visit us</b>Kochi, Kerala</span></li>
      </ul>
      <div class="contact-nestu"><img loading="lazy" decoding="async" src="${img('head.webp')}" alt="" width="58" height="58"><span><b>Nestu says</b>Not sure which to pick? Choose the closest one and we'll guide you on the call.</span></div>
    </div>
    <div class="contact-card rv" style="--d:.1s">
      <form class="visit cform" id="contactForm" novalidate data-enquiry data-what="enquiry">
        <h2 class="h3">Send an enquiry</h2>
        <div class="field"><label for="cName">Name</label><input id="cName" name="name" autocomplete="name" placeholder="e.g. Meera Nair" required aria-describedby="cNameErr"><span class="err" id="cNameErr" data-err="name"></span></div>
        <div class="field"><label for="cPhone">Phone number</label><input id="cPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98xxx xxxxx" required aria-describedby="cPhoneErr"><span class="err" id="cPhoneErr" data-err="phone"></span></div>
        <div class="field"><label for="cType">Enquiry type</label>
          <select id="cType" name="type" required aria-describedby="cTypeErr">
            <option value="" disabled selected>Choose one</option>
            <option value="karenest-visit">Day Visit</option>
            <option value="karenest-live">Live With Us</option>
            <option value="karenest-pass">Visitor Passes</option>
            <option value="karenest-join">Community</option>
            <option value="karenest-karebalance">KareBalance</option>
            <option value="karenest-karemind">KareMind</option>
          </select><span class="err" id="cTypeErr" data-err="type"></span></div>
        <div class="field"><label for="cNote">Message <span class="opt-l">(optional)</span></label><textarea id="cNote" name="note" maxlength="500" rows="3" placeholder="Anything you'd like us to know"></textarea></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp-field">
        <div class="err" data-err="form" role="alert"></div>
        <p class="consent">By sending this, you agree that the KareNest team may call you about your enquiry.</p>
        <button class="btn btn-primary" type="submit">Send enquiry${arrow}</button>
      </form>
      <div class="cdone" hidden tabindex="-1">
        <div class="tick"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 25l8 8 16-17"/></svg></div>
        <h2 class="h3">Thank you!</h2>
        <p data-done-msg>We'll call you soon.</p>
        <div class="row"><a class="btn btn-primary" data-done-app href="/app/#/start" data-app-path="#/start" hidden>Create your account</a><button class="btn btn-ghost" type="button" data-again>Send another</button></div>
      </div>
    </div>
  </div>
</section>

<section class="sec sec-tint" aria-labelledby="other-ways">
  <div class="wrap">
    <div class="sec-head rv"><h2 class="h2" id="other-ways">Other ways to get started</h2></div>
    <div class="lcards">
      ${lcard({ href: `${u('/contact')}?type=karenest-visit#enquiry`, image: 'exp2.webp', alt: 'Visitors at a group session', title: 'Plan a day visit', text: 'Spend a day with us, Monday to Saturday, 9:30 AM to 6:00 PM. Tell us when suits you and we\'ll call to confirm.', link: 'Plan a visit' }).replace('class="link-arrow"', 'class="link-arrow" data-open="visit"')}
      ${lcard({ href: u('/packages'), image: 'exp1.webp', alt: 'A resident couple in the garden', title: 'Explore our packages', text: 'Resident living, visitor passes and wellness programmes, with prices shown up front.', link: 'See all packages' })}
      ${lcard({ href: u('/sign-in'), image: 'fam.webp', alt: 'A grandmother and granddaughter together', title: 'Families: sign in', text: 'See your family\'s Kare@Home and KareNest care: visits, health readings and your plan.', link: 'Sign in' })}
    </div>
  </div>
</section>`
  });

  // ---------------- Sign In ----------------
  add({
    key: 'signin', path: '/sign-in', nav: 'signin',
    title: 'Sign In', description: 'Sign in to My KareIQ to see your family\'s KareNest and Kare@Home care: visits, health readings and your plan.',
    body: () => `<section class="signin-sec" aria-labelledby="si-title">
  <div class="wrap signin-in">
    <div class="signin-copy rv">
      ${crumbs([HOME, ['Sign In']])}
      <div class="eyebrow">For families and caregivers</div>
      <h1 class="h2" id="si-title" style="margin-top:12px">Sign in to <span class="grad-text">My KareIQ</span></h1>
      <p class="sub">One sign-in for KareNest and Kare@Home. See your family's care: visits, health readings and your plan.</p>
      <ul>
        <li>${ico('chk')}<span>Follow your enquiries and requests</span></li>
        <li>${ico('chk')}<span>See visits and health readings once your loved one joins</span></li>
        <li>${ico('chk')}<span>Your details stay private: only your family's records are shown to you</span></li>
      </ul>
    </div>
    <div class="signin-card rv" style="--d:.1s">
      <h2>Welcome back</h2>
      <p>Choose how you'd like to sign in.</p>
      <div class="prov" id="providers">
        <a class="prov-btn" href="#" data-provider="google" aria-disabled="true" role="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.6L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>Continue with Google<span class="st" data-st>Checking…</span></a>
        <a class="prov-btn" href="#" data-provider="facebook" aria-disabled="true" role="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>Continue with Facebook<span class="st" data-st>Checking…</span></a>
        <a class="prov-btn email" href="/app/#/signin?brand=karenest" data-app="karenest" data-auth data-provider="email">${ico('mail', '', ' style="stroke:currentColor;fill:none;stroke-width:2"')}Continue with email</a>
      </div>
      <p class="prov-msg" id="provMsg" role="status" aria-live="polite"></p>
      <div class="signin-foot" id="create">
        <span>New here? <a href="/app/#/join?brand=karenest" data-app-path="#/join?brand=karenest" data-auth="signup">Create an account</a></span>
        <span>Forgot your password? <a href="/app/#/forgot" data-app-path="#/forgot">Reset it</a></span>
      </div>
    </div>
  </div>
</section>`
  });

  return list_;
};
