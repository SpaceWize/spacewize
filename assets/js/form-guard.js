/* ==========================================================================
   Form guard - one set of rules for every form that posts to a Google Form.

   Why it exists: the Google Forms behind /notify and /yeps accept anything in
   any field, and a bot has been posting phishing links into the Name field
   (every spam row so far was a link, in a name box). A page cannot stop a
   bot that posts straight to Google; only Google's own validation can. So
   there are two halves, and they have to agree:

     1. These checks, on the page, so a real visitor is told what is wrong
        while they are still looking at the field.
     2. The same rules set as response validation on the Google Form itself.
        The exact patterns are in RULES below, written to be pasted into
        Google Forms > question > Response validation > Regular expression.

   The page's rules are never looser than Google's. The page cannot see
   whether Google accepted a submission (the post is cross-origin), so if the
   page let something through that Google then refused, a real person would
   be shown "That's it" and silently lose their signup.
   ========================================================================== */
(function () {
  'use strict';

  /* Patterns for Google Forms (RE2 syntax, whole-answer match). Kept as
     strings so this file is the one place they live. */
  var RULES = {
    firstName: '^[\\p{L}][\\p{L}\\p{M} \'’.\\-]{0,39}$',
    fullName:  '^[\\p{L}][\\p{L}\\p{M} \'’.\\-]{1,59}$',
    email:     '^[A-Za-z0-9._%+\\-]{1,64}@[A-Za-z0-9.\\-]{1,190}\\.[A-Za-z]{2,24}$',
    phone:     '^[0-9+().\\- ]{7,20}$',
    /* "Response validation > Regular expression > Doesn't contain" */
    link:      '(?i)(https?:|www\\.|://|[a-z0-9\\-]+\\.[a-z]{2,24}/|\\.(com|net|org|ru|ly|io|xyz|top|click|me|app|site|online|info)\\b)'
  };

  var FIRST_NAME = /^[\p{L}][\p{L}\p{M} '’.\-]{0,39}$/u;
  var FULL_NAME  = /^[\p{L}][\p{L}\p{M} '’.\-]{1,59}$/u;
  var EMAIL      = /^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$/;
  var PHONE      = /^[0-9+().\- ]{7,20}$/;
  var LINK       = /https?:|www\.|:\/\/|[a-z0-9\-]+\.[a-z]{2,24}\/|\.(com|net|org|ru|ly|io|xyz|top|click|me|app|site|online|info)\b/i;

  /* Page-only. Names allow dots and hyphens (for initials and double names),
     which also lets a bare domain like "cheap-pills.xyz" through. A dot run
     straight into letters is the shape of a domain; "J. Smith" is not. */
  var NAME_DOMAIN = /\.\p{L}{2,}/u;

  /* Page-only, per browser: a visitor may send this many times in 24 hours.
     Stored in localStorage; a script that clears it gets past this, which is
     why it is one check among several and not the defence. */
  var DAY = 24 * 60 * 60 * 1000;

  /* Page-only, because Google cannot hold a list like this on a form: domains
     the spam has come from, and the best-known throwaway services. */
  var THROWAWAY = [
    'uberip.com', 'maxxspace.com',
    'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com',
    'yopmail.com', 'tempmail.com', 'trashmail.com'
  ];

  /* Each returns '' when fine, otherwise the sentence the visitor sees. A
     blank value is never judged here - "required" is the browser's job. */
  var check = {
    firstName: function (v) {
      if (NAME_DOMAIN.test(v)) return 'Please leave web addresses out of this box.';
      return FIRST_NAME.test(v) ? '' : 'Letters only, please - no numbers, links or symbols. First name is enough.';
    },
    fullName: function (v) {
      if (NAME_DOMAIN.test(v)) return 'Please leave web addresses out of this box.';
      return FULL_NAME.test(v) ? '' : 'Letters only, please - no numbers, links or symbols.';
    },
    email: function (v) {
      if (!EMAIL.test(v)) return 'That does not look like an email address.';
      var domain = v.slice(v.lastIndexOf('@') + 1).toLowerCase();
      return THROWAWAY.indexOf(domain) === -1 ? '' : 'That looks like a throwaway address - please use one you read.';
    },
    phone: function (v) {
      return PHONE.test(v) && (v.match(/\d/g) || []).length >= 7
        ? '' : 'Please enter a phone number - digits, spaces and + ( ) - only.';
    },
    note: function (v) {
      return LINK.test(v) ? 'Please leave web addresses out of this box.' : '';
    }
  };

  /* Ties a check to a field through the browser's own validation, so the
     message appears in the same bubble as "please fill in this field", is
     announced by assistive tech, and blocks the submit with no extra UI.
     A disabled or empty field is never judged. */
  function bind(input, fn) {
    if (!input) return;
    function run() {
      var v = input.value.trim();
      input.setCustomValidity(v === '' || input.disabled ? '' : fn(v));
    }
    input.addEventListener('input', run);
    input.addEventListener('change', function () {
      input.value = input.value.trim();
      run();
    });
    run();
  }

  /* What is posted is exactly what was checked: spaces trimmed off the ends,
     because Google's patterns are anchored and " Sam" would be refused. Run
     from a submit handler - the form's data is read after it returns. */
  function trim(form) {
    var els = form.querySelectorAll('input[type=text], input[type=email], input[type=tel], textarea');
    for (var i = 0; i < els.length; i++) els[i].value = els[i].value.trim();
  }

  /* A person's keys, taps and clicks are trusted events (isTrusted is true).
     Events a script fires itself (element.click(), dispatchEvent) are not.
     Returns a function that says whether any trusted interaction happened.
     Does not see a bot that drives a real browser through the DevTools
     protocol, since those events are trusted too. */
  function watch(form) {
    var touched = false;
    function mark(e) { if (e.isTrusted) touched = true; }
    var kinds = ['pointerdown', 'keydown', 'touchstart', 'input', 'change'];
    for (var i = 0; i < kinds.length; i++) {
      form.addEventListener(kinds[i], mark, { capture: true, passive: true });
    }
    return function () { return touched; };
  }

  /* Returns true and counts this send if the browser is under `max` sends in
     the last 24 hours for `key`. Returns true without counting if storage is
     unavailable - a failure here must never stop a real person. */
  function takeSend(key, max) {
    try {
      var k = 'swz-sent-' + key;
      var now = Date.now();
      var log = JSON.parse(localStorage.getItem(k) || '[]').filter(function (t) {
        return typeof t === 'number' && now - t < DAY;
      });
      if (log.length >= max) return false;
      log.push(now);
      localStorage.setItem(k, JSON.stringify(log));
    } catch (err) { /* storage blocked or corrupt: let the send through */ }
    return true;
  }

  window.swzGuard = { RULES: RULES, check: check, bind: bind, trim: trim, watch: watch, takeSend: takeSend };
})();
