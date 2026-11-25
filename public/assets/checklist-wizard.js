/* Guided flow for the readiness checklists: one section per screen, with a
   progress bar and Back / Next. See src/components/ChecklistWizard.astro.
   It only shows and hides the page's own markup; scoring, the details form,
   the PDF and the lead email stay in each page's script. */
(function () {
  'use strict';

  function init() {
    var stage1 = document.getElementById('stage-1');
    var stage2 = document.getElementById('stage-2');
    var stage3 = document.getElementById('stage-3');
    if (!stage2) return;
    var sections = Array.prototype.slice.call(stage2.querySelectorAll('.checklist-section'));
    if (!sections.length) return;
    var host = sections[0].parentNode;
    var n = sections.length;
    var cur = 0;

    document.documentElement.classList.add('cl-wizard');

    // The old row of section chips: the progress dots replace it.
    var chip = stage2.querySelector('.section-nav-item');
    if (chip && chip.parentNode !== host) chip.parentNode.classList.add('clw-hidden');

    function titleOf(sec) {
      var h = sec.querySelector('h3');
      return h ? h.textContent.trim() : '';
    }
    function counts(sec) {
      var qs = sec.querySelectorAll('.field[data-id]');
      var a = 0;
      for (var i = 0; i < qs.length; i++) if (qs[i].querySelector('.opt.active')) a++;
      return { answered: a, total: qs.length };
    }
    function firstIncomplete() {
      for (var i = 0; i < n; i++) { var c = counts(sections[i]); if (c.answered < c.total) return i; }
      return n;
    }

    // Progress header
    var head = document.createElement('div');
    head.className = 'clw-head band-light';
    head.innerHTML =
      '<div class="clw-head-row"><span class="clw-step"></span><span class="clw-count"></span></div>' +
      '<div class="clw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>' +
      '<div class="clw-dots"></div>';
    host.insertBefore(head, sections[0]);
    var dotsEl = head.querySelector('.clw-dots');
    var dots = sections.map(function (sec, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'clw-dot';
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', 'Section ' + (i + 1) + ': ' + titleOf(sec));
      b.title = titleOf(sec);
      b.addEventListener('click', function () { go(i); });
      dotsEl.appendChild(b);
      return b;
    });

    // Back / Next
    var nav = document.createElement('div');
    nav.className = 'clw-nav';
    nav.innerHTML =
      '<button type="button" class="clw-back">← Back</button>' +
      '<span class="clw-hint" aria-live="polite"></span>' +
      '<button type="button" class="clw-next"></button>';
    var last = sections[n - 1];
    last.parentNode.insertBefore(nav, last.nextSibling);
    var backBtn = nav.querySelector('.clw-back');
    var nextBtn = nav.querySelector('.clw-next');
    var hint = nav.querySelector('.clw-hint');

    function render() {
      var all = 0, total = 0;
      sections.forEach(function (sec, i) {
        var c = counts(sec);
        all += c.answered; total += c.total;
        sec.style.display = i === cur ? '' : 'none';
      });
      var reach = firstIncomplete();
      dots.forEach(function (d, i) {
        var c = counts(sections[i]);
        d.className = 'clw-dot' + (i === cur ? ' current' : (c.answered === c.total ? ' done' : ''));
        d.disabled = i > reach;
        if (i === cur) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
      });
      var pct = total ? Math.round(all / total * 100) : 0;
      head.querySelector('.clw-step').textContent = 'Section ' + (cur + 1) + ' of ' + n + ' · ' + titleOf(sections[cur]);
      head.querySelector('.clw-count').textContent = all + ' of ' + total + ' questions answered';
      head.querySelector('.clw-bar span').style.width = pct + '%';
      head.querySelector('.clw-bar').setAttribute('aria-valuenow', String(pct));

      var c = counts(sections[cur]);
      var done = c.answered === c.total;
      backBtn.hidden = cur === 0;
      nextBtn.textContent = cur < n - 1 ? 'Next section →' : 'See my results →';
      nextBtn.disabled = !done;
      var left = c.total - c.answered;
      hint.textContent = done ? '' : (left === 1 ? '1 question left in this section' : left + ' questions left in this section');
    }

    function go(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      render();
      head.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    backBtn.addEventListener('click', function () { go(cur - 1); });
    nextBtn.addEventListener('click', function () {
      if (nextBtn.disabled) return;
      if (cur < n - 1) { go(cur + 1); return; }
      var pdf = document.getElementById('pdfBtn');
      if (pdf) { pdf.disabled = false; pdf.click(); }
    });

    // Re-render after the page's own answer handler has run.
    stage2.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.opt')) setTimeout(render, 0);
    });
    var reset = document.getElementById('resetBtn');
    if (reset) reset.addEventListener('click', function () { setTimeout(function () { cur = 0; render(); }, 0); });

    // The start button in the hero lands on the progress header.
    document.querySelectorAll('.cls-start').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        head.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // The page's setStage() scrolls to the very top (the hero). Bring the
    // details form and the results into view instead, and show the score on
    // the results screen.
    function visible(el) { return el && el.style.display !== 'none'; }
    function watch(el, onShow) {
      if (!el || !window.MutationObserver) return;
      var was = visible(el);
      new MutationObserver(function () {
        var now = visible(el);
        if (now && !was) onShow();
        was = now;
      }).observe(el, { attributes: true, attributeFilter: ['style'] });
    }
    function bringIntoView(el) {
      setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    }
    if (stage1) stage1.style.scrollMarginTop = '90px';
    if (stage3) stage3.style.scrollMarginTop = '90px';
    watch(stage1, function () { bringIntoView(stage1); });
    watch(stage2, function () { render(); bringIntoView(head); });
    watch(stage3, function () { showResults(); bringIntoView(stage3); });

    function showResults() {
      var card = stage3.querySelector('.card') || stage3;
      var old = card.querySelector('.clw-results');
      if (old) old.parentNode.removeChild(old);
      var panel = document.querySelector('#score-panel .card');
      if (!panel) return;
      var box = document.createElement('div');
      box.className = 'clw-results band-light';
      var parts = panel.children;
      // The panel's first two blocks are the overall score and the area bars.
      if (parts[0]) { var s = parts[0].cloneNode(true); s.removeAttribute('style'); s.className = 'clw-results-score'; box.appendChild(s); }
      if (parts[1]) box.appendChild(parts[1].cloneNode(true));
      var ai = document.getElementById('aiDiscussBtn');
      if (ai) { ai.disabled = false; ai.style.opacity = '1'; ai.style.cursor = 'pointer'; box.appendChild(ai); }
      var buttons = card.querySelector('a.btn');
      var anchor = buttons ? buttons.parentNode : null;
      if (anchor && anchor.parentNode === card) card.insertBefore(box, anchor);
      else card.appendChild(box);
    }

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
