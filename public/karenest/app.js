/* KareNest page behaviour (moved out of index.html) */
(function(){
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  document.documentElement.classList.add('js');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine=matchMedia('(pointer:fine)').matches;
  const go=id=>{const el=id==='top'?document.body:document.getElementById(id);if(el)el.scrollIntoView({behavior:reduce?'auto':'smooth'})};

  /* nav + progress + parallax */
  const nav=$('#nav'),prog=$('#progress'),heroImg=$('#heroPhoto img');
  function onScroll(){const y=scrollY,h=document.documentElement.scrollHeight-innerHeight;
    nav.classList.toggle('scrolled',y>10);prog.style.transform='scaleX('+(h>0?y/h:0)+')';
    if(!reduce&&y<900)heroImg.parentElement.style.transform='translateY('+(y*.18)+'px)';
    guideVis();}
  addEventListener('scroll',onScroll,{passive:true});

  const links=$$('.links a');
  const so=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const id=e.target.id==='hero'?'top':e.target.id;currentSec=id;links.forEach(l=>l.classList.toggle('active',l.getAttribute('href')==='#'+id))}}),{rootMargin:'-45% 0px -50% 0px'});
  let currentSec='top';
  ['hero','about','life','activities','families','community','visit'].forEach(i=>so.observe(document.getElementById(i)));

  /* drawer */
  const burger=$('#burger');
  function setMenu(o){document.body.classList.toggle('menu-open',o);burger.setAttribute('aria-expanded',o);burger.setAttribute('aria-label',o?'Close menu':'Open menu');document.body.style.overflow=o?'hidden':''}
  burger.onclick=()=>setMenu(!document.body.classList.contains('menu-open'));
  $$('#drawer a,#drawer button').forEach(a=>a.addEventListener('click',()=>setMenu(false)));

  /* reveal */
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.1});
  $$('.rv,.rv-img').forEach(el=>{if(el.getBoundingClientRect().top<innerHeight*.95)el.classList.add('in');else io.observe(el)});

  /* tilt + magnetic */
  if(fine&&!reduce){
    $$('.tilt').forEach(c=>{c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      c.style.transform='perspective(900px) rotateX('+((.5-y)*8)+'deg) rotateY('+((x-.5)*10)+'deg) translateY(-6px)'});
      c.addEventListener('pointerleave',()=>c.style.transform='')});
    $$('.mag').forEach(b=>{b.addEventListener('pointermove',e=>{const r=b.getBoundingClientRect();b.style.setProperty('--bx',(e.clientX-r.left-r.width/2)*.16+'px');b.style.setProperty('--by',(e.clientY-r.top-r.height/2)*.3+'px')});
      b.addEventListener('pointerleave',()=>{b.style.setProperty('--bx','0px');b.style.setProperty('--by','0px')})});
  }

  /* events + countdown */
  const IMG={e1:'/karenest/images/e1.webp',e2:'/karenest/images/e2.webp',e3:'/karenest/images/e3.webp'};
  const evs=[
    {n:'Senior Yoga Workshop',d:'2026-10-28T10:00:00+05:30',t:'10:00 AM – 11:30 AM',p:'KareNest Community Hall',i:'e1'},
    {n:'Kerala Piravi Celebration',d:'2026-10-31T16:00:00+05:30',t:'4:00 PM – 6:00 PM',p:'Community Lawn',i:'e2'},
    {n:'Guest Lecture: Healthy Ageing',d:'2026-11-14T10:00:00+05:30',t:'10:00 AM – 12:30 PM',p:'Learning Centre',i:'e3'}];
  const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  $('#evs').innerHTML=evs.map(e=>'<article class="ev"><div class="ev-img"><div class="ph"><img src="'+IMG[e.i]+'" alt=""></div><div class="date"><b>'+Number(e.d.slice(8,10))+'</b><small>'+mo[Number(e.d.slice(5,7))-1]+'</small></div></div><div class="ev-body"><h4>'+e.n+'</h4><span class="m"><svg class="ico"><use href="#clk"/></svg>'+e.t+'</span><span class="m"><svg class="ico"><use href="#pin"/></svg>'+e.p+'</span></div></article>').join('');
  const upcoming=evs.filter(e=>new Date(e.d)>Date.now());
  if(!upcoming.length)$('#next').hidden=true;else{const T=new Date(upcoming[0].d).getTime();$('#nextName').textContent=upcoming[0].n;const p=v=>String(v).padStart(2,'0');
    const tick=()=>{const s=Math.max(0,Math.floor((T-Date.now())/1000));$('#cdD').textContent=p(Math.floor(s/86400));$('#cdH').textContent=p(Math.floor(s%86400/3600));$('#cdM').textContent=p(Math.floor(s%3600/60));$('#cdS').textContent=p(s%60)};tick();setInterval(tick,1000)}
  const nextEv=upcoming[0]||evs[0];

  /* particles */
  const PCOL=['#12917A','#7A4CBF','#D6568C','#2E8FB5','#E2A43A'];
  function burst(x,y,n){if(reduce)return;for(let i=0;i<(n||14);i++){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.classList.add('particle');
    const heart=i%3!==0;s.innerHTML=heart?'<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="'+PCOL[i%5]+'"/>':'<path d="M4 20C4 9 10 4 20 3c0 10-6 17-16 17z" fill="'+PCOL[i%5]+'"/>';
    document.body.appendChild(s);const a=Math.random()*Math.PI-Math.PI,d=60+Math.random()*90,sz=.6+Math.random()*.8;
    s.animate([{transform:'translate('+(x-8)+'px,'+(y-8)+'px) scale(0) rotate(0)',opacity:1},{transform:'translate('+(x-8+Math.cos(a)*d)+'px,'+(y-8+Math.sin(a)*d)+'px) scale('+sz+') rotate('+(Math.random()*120-60)+'deg)',opacity:1,offset:.6},{transform:'translate('+(x-8+Math.cos(a)*d*1.1)+'px,'+(y+40+Math.sin(a)*d)+'px) scale('+sz*.8+')',opacity:0}],{duration:1300+Math.random()*500,easing:'cubic-bezier(.2,.8,.2,1)'}).onfinish=()=>s.remove();}}

  /* ---------- mascot in CTA ---------- */
  const buddy=$('#buddy'),bodyEl=$('#buddyBody'),bubble=$('#bubble'),band=$('#ctaBand');
  const hr=new Date().getHours();const greet=hr<12?'Good morning!':hr<17?'Good afternoon!':'Good evening!';
  const lines=[
    {t:greet+' I\'m Nestu, your KareNest guide.',s:'Come and spend a morning with us. Share a meal, join a class, meet the family.',a:[['Plan a visit','visit'],['Say hi again','next']]},
    {t:'Psst, did you know?',s:'We\'re open Monday to Saturday, 9:30 AM to 6:00 PM. Yoga starts at 10:00 AM and the walking club heads out at 5:30 PM.',a:[['See activities','activities'],['Tell me more','next']]},
    {t:'You\'re invited!',s:nextEv.n+' · '+new Date(nextEv.d).toLocaleDateString('en-IN',{day:'numeric',month:'short'})+' · '+nextEv.p+'.',a:[['Upcoming events','events'],['Next','next']]},
    {t:'For families',s:'You get regular updates, so you always know your loved ones are safe, healthy and happy.',a:[['How it works','families'],['Next','next']]},
    {t:'Be part of it',s:'Join our community for invites, updates and a whole lot of friendship.',a:[['Send an enquiry','join'],['Start over','next']]}];
  let li=-1,bubbleTimer;
  function say(){li=(li+1)%lines.length;const L=lines[li];
    bubble.classList.remove('hide');bubble.innerHTML='<span class="typing"><i></i><i></i><i></i></span>';
    setTimeout(()=>{bubble.innerHTML='<b>'+L.t+'</b>'+L.s+'<div class="acts-row">'+L.a.map(a=>'<button class="pill" data-q="'+a[1]+'">'+a[0]+'</button>').join('')+'</div><button class="speak" data-speak><svg class="ico" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>Read aloud</button><div class="hint">Tap me for more</div>'},reduce?0:650);
    clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>bubble.classList.add('hide'),14000);}
  const kb=buddy;
  function play(cls){buddy.classList.remove(cls);void buddy.offsetWidth;buddy.classList.add(cls);setTimeout(()=>buddy.classList.remove(cls),1300)}
  buddy.addEventListener('click',e=>{play('hop');buddy.classList.add('happy');setTimeout(()=>buddy.classList.remove('happy'),700);const r=buddy.getBoundingClientRect();burst(r.left+r.width*.2,r.top+r.height*.3,16);say()});
  buddy.addEventListener('pointerenter',()=>{if(!reduce)play('wave')});
  bubble.addEventListener('click',e=>{if(e.target.closest('[data-speak]')){try{const L=lines[li];speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(L.t+' '+L.s);u.lang='en-IN';u.pitch=1.25;u.rate=.95;speechSynthesis.speak(u);play('wave')}catch(err){}return}const q=e.target.closest('[data-q]');if(!q)return;if(q.dataset.q==='next'){play('hop');say()}else act(q.dataset.q)});
  if(fine&&!reduce)band.addEventListener('pointermove',e=>{const r=buddy.getBoundingClientRect();const cx=r.left+r.width/2;const dx=Math.max(-1,Math.min(1,(e.clientX-cx)/500));
    bodyEl.style.transform='perspective(800px) rotateY('+(dx*14)+'deg) rotate('+(dx*3)+'deg)'});
  band.addEventListener('pointerleave',()=>bodyEl.style.transform='');
  let greeted=false;
  new IntersectionObserver(es=>es.forEach(e=>{ctaVisible=e.isIntersecting;guideVis();if(e.isIntersecting&&!greeted){greeted=true;if(!reduce){buddy.classList.add('enter');setTimeout(()=>buddy.classList.remove('enter'),1200)}setTimeout(()=>{play('wave');say()},900)}}),{threshold:.45}).observe(band);
  let ctaVisible=false;


  /* mascot eyes follow the pointer, blink, and wave now and then */
  if(!reduce){
    setInterval(()=>{if(ctaVisible&&!document.documentElement.classList.contains('calm')&&Math.random()<.5)play('wave')},7000);
  }
  /* ---------- floating guide ---------- */
  const guide=$('#guide'),gBtn=$('#gBtn'),gPanel=$('#gPanel'),gTease=$('#gTease'),gMsgs=$('#gMsgs');
  let gOpen=false,teased=false;
  function guideVis(){const show=scrollY>innerHeight*.6&&(!ctaVisible||gOpen);guide.classList.toggle('show',show);
    if(show&&!teased){teased=true;setTimeout(()=>{if(!gOpen)gTease.classList.remove('hide');setTimeout(()=>gTease.classList.add('hide'),7000)},1500)}}
  const ctx={top:'You\'re on the home page. Want a quick tour?',about:'Three ways to be part of KareNest: live with us, visit for the day, or stay connected.',life:'Health, dignity and happiness guide everything we do here.',activities:'Six kinds of activities, Monday to Saturday. Yoga at 10:00 AM is a favourite!',contact:'Leave your name and number and our team will call you back.',day:'We\'re open Monday to Saturday, 9:30 AM to 6:00 PM.',families:'Families get regular updates. Peace of mind, always.',community:'Friends, talents, staying active and giving back. That\'s our community.',visit:'Ready to visit? I can help you book.'};
  function addMsg(t,me){const d=document.createElement('div');d.className='msg'+(me?' me':'');d.textContent=t;gMsgs.appendChild(d);gMsgs.scrollTop=gMsgs.scrollHeight}
  function setG(o){gOpen=o;gPanel.classList.toggle('hide',!o);gBtn.setAttribute('aria-expanded',o);gTease.classList.add('hide');$('#gDot').hidden=true;
    if(o&&!gMsgs.children.length){addMsg(greet+' I\'m Nestu, your KareNest guide.');setTimeout(()=>addMsg(ctx[currentSec]||ctx.top),400)}guideVis()}
  gBtn.onclick=()=>setG(!gOpen);gTease.onclick=()=>setG(true);$('#gClose').onclick=()=>setG(false);
  const replies={visit:'Lovely! Opening the visit form for you.',activities:'Taking you to today\'s activities.',events:'Here\'s what\'s coming up next.',families:'Here\'s how we keep families connected.',join:'Wonderful! Let\'s get you on the list.',top:'Back to the top we go!'};
  $('#gQuick').addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(!b)return;addMsg(b.textContent,true);setTimeout(()=>{addMsg(replies[b.dataset.q]);setTimeout(()=>{setG(false);act(b.dataset.q)},650)},350)});
  document.addEventListener('pointerdown',e=>{if(gOpen&&!e.target.closest('#guide'))setG(false)});

  function act(q){if(q==='visit'||q==='join'||q==='live'||q==='karebalance'){openDlg(q);return}
    if(q==='events'){go('events');return}go(q)}

  /* ---------- dialog ---------- */
  const dlg=$('#dlg'),form=$('#visitForm'),fErr=$('#fErr');
  $('#fDate').min=new Date().toISOString().slice(0,10);
  /* "Plan a visit" opens the day-visit form; everything else (live with us, community,
     KareBalance) goes to the Contact Us form with the right enquiry type already chosen */
  const TYPE={join:'karenest-join',live:'karenest-live',karebalance:'karenest-karebalance',visit:'karenest-visit'};
  function openContact(type,note){const sel=$('#cType');$('#contactForm').hidden=false;$('#contactDone').hidden=true;
    if(type)sel.value=TYPE[type]||type;$('#contactForm').dataset.note=note||'';
    $('#contact').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});setTimeout(()=>$('#cName').focus({preventScroll:true}),reduce?0:650)}
  function openDlg(kind){if(kind!=='visit'){openContact(kind);return}
    $('#dlgForm').hidden=false;$('#dlgDone').hidden=true;fErr.textContent='';
    if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','')}
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=>{
    const kb=b.closest('#karebalance');
    if(kb){openContact('karebalance',(b.getAttribute('aria-label')||b.textContent).replace(/\s+/g,' ').trim());return}
    openDlg(b.dataset.open)}));
  $('#toContact').addEventListener('click',e=>{e.preventDefault();(dlg.close?dlg.close():dlg.removeAttribute('open'));openContact('')});
  const close=()=>dlg.close?dlg.close():dlg.removeAttribute('open');
  $('#dlgX').onclick=close;$('#doneClose').onclick=close;dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
  form.addEventListener('submit',async e=>{e.preventDefault();fErr.textContent='';const nIn=$('#fName'),name=nIn.value.trim(),ph=$('#fPhone').value.replace(/\D/g,''); if(!name){fErr.textContent='Please add your name so we know who to ask for.';nIn.focus();return} if(ph.length<10){fErr.textContent='Please enter a phone number with at least 10 digits.';$('#fPhone').focus();return} const k='Day visits',dv=$('#fDate').value,who=$('#fFor')?$('#fFor').value:''; const d=dv?new Date(dv+'T00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'}):'a day that suits you';
    /* send the request to the KareIQ team (it appears in the admin panel under Enquiries) */
    const btn=form.querySelector('button[type=submit]'),label=btn.innerHTML;btn.disabled=true;btn.textContent='Sending…';
    const message=[window.__knFrom||'',k,'Preferred date: '+(dv?d:'flexible'),who?'Visiting for: '+who:''].filter(Boolean).join(' | ');
    let ref='';
    try{
      const res=await fetch((window.KARE_API||'')+'/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone:$('#fPhone').value,interest:'karenest-visit',message,source:'karenest',consent:true,website:$('#fWebsite')?$('#fWebsite').value:''})});
      const out=await res.json().catch(()=>({}));
      if(!res.ok||!out.ok){const er=out.errors||{};fErr.textContent=er.phone||er.name||out.message||'Sorry, we could not send that. Please try again.';btn.disabled=false;btn.innerHTML=label;return}
      ref=out.reference||'';
    }catch(err){fErr.textContent='We could not reach our team just now. Please check your internet and try again, or email hello@karenest.in.';btn.disabled=false;btn.innerHTML=label;return}
    btn.disabled=false;btn.innerHTML=label;
    $('#doneMsg').textContent='Thank you, '+name.split(' ')[0]+'. We\'ve noted your interest in '+k.toLowerCase()+' for '+d+'. Our team will call to confirm.'+(ref?' Your reference: '+ref+'.':''); if(ref&&window.KareAppStart){$('#doneApp').href=window.KareAppStart(ref,'karenest');$('#doneApp').hidden=false;$('#doneAppP').hidden=false}else{$('#doneApp').hidden=true;$('#doneAppP').hidden=true}$('#dlgForm').hidden=true;$('#dlgDone').hidden=false;form.reset(); const r=dlg.getBoundingClientRect();burst(r.left+r.width/2,r.top+90,20)});
  window.__knFrom='';

  /* ---------- contact us ---------- */
  const cForm=$('#contactForm'),cErr=$('#cErr');
  const cFields={name:[$('#cName'),$('#cNameErr')],phone:[$('#cPhone'),$('#cPhoneErr')],type:[$('#cType'),$('#cTypeErr')]};
  function cMark(k,msg){const [inp,slot]=cFields[k];slot.textContent=msg||'';if(msg)inp.setAttribute('aria-invalid','true');else inp.removeAttribute('aria-invalid')}
  Object.keys(cFields).forEach(k=>cFields[k][0].addEventListener(k==='type'?'change':'input',()=>{cMark(k,'');if(k==='type')cForm.dataset.note=''}));
  cForm.addEventListener('submit',async e=>{e.preventDefault();cErr.textContent='';
    const name=$('#cName').value.trim(),phone=$('#cPhone').value.trim(),digits=phone.replace(/\D/g,''),type=$('#cType').value;
    let bad=null;
    if(name.length<2){cMark('name','Please enter your name.');bad=bad||'name'}
    if(digits.length<10){cMark('phone','Please enter a 10-digit mobile number.');bad=bad||'phone'}
    if(!type){cMark('type','Please choose what your enquiry is about.');bad=bad||'type'}
    if(bad){cFields[bad][0].focus();return}
    const label=$('#cType').selectedOptions[0].textContent,btn=cForm.querySelector('button[type=submit]'),html=btn.innerHTML;
    btn.disabled=true;btn.textContent='Sending…';
    try{
      const res=await fetch((window.KARE_API||'')+'/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,interest:type,message:['Contact Us form: '+label,cForm.dataset.note||''].filter(Boolean).join(' | '),source:'karenest',consent:true,website:$('#cWebsite').value})});
      const out=await res.json().catch(()=>({}));
      if(!res.ok||!out.ok){const er=out.errors||{};if(er.name)cMark('name',er.name);if(er.phone)cMark('phone',er.phone);if(er.interest)cMark('type',er.interest);if(!er.name&&!er.phone&&!er.interest)cErr.textContent=out.message||'Sorry, we could not send that. Please try again.';btn.disabled=false;btn.innerHTML=html;return}
      const ref=out.reference||'';
      $('#cDoneMsg').textContent='Thank you, '+name.split(' ')[0]+'. We\'ve got your '+label.toLowerCase()+' enquiry and will call you on '+phone+' soon.'+(ref&&!/RECEIVED/.test(ref)?' Your reference: '+ref+'.':'');
      const app=$('#cDoneApp');if(ref&&!/RECEIVED/.test(ref)&&window.KareAppStart){app.href=window.KareAppStart(ref,'karenest');app.hidden=false}else app.hidden=true;
      cForm.reset();cForm.dataset.note='';btn.disabled=false;btn.innerHTML=html;cForm.hidden=true;const done=$('#contactDone');done.hidden=false;done.focus();
      const r=done.getBoundingClientRect();burst(r.left+r.width/2,r.top+60,18);
    }catch(err){cErr.textContent='We could not reach our team just now. Please check your internet and try again, or email hello@karenest.in.';btn.disabled=false;btn.innerHTML=html}});
  $('#cAgain').onclick=()=>{$('#contactDone').hidden=true;cForm.hidden=false;$('#cName').focus()};

  /* ---------- reading comfort ---------- */
  const root=document.documentElement,cBtn=$('#cBtn'),cPanel=$('#cPanel');
  const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  function setFs(v){root.style.fontSize=(100*v)+'%';$$('#fsSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.fs==String(v)));store.set('kn-fs',v)}
  function setTog(btn,on,apply,key){btn.setAttribute('aria-pressed',on);apply(on);store.set(key,on?'1':'0')}
  const applyContrast=on=>on?root.setAttribute('data-contrast','high'):root.removeAttribute('data-contrast');
  const applyCalm=on=>root.classList.toggle('calm',on);
  cBtn.onclick=()=>{const o=cPanel.classList.toggle('hide');cBtn.setAttribute('aria-expanded',!o)};
  $$('#fsSeg button').forEach(b=>b.onclick=()=>setFs(Number(b.dataset.fs)));
  $('#tgContrast').onclick=e=>setTog(e.currentTarget,e.currentTarget.getAttribute('aria-pressed')!=='true',applyContrast,'kn-ct');
  $('#tgCalm').onclick=e=>setTog(e.currentTarget,e.currentTarget.getAttribute('aria-pressed')!=='true',applyCalm,'kn-calm');
  if(store.get('kn-fs'))setFs(Number(store.get('kn-fs')));
  if(store.get('kn-ct')==='1')setTog($('#tgContrast'),true,applyContrast,'kn-ct');
  if(store.get('kn-calm')==='1')setTog($('#tgCalm'),true,applyCalm,'kn-calm');
  document.addEventListener('click',e=>{if(!e.target.closest('#comfort')&&!cPanel.classList.contains('hide')){cPanel.classList.add('hide');cBtn.setAttribute('aria-expanded','false')}});

  /* ---------- a day at KareNest ---------- */
  const actImgs=$$('.act-img img').map(i=>i.src),expImgs=$$('.xmedia img').map(i=>i.src);
  /* Open Monday to Saturday, 9:30 AM to 6:00 PM (Kochi time) */
  const OPEN={from:9*60+30,to:18*60};
  const day=[
    {h:9,m:30,n:'Welcome & wellness check-in',d:'Doors open. A friendly catch-up with the care team: how you slept, how you feel, what you need today.',img:expImgs[0]},
    {h:10,m:0,n:'Yoga on the lawn',d:'Gentle stretches and breathing under the trees, at a pace that suits every body.',img:actImgs[0]},
    {h:11,m:15,n:'Arts & crafts',d:'Painting, clay and thread work. Bring an idea or borrow one of ours.',img:actImgs[1]},
    {h:12,m:30,n:'Lunch together',d:'Home-style Kerala meals at long shared tables, with room for conversation.',img:IMG.e2},
    {h:14,m:0,n:'Learning session',d:'Smartphone basics, new hobbies and talks from visiting experts.',img:actImgs[4]},
    {h:15,m:30,n:'Music & stories',d:'Bhajans, old film songs and stories shared over the afternoon.',img:actImgs[2]},
    {h:16,m:30,n:'Games & chai',d:'Carroms, chess and cards with a hot cup of tea.',img:actImgs[5]},
    {h:17,m:30,n:'Walking club & goodbyes',d:'An easy loop through the garden paths before we close at 6:00 PM. See you tomorrow!',img:actImgs[3]}];
  const stage=$('#dayStage'),timesEl=$('#times');
  day.forEach((s,i)=>{const im=new Image();im.src=s.img;im.alt=s.n;im.loading='lazy';stage.insertBefore(im,stage.firstChild);s.el=im;
    const li=document.createElement('li');const b=document.createElement('button');
    const hh=((s.h+11)%12+1)+':'+String(s.m).padStart(2,'0')+(s.h<12?' AM':' PM');
    b.innerHTML='<span class="t">'+hh+'</span><span class="n">'+s.n+'</span>';b.onclick=()=>{userPicked=true;showDay(i)};li.appendChild(b);timesEl.appendChild(li);s.btn=b;s.label=hh});
  const ist=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return{h:+p.find(x=>x.type==='hour').value,m:+p.find(x=>x.type==='minute').value,wd:p.find(x=>x.type==='weekday').value}};
  let dayIdx=0,userPicked=false;
  const isOpen=t=>t.wd!=='Sun'&&t.h*60+t.m>=OPEN.from&&t.h*60+t.m<OPEN.to;
  // closed (Sundays, before 9:30 AM, after 6:00 PM): nothing is "happening now" and the day starts from the top
  function nowIndex(){const t=ist(),mins=t.h*60+t.m;let idx=-1;if(isOpen(t))day.forEach((s,i)=>{if(s.h*60+s.m<=mins)idx=i});return{idx,mins}}
  function showDay(i){dayIdx=(i+day.length)%day.length;const s=day[dayIdx];const {idx,mins}=nowIndex();
    day.forEach((d,j)=>{d.el.classList.toggle('on',j===dayIdx);d.btn.setAttribute('aria-current',j===dayIdx);d.btn.classList.toggle('past',j<=idx)});
    $('#dayTitle').textContent=s.n;$('#dayText').textContent=s.d;
    const nextStart=day[dayIdx+1]?day[dayIdx+1].h*60+day[dayIdx+1].m:OPEN.to;const live=dayIdx===idx&&mins<nextStart;const badge=$('#dayBadge');badge.classList.toggle('now',live);
    badge.textContent=live?'Happening now · '+s.label:(dayIdx===idx+1||(idx===-1&&dayIdx===0)?'Up next · ':'')+s.label;
    $('#hh').style.transform='rotate('+((s.h%12)*30+s.m*.5)+'deg)';$('#mm').style.transform='rotate('+(s.m*6+360*s.h)+'deg)';
    $('#dayFill').style.setProperty('--p',(idx<0?0:Math.min(100,(idx+.5)/day.length*100))+'%')}
  (function initDay(){const {idx}=nowIndex();const t=ist();const now=((t.h+11)%12+1)+':'+String(t.m).padStart(2,'0')+(t.h<12?' AM':' PM');
    const mins=t.h*60+t.m,sat=t.wd==='Sat',sun=t.wd==='Sun';
    $('#dayNow').textContent=isOpen(t)?'It\'s '+now+' in Kochi. We\'re open until 6:00 PM.'
      :sun?'It\'s Sunday in Kochi. We\'re closed today and open Monday at 9:30 AM.'
      :mins<OPEN.from?'It\'s '+now+' in Kochi. We open at 9:30 AM.'
      :'It\'s '+now+' in Kochi. We\'re closed now and open '+(sat?'Monday':'tomorrow')+' at 9:30 AM.';
    showDay(idx<0?0:idx)})();
  $('#dayPrev').onclick=()=>{userPicked=true;showDay(dayIdx-1)};$('#dayNext').onclick=()=>{userPicked=true;showDay(dayIdx+1)};
  /* the schedule changes only when someone taps a time or the arrows (no auto-rotating) */

  /* ---------- fit finder ---------- */
  const IC={me:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',parent:'<circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15 14.2c2.4-.3 4.6 1.2 5 4"/>',heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
    home:'<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',chat:'<path d="M4 6h16v10H9l-5 4z"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',star:'<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>',wave:'<path d="M3 12c3-4 6-4 9 0s6 4 9 0"/>'};
  const qs=[
    {q:'Who are you exploring KareNest for?',s:'Pick the closest match.',o:[['Myself','I\'m planning my own next chapter','me',[0,0,0]],['A parent','Mum, Dad or both','parent',[0,0,0]],['Someone I love','A relative or a close friend','heart',[0,0,0]]],say:['Lovely, let\'s plan for you!','How thoughtful of you.','They\'re lucky to have you.']},
    {q:'What would help the most right now?',s:'There are no wrong answers.',o:[['Everyday support','Care, meals and company, every day','home',[3,0,0]],['Things to do','Activities, wellness and new friends','sun',[0,3,1]],['Staying in touch','Events, updates and a friendly network','chat',[0,1,3]]],say:['Got it.','Sounds fun!','Connection matters.']},
    {q:'How often do you picture being here?',s:'You can always change your mind later.',o:[['Living here','A home with a community around it','home',[3,0,0]],['A few days a week','Come for the day, go home in the evening','cal',[0,3,0]],['Now and then','Join events and celebrations','star',[0,0,3]]],say:['','','']}];
  const recs=[
    {tag:'Our suggestion',h:'Live With Us',p:'A home with support, care and a vibrant community around you, every single day.',l:['Support and care when you need it','Daily activities, right outside your door','Families stay updated and at ease'],cta:'live'},
    {tag:'Our suggestion',h:'Visit & Participate',p:'Spend your days with us: activities, wellness programmes and good company, then head home in the evening.',l:['Yoga, walks, arts and learning sessions','Lunch with friends','Flexible days that fit your week'],cta:'visit'},
    {tag:'Our suggestion',h:'Join Our Community',p:'Stay connected with KareNest through events, celebrations and regular updates.',l:['Invites to festivals and talks','Updates on what\'s happening','A friendly network of seniors and families'],cta:'join'}];
  let step=0,score=[0,0,0],hist=[];
  const fitMain=$('#fitMain'),fitSays=$('#fitSays');
  function fitProg(){return '<div class="fit-prog">'+qs.map((_,i)=>'<i class="'+(i<step||step>=qs.length?'on':'')+'"></i>').join('')+'</div>'}
  function renderFit(){if(step>=qs.length){const best=score.indexOf(Math.max(...score)),r=recs[best];fitSays.textContent='I think you\'ll love this!';
      fitMain.innerHTML=fitProg()+'<div class="fit-step result"><span class="rtag">'+r.tag+'</span><h3>'+r.h+'</h3><p>'+r.p+'</p><ul>'+r.l.map(x=>'<li><svg class="ico"><use href="#chk"/></svg>'+x+'</li>').join('')+'</ul><div class="row"><button class="btn btn-primary" data-open="'+r.cta+'">'+({join:'Join Our Community',live:'Ask About Living With Us',visit:'Plan a Day Visit'}[r.cta])+'<svg class="ico arr"><use href="#arr"/></svg></button><button class="btn btn-ghost" id="fitAgain">Start again</button></div></div>';
      fitMain.querySelector('[data-open]').onclick=e=>openDlg(e.currentTarget.dataset.open);$('#fitAgain').onclick=()=>{step=0;score=[0,0,0];hist=[];fitSays.textContent='Let\'s try again!';renderFit()};
      const rr=fitMain.getBoundingClientRect();burst(rr.left+rr.width/2,rr.top+80,18);return}
    const Q=qs[step];fitMain.innerHTML=fitProg()+'<div class="fit-step"><div class="fit-small">Question '+(step+1)+' of '+qs.length+'</div><div class="fit-q">'+Q.q+'</div><div class="fit-small">'+Q.s+'</div><div class="opts">'+Q.o.map((o,i)=>'<button class="opt" data-i="'+i+'"><span class="oi"><svg class="ico" viewBox="0 0 24 24">'+IC[o[2]]+'</svg></span><b>'+o[0]+'</b><span>'+o[1]+'</span></button>').join('')+'</div>'+(step?'<button class="fit-back" id="fitBack">← Back</button>':'')+'</div>';
    $$('#fitMain .opt').forEach(b=>b.onclick=()=>{const o=Q.o[+b.dataset.i];hist.push(o[3]);o[3].forEach((v,k)=>score[k]+=v);if(Q.say[+b.dataset.i])fitSays.textContent=Q.say[+b.dataset.i];step++;renderFit()});
    const bk=$('#fitBack');if(bk)bk.onclick=()=>{const h=hist.pop();h.forEach((v,k)=>score[k]-=v);step--;renderFit()}}
  renderFit();

  /* ---------- lightbox ---------- */
  const more={'Yoga & Fitness':'Morning yoga on the lawn, chair exercises and gentle strength sessions, guided at a comfortable pace.','Arts & Crafts':'Painting, clay, mural work and thread crafts. Finished pieces go up on our community wall.','Music & Cultural Events':'Bhajans, film-song evenings, festival celebrations and visiting performers.','Walking Clubs':'Easy loops through shaded garden paths, with plenty of benches along the way.','Learning Sessions':'Smartphone basics, video calls with family, new hobbies and expert talks.','Games & Social Moments':'Carroms, chess, cards and quiz afternoons, always with tea.',
    'Make New Friends':'Shared meals, tea on the verandah and clubs for every interest make it easy to meet people.','Share Your Talents':'Teach a recipe, sing at music night or lead a craft. Everyone has something to share.','Stay Active':'Walks, yoga and outings keep days lively and bodies moving.','Be Part of Something Meaningful':'Mentor, volunteer and give back to the wider community.'};
  const gallery=[];
  $$('.act').forEach(a=>gallery.push({el:a,img:a.querySelector('img'),kick:'Activities & Wellness',t:a.querySelector('h3').textContent,meta:a.querySelector('.when').textContent}));
  $$('.tile').forEach(a=>gallery.push({el:a,img:a.querySelector('img'),kick:'Our community',t:a.querySelector('b').textContent,meta:''}));
  const lb=$('#lb');let gi=0,lastFocus=null;
  function showLb(i){gi=(i+gallery.length)%gallery.length;const g=gallery[gi];
    $('#lbImg').innerHTML='<img src="'+g.img.src+'" alt="'+g.img.alt.replace(/"/g,'')+'">';$('#lbKick').textContent=g.kick;$('#lbTitle').textContent=g.t;
    $('#lbMeta').innerHTML=g.meta?'<svg class="ico"><use href="#clk"/></svg>'+g.meta:'';$('#lbText').textContent=more[g.t]||'';$('#lbCount').textContent=(gi+1)+' / '+gallery.length}
  function openLb(i){lastFocus=document.activeElement;lb.hidden=false;showLb(i);requestAnimationFrame(()=>lb.classList.add('open'));document.body.style.overflow='hidden';$('#lbX').focus()}
  function closeLb(){lb.classList.remove('open');document.body.style.overflow='';setTimeout(()=>{lb.hidden=true},400);if(lastFocus)lastFocus.focus()}
  gallery.forEach((g,i)=>{g.el.classList.add('zoomable');const h=document.createElement('span');h.className='zoom-hint';h.innerHTML='<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/></svg>';(g.el.querySelector('.act-img')||g.el).appendChild(h);
    g.el.setAttribute('role','button');g.el.setAttribute('aria-label','View '+g.t);
    g.el.addEventListener('click',e=>{e.preventDefault();openLb(i)});g.el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openLb(i)}})});
  $('#lbX').onclick=closeLb;$('#lbPrev').onclick=()=>showLb(gi-1);$('#lbNext').onclick=()=>showLb(gi+1);
  $('#lbCta').onclick=()=>{closeLb();setTimeout(()=>openDlg('visit'),300)};
  lb.addEventListener('click',e=>{if(e.target===lb)closeLb()});
  document.addEventListener('keydown',e=>{if(lb.hidden)return;if(e.key==='Escape')closeLb();if(e.key==='ArrowRight')showLb(gi+1);if(e.key==='ArrowLeft')showLb(gi-1)});
  let tx=null;lb.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});lb.addEventListener('touchend',e=>{if(tx==null)return;const dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50)showLb(gi+(dx<0?1:-1));tx=null});

  onScroll();
})();
