(function(){
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. seeded rng (drifting petals) ---------- */
  var seed = 20260813;
  function rnd(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

  var blooms = document.getElementById('bloomLayer');

  /* ---------- 2. spotlight that trails the cursor ---------- */
  /* Lerped in a rAF loop and written to CSS variables — the mask is a
     plain radial-gradient, so the compositor does the work.            */
  var hero = document.getElementById('home');
  var glow = document.getElementById('glowspot');
  var raw = {x:-500, y:-500}, smooth = {x:-500, y:-500}, running = false, rafId = null;

  /* The glow is a child of the hero, but the mask lives on the plate, which is
     inset from the left. Track that gap so both stay under the same cursor.  */
  var off = {x:0, y:0};
  function measure(){
    var h = hero.getBoundingClientRect(), b = blooms.getBoundingClientRect();
    off.x = b.left - h.left;
    off.y = b.top - h.top;
  }
  measure();
  window.addEventListener('resize', measure);

  function loop(){
    smooth.x += (raw.x - smooth.x) * 0.12;
    smooth.y += (raw.y - smooth.y) * 0.12;
    blooms.style.setProperty('--mx', (smooth.x - off.x).toFixed(1) + 'px');
    blooms.style.setProperty('--my', (smooth.y - off.y).toFixed(1) + 'px');
    glow.style.transform = 'translate3d(' + smooth.x.toFixed(1) + 'px,' + smooth.y.toFixed(1) + 'px,0)';
    if (Math.abs(raw.x - smooth.x) > 0.4 || Math.abs(raw.y - smooth.y) > 0.4){
      rafId = requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  if (window.matchMedia('(hover: hover)').matches){
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect();
      raw.x = e.clientX - r.left;
      raw.y = e.clientY - r.top;
      if (!running){ running = true; rafId = requestAnimationFrame(loop); }
    });
    hero.addEventListener('pointerleave', function(){
      raw.x = -600; raw.y = -600;
      if (!running){ running = true; rafId = requestAnimationFrame(loop); }
    });
  }

  /* ---------- 3. drifting petals ---------- */
  if (!reduced){
    var drift = document.querySelector('.drift');
    for (var p = 0; p < 7; p++){
      var el = document.createElement('i');
      el.style.left = (6 + rnd() * 88).toFixed(1) + '%';
      el.style.animationDuration = (16 + rnd() * 14).toFixed(1) + 's';
      el.style.animationDelay = (-rnd() * 24).toFixed(1) + 's';
      el.style.opacity = (0.3 + rnd() * 0.3).toFixed(2);
      el.style.transform = 'scale(' + (0.7 + rnd() * 0.7).toFixed(2) + ')';
      drift.appendChild(el);
    }
  }

  /* ---------- 4. light/dark tone flip + active nav ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('main [data-tone]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail-nav a, .sheet a'));

  function setActive(id){
    links.forEach(function(a){
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (!en.isIntersecting) return;
      document.documentElement.dataset.tone = en.target.dataset.tone;
      setActive(en.target.id);
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

  sections.forEach(function(s){ io.observe(s); });
  document.documentElement.dataset.tone = 'light';
  setActive('home');

  /* ---------- 5. mobile menu ---------- */
  var btn = document.getElementById('menuBtn');
  var sheet = document.getElementById('sheet');

  function closeSheet(){
    sheet.dataset.open = 'false';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
  }
  btn.addEventListener('click', function(){
    var open = sheet.dataset.open === 'true';
    sheet.dataset.open = open ? 'false' : 'true';
    btn.setAttribute('aria-expanded', String(!open));
    btn.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
  });
  sheet.addEventListener('click', function(e){ if (e.target.tagName === 'A') closeSheet(); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && sheet.dataset.open === 'true'){ closeSheet(); btn.focus(); }
  });

  /* ---------- 6. contact form -> mailto draft ---------- */
  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  /* keep in sync with the two mailto: links in #contact */
  var TO = 'thespacewize@gmail.com';

  form.addEventListener('submit', function(e){
    e.preventDefault();

    var f = {
      name:    form.name.value.trim(),
      email:   form.email.value.trim(),
      type:    form.type.value,
      budget:  form.budget.value,
      message: form.message.value.trim()
    };

    var missing = [];
    if (!f.name) missing.push('cf-name');
    if (!f.email || f.email.indexOf('@') < 1) missing.push('cf-email');
    if (!f.message) missing.push('cf-message');

    if (missing.length){
      status.textContent = 'Add your name, a valid email, and a note about the project first.';
      document.getElementById(missing[0]).focus();
      return;
    }

    var subject = 'Project enquiry — ' + f.name;
    var body =
      'Name: '    + f.name    + '\n' +
      'Email: '   + f.email   + '\n' +
      'Needs: '   + f.type    + '\n' +
      'Budget: '  + f.budget  + '\n\n' +
      f.message   + '\n';

    status.textContent = 'Opening your mail app. Nothing sends until you press send there.';
    window.location.href = 'mailto:' + TO +
      '?subject=' + encodeURIComponent(subject) +
      '&body='    + encodeURIComponent(body);
  });
})();
