/* ============================================================
   Languages for spacewize.dev

   Loaded in the <head> of every page, before anything is drawn.
   English is the page as written. For any other language this reads
   the visitor's saved choice, pulls in that language's dictionary
   (assets/i18n/<code>.js) and swaps text as the page is built, so the
   page's own scripts only ever see the translated words.

   The dictionaries are keyed by the English sentence itself, so there
   is nothing to tag in the pages: a string that is in the dictionary
   is translated wherever it turns up, including text a script writes
   later. A string that is not in it stays in English.

   Ogham and Pig Latin are not dictionaries. They are worked out from
   the English letter by letter, by the two functions at the bottom.

   Changing language saves the choice and reloads the page.
   ============================================================ */
(function () {
  /* the order of this list is the order of the menu */
  var LANGS = [
    ['en',  'English'],
    ['ja',  'Japanese'],
    ['el',  'Greek'],
    ['no',  'Norwegian'],
    ['it',  'Italian'],
    ['af',  'Afrikaans'],
    ['ru',  'Russian'],
    ['de',  'German'],
    ['ko',  'Korean'],
    ['la',  'Latin'],
    ['ogm', 'Ogham'],
    ['pig', 'Pig Latin']
  ];
  var KEY = 'swz:lang';
  var GEN = { pig: pigLatin, ogm: ogham, rel: relian };
  /* Relian is not in the menu. It is unlocked by typing LANGUAGE with Shift held down. */
  var HIDDEN = { rel: 'Relian' };
  var root = document.documentElement;

  var lang = 'en';
  try { lang = localStorage.getItem(KEY) || 'en'; } catch (e) {}
  if (!HIDDEN[lang] && !LANGS.some(function (l) { return l[0] === lang; })) lang = 'en';

  /* ?i18n=collect gathers every English string the page shows, for building the dictionaries */
  var collecting = /[?&]i18n=collect\b/.test(location.search);
  var bag = collecting ? (window.__i18nBag = {}) : null;
  if (collecting) lang = 'en';

  if (lang !== 'en') {
    root.lang = lang === 'ogm' ? 'pgl' : lang === 'pig' ? 'en-x-piglatin' : lang === 'rel' ? 'art-x-relian' : lang;
    root.setAttribute('data-lang', lang);
    if (!GEN[lang]) document.write('<script src="/assets/i18n/' + lang + '.js"><\/script>');
    if (lang === 'ogm') document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Ogham&display=swap">');
    /* that font holds only the Ogham strokes, so it goes first and everything else falls through to the page's own */
    if (lang === 'ogm') document.write('<style>html[data-lang="ogm"] body,html[data-lang="ogm"] body *{font-family:"Noto Sans Ogham","Segoe UI Historic","Inter",system-ui,sans-serif !important}</style>');
  }

  /* Relian has its own characters, drawn in assets/fonts/relian.ttf. That font holds only Relian letters
     and marks, so it goes first and digits and anything else fall through to the page's own fonts. */
  if (lang === 'rel') document.write('<style>@font-face{font-family:"Relian";src:url("/assets/fonts/relian.ttf") format("truetype");font-display:swap}' +
    'html[data-lang="rel"] body,html[data-lang="rel"] body *{font-family:"Relian","Inter",system-ui,sans-serif !important;letter-spacing:.02em}' +
    /* things that are not translated keep ordinary letters: the name, addresses, the language menu */
    'html[data-lang="rel"] .wordmark,html[data-lang="rel"] .wordmark *{font-family:var(--display,"Instrument Serif"),Georgia,serif !important;letter-spacing:normal}' +
    'html[data-lang="rel"] a[href^="mailto:"],html[data-lang="rel"] [translate="no"],html[data-lang="rel"] [translate="no"] *{font-family:"Inter",system-ui,sans-serif !important;letter-spacing:normal}</style>');

  var clean = function (s) { return s.replace(/\s+/g, ' ').trim(); };
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, NOSCRIPT: 1, TEMPLATE: 1, CANVAS: 1 };
  var ATTRS = ['aria-label', 'placeholder', 'alt', 'title', 'data-name', 'data-line', 'data-stage', 'data-when'];
  /* addresses and links are never touched */
  var LITERAL = /@|https?:|\b[\w-]+\.(com|dev|io|me|ca|org|net)\b/i;

  function lookup(text) {
    var k = clean(text);
    if (!k) return null;
    if (bag) { bag[k] = 1; return null; }
    if (lang === 'en') return null;
    if (GEN[lang]) {
      /* worked out from the letters, so it must never be fed its own output: a script that copies
         translated text somewhere else would otherwise get it translated twice. Single letters are
         left alone too (the hero word is split into one letter per element). */
      if (made[k] || k.length < 2 || !/[A-Za-z]/.test(k) || LITERAL.test(k)) return null;
      var g = GEN[lang](k);
      made[g] = 1;
      return g;
    }
    var d = window.SWZ_I18N && window.SWZ_I18N[lang];
    return (d && d[k]) || null;
  }

  var made = {};                    /* everything a generated language has produced so far */
  var wrote = new WeakMap();        /* text node -> what we last put in it */
  var wroteAttr = new WeakMap();    /* element  -> { attribute: what we last put in it } */
  var whole = new WeakSet();        /* elements translated as one piece of HTML */

  function skipped(el) {
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.nodeName.toUpperCase()] || whole.has(el)) return true;
      if (el.getAttribute('translate') === 'no' || (el.classList && el.classList.contains('wordmark'))) return true;
      if (el.nodeName === 'A' && /^mailto:/i.test(el.getAttribute('href') || '')) return true;
    }
    return false;
  }

  function doText(node) {
    var v = node.nodeValue;
    if (!v || wrote.get(node) === v) return;
    var out = lookup(v);
    if (out === null) return;
    /* a choice in a form keeps its English value, so what gets sent is still readable by the owner */
    var p = node.parentNode;
    if (p && p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', clean(v));
    out = (/^\s/.test(v) ? ' ' : '') + out + (/\s$/.test(v) ? ' ' : '');
    wrote.set(node, out);
    node.nodeValue = out;
  }

  function doAttrs(el) {
    var rec = wroteAttr.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v || (rec && rec[a] === v)) continue;
      var out = lookup(v);
      if (out === null) continue;
      if (!rec) { rec = {}; wroteAttr.set(el, rec); }
      rec[a] = out;
      el.setAttribute(a, out);
    }
  }

  function walk(node) {
    if (node.nodeType === 3) { if (!skipped(node.parentNode)) doText(node); return; }
    if (node.nodeType !== 1 || skipped(node)) return;
    doAttrs(node);
    /* a sentence with markup inside it, translated as one piece so the word order can change */
    if (node.hasAttribute('data-i18n-html') && !GEN[lang]) {
      var html = lookup(node.innerHTML);
      if (html !== null) { whole.add(node); node.innerHTML = html; return; }
    }
    for (var c = node.firstChild; c; ) { var next = c.nextSibling; walk(c); c = next; }
  }

  window.swzTranslate = function () { if (lang !== 'en' || bag) walk(root); };
  window.swzLang = lang;

  if (lang !== 'en' || bag) {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') { if (!skipped(m.target.parentNode)) doText(m.target); }
        else if (m.type === 'attributes') { if (!skipped(m.target)) doAttrs(m.target); }
        else for (var k = 0; k < m.addedNodes.length; k++) walk(m.addedNodes[k]);
      }
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.addEventListener('DOMContentLoaded', window.swzTranslate);
  }

  /* ---------- the menu ---------- */
  function addMenu() {
    var home = document.querySelector('.topnav') || document.querySelector('.bar-in');
    if (!home || document.getElementById('swzLang')) return;
    var css = document.createElement('style');
    css.textContent =
      '.swz-lang{display:inline-flex;align-items:center;flex:0 0 auto}' +
      '.swz-lang select{font:inherit;font-size:.8rem;font-weight:500;line-height:1.2;color:inherit;background:transparent;' +
        'border:1px solid currentColor;border-radius:999px;padding:.42rem .55rem;cursor:pointer;max-width:8.6rem;opacity:.86}' +
      '.swz-lang select:hover,.swz-lang select:focus-visible{opacity:1}' +
      '.swz-lang option{color:#1c1418;background:#fff}' +
      '.topnav .swz-lang{margin-left:6px;color:var(--ink-soft)}' +
      '.swz-lang svg{display:none}' +
      /* on a phone the bar has no room left, so the menu becomes a round globe button in the corner */
      '@media (max-width:620px){' +
        '.swz-lang{position:fixed;right:12px;bottom:12px;z-index:44;width:44px;height:44px;border-radius:50%;justify-content:center;' +
          'color:#f4eef6;background:rgba(20,18,40,.86);border:1px solid rgba(255,255,255,.28);box-shadow:0 8px 20px -8px rgba(0,0,0,.6)}' +
        '.swz-lang svg{display:block}' +
        '.swz-lang select{position:absolute;inset:0;width:100%;height:100%;max-width:none;opacity:0;border:0;padding:0}' +
        /* translated labels run longer than the English ones: let the links slide sideways instead of spilling out */
        'html[data-lang] .topnav{min-width:0;overflow-x:auto;scrollbar-width:none}' +
        'html[data-lang] .topnav::-webkit-scrollbar{display:none}' +
        'html[data-lang] .topnav a,html[data-lang] .divs-btn{white-space:nowrap;flex:0 0 auto}' +
        'html[data-lang] .motion{white-space:normal;max-width:8.5rem;line-height:1.15;text-align:center}' +
      '}';
    document.head.appendChild(css);

    var box = document.createElement('span');
    box.className = 'swz-lang';
    box.setAttribute('translate', 'no');
    var sel = document.createElement('select');
    sel.id = 'swzLang';
    sel.setAttribute('aria-label', 'Language');
    (HIDDEN[lang] ? LANGS.concat([[lang, HIDDEN[lang]]]) : LANGS).forEach(function (l) {
      var o = document.createElement('option');
      o.value = l[0]; o.textContent = l[1];
      if (l[0] === lang) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      try { localStorage.setItem(KEY, sel.value); } catch (e) {}
      location.reload();
    });
    box.insertAdjacentHTML('afterbegin', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>');
    box.appendChild(sel);
    /* the bar's frosted glass would trap a fixed button inside it, so on a phone it hangs off the page itself */
    if (window.matchMedia('(max-width:620px)').matches) { document.body.appendChild(box); return; }
    var before = home.querySelector('#motionBtn');
    if (before) home.insertBefore(box, before); else home.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMenu); else addMenu();

  /* ---------- the way into Relian: LANGUAGE, typed with Shift held ---------- */
  (function () {
    var want = 'LANGUAGE', at = 0;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Shift') return;
      var t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.nodeName));
      if (typing || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { at = 0; return; }
      var k = (e.key || '').toUpperCase();
      at = k === want.charAt(at) ? at + 1 : (k === want.charAt(0) ? 1 : 0);
      if (at < want.length) return;
      at = 0;
      try { localStorage.setItem(KEY, lang === 'rel' ? 'en' : 'rel'); } catch (err) {}
      location.reload();
    });
  })();

  /* ---------- Relian ----------
     Follows the spec sheet's translation method: English to romanized Relian, then each romanized
     letter to its character. Words the spec defines use its spelling; every other word is spelled
     out with the letter names (a = ay or ray, b = be, c = kh ...). Word order is left as in English:
     the grammar is not finished enough to reorder sentences by rule. */
  var REL_WORDS = { home: 'hakiome', gold: 'khionen', wood: 'wuodeh', food: 'fhuodeh', book: 'beuok', goose: 'giuoessea',
    go: 'gikio', good: 'giuodeh', ace: 'aykhea', i: 'i', you: 'yio', he: 'heas', she: 'esshea', we: 'wea', they: 'tey', it: 'iot',
    what: 'wayt', who: 'wkio', where: 'wearar', when: 'weanen', why: 'wy', how: 'waykio', to: 'tu', and: 'aynendeh', is: 'essea', was: 'essea' };
  var REL_NAME = { b: 'be', c: 'kh', d: 'deh', e: 'ea', f: 'fh', g: 'gi', h: 'ha', i: 'io', j: 'jay', k: 'k', l: 'l', m: 'm', o: 'kio',
    p: 'p', q: 'q', r: 'ar', s: 'ess', t: 't', u: 'u', v: 'va', w: 'w', x: 'x', y: 'y', z: 'z' };
  /* a consonant followed by the vowel already in its name: the two merge */
  var REL_MERGE = { ja: 'jay', be: 'be', de: 'deh', gi: 'gi', ha: 'ha', va: 'va' };
  var REL_DI = { sh: '', th: '', ng: '', ph: 'fh', ch: 'kh', oo: 'uo' };
  var relPrevVowel = false;     /* the extra n carries across word boundaries */
  function relWord(w) {
    var low = w.toLowerCase(), out = '';
    if (REL_WORDS[low]) { out = REL_WORDS[low]; relPrevVowel = /[aeiou]$/.test(low); }
    else {
      for (var i = 0; i < low.length; i++) {
        var c = low.charAt(i), two = low.substr(i, 2), piece;
        if (REL_DI[two]) { piece = REL_DI[two]; i++; relPrevVowel = two === 'oo'; }
        else if (REL_MERGE[two]) { piece = REL_MERGE[two]; i++; relPrevVowel = false; }
        else if (c === 'a') { piece = relPrevVowel ? 'ray' : 'ay'; relPrevVowel = true; }
        else if (c === 'n') { piece = relPrevVowel ? 'nen' : 'en'; relPrevVowel = false; }
        else if (REL_NAME[c]) { piece = REL_NAME[c]; relPrevVowel = /[eiou]/.test(c); }
        else { piece = c; relPrevVowel = false; }
        out += piece;
      }
    }
    /* a capital is the same character with a tick: only the first letter carries it */
    if (/^[A-Z]/.test(w)) {
      var f = out.charCodeAt(0);
      out = (f >= 0xE000 && f <= 0xE002 ? String.fromCharCode(f + 0x10) : out.charAt(0).toUpperCase()) + out.slice(1);
    }
    return out;
  }
  function relian(s) {
    relPrevVowel = false;
    return s.replace(/["“”]/g, function (q, i, all) {
      return q === '”' || (q === '"' && /\S/.test(all.charAt(i - 1))) ? '”' : '“';
    }).replace(/[A-Za-z]+|[.!?:;,]/g, function (w) {
      if (!/[A-Za-z]/.test(w)) { relPrevVowel = false; return w; }
      return relWord(w);
    });
  }

  /* ---------- Pig Latin: the opening consonants go to the end, then "ay" ---------- */
  function pigLatin(s) {
    return s.replace(/[A-Za-z][A-Za-z'’]*/g, function (w) {
      var m = /^(qu|[^aeiouAEIOU]*qu|[^aeiouAEIOU]+)?(.*)$/i.exec(w), head = m[1] || '', rest = m[2];
      /* y counts as a vowel once it is past the first letter */
      var y = head.slice(1).search(/y/i);
      if (y > -1) { rest = head.slice(y + 1) + rest; head = head.slice(0, y + 1); }
      if (!rest) return w;
      var out = head ? rest + head.toLowerCase() + 'ay' : w + 'way';
      if (/^[A-Z]/.test(w)) out = out.charAt(0).toUpperCase() + (w === w.toUpperCase() && w.length > 1 ? out.slice(1).toUpperCase() : out.slice(1).toLowerCase());
      return out;
    });
  }

  /* ---------- Ogham: each letter written as its stroke, words parted by the ogham space ---------- */
  var OGHAM = { a: 'ᚐ', b: 'ᚁ', c: 'ᚉ', d: 'ᚇ', e: 'ᚓ', f: 'ᚃ', g: 'ᚌ', h: 'ᚆ', i: 'ᚔ', j: 'ᚔ', k: 'ᚉ', l: 'ᚂ', m: 'ᚋ',
    n: 'ᚅ', o: 'ᚑ', p: 'ᚚ', q: 'ᚊ', r: 'ᚏ', s: 'ᚄ', t: 'ᚈ', u: 'ᚒ', v: 'ᚃ', w: 'ᚒ', x: 'ᚉᚄ', y: 'ᚔ', z: 'ᚎ' };
  function ogham(s) {
    return s.toLowerCase().replace(/ng/g, 'ᚍ').replace(/[a-z]/g, function (c) { return OGHAM[c]; })
      .replace(/([ᚁ-ᚚ]) (?=[ᚁ-ᚚ])/g, '$1 ');
  }
})();
