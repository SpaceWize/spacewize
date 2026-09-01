/* Carries the visitor from this branch up to the tree it belongs to.
   The link works on its own with no JavaScript — this only adds the
   transition on top of it. */
(function () {
  var pin  = document.getElementById('branchPin');
  var wipe = document.getElementById('pageWipe');
  if (!pin || !wipe) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  pin.addEventListener('click', function (e) {
    /* let modified clicks (new tab, download) behave normally */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();

    var href = pin.getAttribute('href');

    /* tell the next page to open from the middle rather than cut in */
    try { sessionStorage.setItem('swz:arrive', '1'); } catch (err) {}

    if (calm.matches) { window.location.href = href; return; }

    /* swell out of the marker itself, not the middle of the screen */
    var r = pin.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var far = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    ) + 40;

    wipe.style.left = cx + 'px';
    wipe.style.top = cy + 'px';
    wipe.style.width = wipe.style.height = far * 2 + 'px';
    wipe.style.marginLeft = wipe.style.marginTop = -far + 'px';

    /* Force a style recalculation so scale(0) is committed as the
       starting value. Without this the size change and the transform
       change land in one batch and the browser has nothing to animate
       between. */
    void getComputedStyle(wipe).transform;
    wipe.dataset.on = 'true';

    var gone = false;
    var go = function () { if (!gone) { gone = true; window.location.href = href; } };
    wipe.addEventListener('transitionend', function (ev) {
      /* a short beat at full cover before the page changes, so the
         swap happens while the screen is solid and cannot be seen */
      if (ev.propertyName === 'transform') setTimeout(go, 120);
    });
    /* never strand the visitor behind the overlay if the event is missed */
    setTimeout(go, 1900);
  });
})();
