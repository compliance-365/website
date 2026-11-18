/* Email address check for the website's forms (checklists, and anything else
 * that wants it). Three steps, all in the visitor's browser:
 *   1. The address looks like an address.
 *   2. The domain is not a disposable inbox (mailinator and similar) or an
 *      obvious typo of a common one (gmial.com).
 *   3. The domain can actually receive email (it has a mail server).
 *
 * Step 3 asks a public DNS-over-HTTPS service. If that service is slow or
 * unreachable we let the address through: a broken lookup must never stop a
 * real person from getting their report. Free webmail (gmail, outlook) is
 * allowed on purpose: plenty of small organisations use it.
 *
 * Pure checks are on window.c365EmailCheck so they can be tested without a
 * browser (test/email-check.test.mjs). */
(function () {
  'use strict';

  /* Disposable and throwaway inboxes. A subdomain of any of these also counts. */
  var DISPOSABLE = [
    'mailinator.com', 'mailinator.net', 'mailinator2.com', 'guerrillamail.com', 'guerrillamail.net',
    'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'sharklasers.com',
    'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net', '20minutemail.com',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempr.email', 'tempinbox.com',
    'yopmail.com', 'yopmail.net', 'yopmail.fr', 'trashmail.com', 'trashmail.net', 'trashmail.de',
    'throwawaymail.com', 'getnada.com', 'nada.email', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com',
    'mailnesia.com', 'mintemail.com', 'mytemp.email', 'moakt.com', 'spamgourmet.com', 'mohmal.com',
    'emailondeck.com', 'burnermail.io', 'inboxkitten.com', 'mailcatch.com', 'discard.email', 'spambox.us',
    'tmpmail.org', 'tmpmail.net', 'zetmail.com', 'mailnull.com', 'anonbox.net', 'mailsac.com',
    'harakirimail.com', 'getairmail.com', 'fakemail.net', 'emailfake.com', 'crazymailing.com',
    'example.com', 'example.org', 'example.net', 'test.com'
  ];

  /* Common slips on popular domains, with what they probably meant. */
  var TYPOS = {
    'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
    'gmail.con': 'gmail.com', 'gmail.cim': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com',
    'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com', 'outlook.con': 'outlook.com',
    'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com'
  };

  function domainOf(email) {
    var at = String(email || '').lastIndexOf('@');
    return at < 0 ? '' : String(email).slice(at + 1).trim().toLowerCase();
  }

  function isDisposable(domain) {
    for (var i = 0; i < DISPOSABLE.length; i++) {
      var d = DISPOSABLE[i];
      if (domain === d || (domain.length > d.length && domain.slice(-(d.length + 1)) === '.' + d)) return true;
    }
    return false;
  }

  /* Steps 1 and 2: no network. Returns { ok, reason, message, suggestion }. */
  function checkShape(raw) {
    var email = String(raw || '').trim();
    if (!email) return { ok: false, reason: 'empty', message: 'Please enter your email address.' };
    if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || /\.\./.test(email) || /^\.|\.@|@\./.test(email)) {
      return { ok: false, reason: 'format', message: 'That does not look like an email address. Please check it and try again.' };
    }
    var domain = domainOf(email);
    if (TYPOS[domain]) {
      var fix = email.slice(0, email.lastIndexOf('@') + 1) + TYPOS[domain];
      return { ok: false, reason: 'typo', suggestion: fix, message: 'Did you mean ' + fix + '? Please check the address.' };
    }
    if (isDisposable(domain)) {
      return { ok: false, reason: 'disposable', message: 'Please use a work or personal email address that you read. Temporary inboxes cannot receive your report.' };
    }
    return { ok: true, reason: 'ok' };
  }

  /* Step 3: does the domain have a mail server? Resolves { ok, reason }.
   * Only a clear "this domain does not exist / takes no mail" answer fails. */
  var cache = {};
  function dohQuery(domain, type, fetchImpl, timeoutMs) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
    return fetchImpl('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=' + type, {
      headers: { accept: 'application/dns-json' }, signal: ctl ? ctl.signal : undefined
    }).then(function (r) { if (timer) clearTimeout(timer); if (!r.ok) throw new Error('dns ' + r.status); return r.json(); },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function checkDomain(raw, fetchImpl, timeoutMs) {
    var domain = domainOf(raw);
    var doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(window) : null);
    if (!domain || !doFetch) return Promise.resolve({ ok: true, reason: 'skipped' });
    if (cache[domain]) return cache[domain];
    var bad = { ok: false, reason: 'no-mail', message: 'We could not find a mail server for ' + domain + '. Please check the address after the @.' };
    var t = timeoutMs || 4000;
    cache[domain] = dohQuery(domain, 'MX', doFetch, t).then(function (j) {
      if (j.Status === 3) return bad; /* NXDOMAIN: the domain does not exist */
      var mx = (j.Answer || []).filter(function (a) { return a.type === 15; });
      if (mx.length) {
        /* "0 ." is a null MX: the domain says it takes no email. */
        var real = mx.filter(function (a) { return !/^\s*\d+\s+\.?\s*$/.test(String(a.data || '')); });
        return real.length ? { ok: true, reason: 'mx' } : bad;
      }
      /* No MX record: mail can still go to the domain's own address record. */
      return dohQuery(domain, 'A', doFetch, t).then(function (a) {
        return (a.Answer || []).some(function (x) { return x.type === 1; }) ? { ok: true, reason: 'a-record' } : bad;
      });
    }).catch(function () { return { ok: true, reason: 'lookup-failed' }; }); /* fail open */
    return cache[domain];
  }

  function check(raw, fetchImpl, timeoutMs) {
    var s = checkShape(raw);
    if (!s.ok) return Promise.resolve(s);
    return checkDomain(raw, fetchImpl, timeoutMs);
  }

  /* For a form: checks the address in `input`, shows a short message under it
   * if it fails (and puts the cursor back there), and calls onOk() when it passes. */
  function gate(input, onOk) {
    if (!input) { onOk(); return; }
    var note = document.getElementById(input.id + '-check');
    if (!note) {
      note = document.createElement('div');
      note.id = input.id + '-check';
      note.setAttribute('role', 'alert');
      note.style.cssText = 'color:#9B1C2E;font-size:0.85rem;margin-top:6px;display:none;';
      input.parentNode.insertBefore(note, input.nextSibling);
    }
    note.style.display = 'none';
    input.style.borderColor = '#C8C3B8';
    input.style.background = 'white';
    check(input.value).then(function (r) {
      if (r.ok) { onOk(); return; }
      note.textContent = r.message;
      note.style.display = 'block';
      input.style.borderColor = '#9B1C2E';
      input.style.background = '#F9E9EA';
      try { input.focus(); } catch (e) {}
    });
  }

  window.c365EmailCheck = { checkShape: checkShape, checkDomain: checkDomain, check: check, isDisposable: isDisposable };
  window.c365EmailGate = gate;
})();
