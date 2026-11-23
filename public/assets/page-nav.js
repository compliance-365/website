/* Long service pages: an "On this page" bar and shorter card grids on phones.
   Loaded by BaseLayout on /services/<name>/ pages only.

   Wide screens: a slim bar docks under the site header once the hero has
   scrolled by. It lists the page's section headings and highlights the
   one being read, so a 15,000-pixel page can be skimmed and jumped.

   Phones (below 900px): a grid of more than four cards shows its first
   three and a "Show all" button. Nothing is removed: the cards stay in
   the page (and for search engines), they are just folded until asked
   for. */
(function () {
  var main = document.getElementById('main-content');
  if (!main) return;

  /* ---------- Phones: fold long card grids ---------- */
  var PHONE = window.matchMedia('(max-width: 899px)');
  function foldGrids() {
    if (!PHONE.matches) return;
    main.querySelectorAll('.grid-2, .grid-3, .grid-4').forEach(function (grid) {
      if (grid.dataset.folded) return;
      var cards = Array.prototype.filter.call(grid.children, function (c) { return c.classList.contains('card'); });
      if (cards.length < 5 || cards.length !== grid.children.length) return;
      if (grid.querySelector('form, input, select, details')) return;
      grid.dataset.folded = '1';
      cards.slice(3).forEach(function (c) { c.hidden = true; });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pn-more';
      btn.textContent = 'Show all ' + cards.length;
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        cards.forEach(function (c) { c.hidden = false; });
        btn.remove();
        if (cards[3]) { var f = cards[3].querySelector('a, button, h3'); if (f) { f.setAttribute('tabindex', f.getAttribute('tabindex') || '-1'); f.focus({ preventScroll: true }); } }
      });
      /* Dark sections get the light button: find the nearest ancestor with
         a painted background (a transparent one means the light page). */
      var el = grid, bg = null;
      while (el && el !== document.documentElement) {
        var m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > 0.5)) { bg = m; break; }
        el = el.parentElement;
      }
      if (bg && (+bg[0] * 0.299 + +bg[1] * 0.587 + +bg[2] * 0.114) < 90) btn.classList.add('pn-more--dark');
      grid.insertAdjacentElement('afterend', btn);
    });
  }

  /* ---------- Wide screens: "On this page" bar ---------- */
  function slug(t) { return t.toLowerCase().replace(/&amp;|&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  var heads = Array.prototype.filter.call(main.querySelectorAll('section h2'), function (h) {
    if (h.closest('.svc-hero, .svc-final-cta, form, [role="dialog"]')) return false;
    return h.offsetParent !== null && h.textContent.trim().length > 2;
  });
  if (heads.length >= 4) {
    var used = {};
    heads.forEach(function (h) {
      var sec = h.closest('section');
      var target = sec || h;
      if (!target.id) {
        var id = 'sec-' + slug(h.textContent);
        while (used[id] || document.getElementById(id)) id += '-2';
        target.id = id;
      }
      used[target.id] = 1;
      h.dataset.pnTarget = target.id;
    });
    var bar = document.createElement('nav');
    bar.className = 'pn-bar';
    bar.setAttribute('aria-label', 'On this page');
    var inner = '<span class="pn-title">On this page</span><div class="pn-links">';
    heads.forEach(function (h) {
      var label = h.textContent.replace(/\s+/g, ' ').trim().replace(/[—–:.?].*$/, '').trim() || h.textContent.trim();
      inner += '<a href="#' + h.dataset.pnTarget + '" data-pn="' + h.dataset.pnTarget + '">' + label.replace(/</g, '&lt;') + '</a>';
    });
    bar.innerHTML = inner + '</div>';
    document.body.appendChild(bar);
    var links = bar.querySelectorAll('a');
    var header = document.querySelector('.site-header');
    var hero = main.querySelector('.svc-hero, section');
    function headerH() { return header ? header.getBoundingClientRect().height : 0; }
    function place() {
      bar.style.top = headerH() + 'px';
      var past = hero ? hero.getBoundingClientRect().bottom < headerH() : window.scrollY > 600;
      bar.classList.toggle('is-on', past && !PHONE.matches);
      var current = null, line = headerH() + bar.offsetHeight + 24;
      heads.forEach(function (h) { var t = document.getElementById(h.dataset.pnTarget) || h; if (t.getBoundingClientRect().top <= line) current = h.dataset.pnTarget; });
      links.forEach(function (a) {
        var on = a.dataset.pn === current;
        a.classList.toggle('is-current', on);
        if (on) { a.setAttribute('aria-current', 'location'); if (bar.classList.contains('is-on')) keepVisible(a); } else a.removeAttribute('aria-current');
      });
    }
    var lastShown = null;
    function keepVisible(a) {
      if (a === lastShown) return; lastShown = a;
      var box = a.parentNode, l = a.offsetLeft, r = l + a.offsetWidth;
      if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: l - 24, behavior: 'smooth' });
    }
    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        var t = document.getElementById(a.dataset.pn); if (!t) return;
        e.preventDefault();
        var y = t.getBoundingClientRect().top + window.scrollY - headerH() - bar.offsetHeight - 12;
        window.scrollTo({ top: y, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        history.replaceState(null, '', '#' + a.dataset.pn);
      });
    });
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; place(); }); } }, { passive: true });
    window.addEventListener('resize', place);
    place();
  }

  foldGrids();
  if (PHONE.addEventListener) PHONE.addEventListener('change', foldGrids);
})();
