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

  /* ---------- 6. contact form -> mailto draft, web compose, or clipboard ---------- */
  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  /* keep in sync with the plain mailto: links in #contact */
  var TO = 'thespacewize@gmail.com';

  function readForm(){
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
    return { fields: f, missing: missing };
  }

  function buildDraft(f){
    return {
      subject: 'Project enquiry — ' + f.name,
      body:
        'Name: '    + f.name    + '\n' +
        'Email: '   + f.email   + '\n' +
        'Needs: '   + f.type    + '\n' +
        'Budget: '  + f.budget  + '\n\n' +
        f.message   + '\n'
    };
  }

  /* Validates, then hands the built draft to `run`. Every button below goes
     through this so "fill in your name first" only has to be written once. */
  function withDraft(run){
    var r = readForm();
    if (r.missing.length){
      status.textContent = 'Add your name, a valid email, and a note about the project first.';
      document.getElementById(r.missing[0]).focus();
      return;
    }
    run(r.fields, buildDraft(r.fields));
  }

  /* Web compose URLs open a normal browser tab and need nothing installed or
     set as a system default — unlike mailto:, which silently does nothing on
     a machine with no registered mail app. */
  var PROVIDERS = {
    gmail: function(d){
      return 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(TO) +
        '&su=' + encodeURIComponent(d.subject) + '&body=' + encodeURIComponent(d.body);
    },
    outlook: function(d){
      return 'https://outlook.live.com/mail/0/deeplink/compose?to=' + encodeURIComponent(TO) +
        '&subject=' + encodeURIComponent(d.subject) + '&body=' + encodeURIComponent(d.body);
    },
    yahoo: function(d){
      return 'https://compose.mail.yahoo.com/?to=' + encodeURIComponent(TO) +
        '&subject=' + encodeURIComponent(d.subject) + '&body=' + encodeURIComponent(d.body);
    }
  };

  form.addEventListener('submit', function(e){
    e.preventDefault();
    withDraft(function(f, d){
      status.textContent = 'Opening your mail app. Nothing sends until you press send there.';
      window.location.href = 'mailto:' + TO +
        '?subject=' + encodeURIComponent(d.subject) +
        '&body='    + encodeURIComponent(d.body);
    });
  });

  Array.prototype.slice.call(document.querySelectorAll('[data-provider]')).forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.textContent.trim();
      withDraft(function(f, d){
        status.textContent = 'Opening ' + name + ' in a new tab. Nothing sends until you press send there.';
        window.open(PROVIDERS[btn.dataset.provider](d), '_blank', 'noopener');
      });
    });
  });

  /* Clipboard write needs a secure context (https) in most browsers and can
     be unavailable over file:// or on very old browsers — fall back to a
     hidden textarea + execCommand, which needs neither. */
  function copyText(text){
    if (navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject){
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /* "Add site care" already jumps to the form; it also says so in the
     message now, because the jump on its own leaves the visitor to
     explain what they just clicked. Appended rather than assigned, so
     anything already typed survives, and only once however many times
     the button is pressed. */
  var careBtn = document.getElementById('careBtn');
  if (careBtn) {
    careBtn.addEventListener('click', function(){
      var box = document.getElementById('cf-message');
      if (!box) return;
      var line = 'I would like to add Site Care to my website.';
      if (box.value.indexOf(line) === -1) {
        var had = box.value.replace(/\s+$/, '');
        box.value = had ? had + '\n\n' + line : line;
      }
      /* the budget line should agree with what they just asked for,
         but not overwrite a project they had already picked */
      var budget = document.getElementById('cf-budget');
      if (budget && budget.selectedIndex === budget.options.length - 1) {
        for (var i = 0; i < budget.options.length; i++) {
          if (budget.options[i].value.indexOf('Site care') === 0) {
            budget.selectedIndex = i; break;
          }
        }
      }
      status.textContent = 'Added to your message below - tell me about the site and send it over.';
    });
  }

  var copyBtn = document.getElementById('copyBtn');
  copyBtn.addEventListener('click', function(){
    withDraft(function(f, d){
      var text = 'To: ' + TO + '\nSubject: ' + d.subject + '\n\n' + d.body;
      copyText(text).then(function(){
        status.textContent = 'Copied — paste it into any email or message.';
      }, function(){
        status.textContent = 'Could not copy automatically. Select the text and copy it by hand.';
      });
    });
  });
})();
