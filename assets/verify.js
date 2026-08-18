/* ==========================================================================
   One-box contractor lookup
   --------------------------------------------------------------------------
   Asks L&I for a contractor by name, licence number, or UBI, then joins the
   bond and insurance files onto whatever comes back.

   Two things are deliberate:

   1. A missing bond row is reported as "the state publishes no current bond",
      never as "unbonded". About 46% of active registrations have no row in
      that file, at a rate flat across every cohort since 2010, and Washington
      allows an assigned savings account in place of a surety bond. The data
      does not support the stronger sentence. See build/RESEARCH.md.

   2. Searching is statewide. Someone checking a quote does not care which
      county the contractor files their mail in.
   ========================================================================== */
(function () {
  'use strict';

  var API = 'https://data.wa.gov/resource/';
  var form = document.getElementById('lookupForm');
  var input = document.getElementById('lookupInput');
  var statusEl = document.getElementById('lookupStatus');
  var results = document.getElementById('lookupResults');
  if (!form) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var sq = function (s) { return String(s).replace(/'/g, "''"); };

  var KEEP = ['LLC','PLLC','LLP','LP','PC','PS','USA','US','HVAC','PNW','NW','NE','SW','SE','WA','II','III','IV'];
  function titleCase(s) {
    if (!s) return '';
    return String(s).toLowerCase().split(/\s+/).map(function (w) {
      var up = w.toUpperCase().replace(/[^A-Z]/g, '');
      if (KEEP.indexOf(up) >= 0) return w.toUpperCase();
      return w.replace(/^[a-z]/, function (c) { return c.toUpperCase(); })
              .replace(/([-/])([a-z])/g, function (_, sep, c) { return sep + c.toUpperCase(); })
              .replace(/'([a-z]{2,})/g, function (m, r) { return "'" + r.charAt(0).toUpperCase() + r.slice(1); });
    }).join(' ');
  }
  function money(v) {
    var n = Number(v);
    return isFinite(n) && n ? '$' + Math.round(n).toLocaleString('en-US') : '—';
  }
  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US',
      { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function phone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d.length === 10 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6) : String(v || '');
  }

  function current(effective, cancelled, expires) {
    var now = new Date();
    var e = effective ? new Date(effective) : null;
    var c = cancelled ? new Date(cancelled) : null;
    var x = expires ? new Date(expires) : null;
    if (e && !isNaN(e) && e > now) return false;
    if (c && !isNaN(c) && c <= now) return false;
    if (x && !isNaN(x) && x <= now) return false;   // "Until Canceled" parses NaN -> no expiry
    return true;
  }

  function get(resource, where, limit) {
    var url = API + resource + '.json?$where=' + encodeURIComponent(where) +
      '&$limit=' + (limit || 50) + '&$order=:id';
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('The state’s data service returned HTTP ' + r.status + '.');
      return r.json();
    });
  }

  function buildWhere(term) {
    var t = sq(term.trim());
    var digits = t.replace(/\D/g, '');
    var parts = ["upper(businessname) like '%" + t.toUpperCase() + "%'",
                 "upper(contractorlicensenumber)='" + t.toUpperCase() + "'"];
    if (digits.length >= 9) parts.push("ubi='" + digits + "'");
    return '(' + parts.join(' OR ') + ')';
  }

  function pill(ok, label, detail) {
    return '<span class="pill ' + (ok ? 'pill--yes' : 'pill--no') + '" title="' + esc(detail) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      (ok ? '<path d="M4 12l5 5L20 6"/>' : '<path d="M6 6l12 12M18 6L6 18"/>') +
      '</svg>' + esc(label) + '</span>';
  }

  var ACTIVE_NOTE = {
    'ACTIVE': ['yes', 'Active registration'],
    'SUSPENDED': ['no', 'SUSPENDED — the state has told this business to stop working'],
    'EXPIRED': ['no', 'Expired registration'],
    'OUT OF BUSINESS': ['no', 'Recorded as out of business'],
    'REVOKED': ['no', 'Revoked']
  };

  function render(rec) {
    var st = String(rec.contractorlicensestatus || '').toUpperCase();
    var note = ACTIVE_NOTE[st] || ['no', st || 'Unknown status'];
    var live = note[0] === 'yes';
    var b = rec._bond, i = rec._ins;
    var name = titleCase(rec.businessname);
    var lni = 'https://secure.lni.wa.gov/verify/Detail.aspx?UBI=' +
      encodeURIComponent(rec.ubi || '') + '&LIC=' + encodeURIComponent(rec.contractorlicensenumber || '');

    return '<article class="card">' +
      '<header class="card__head">' +
        '<h3 class="card__name">' + esc(name) + '</h3>' +
        '<div class="card__status">' +
          pill(live, live ? 'Licensed' : 'Not active', note[1]) +
          pill(!!b, 'Bonded', b ? b.bondfirmname + ' — ' + money(b.bondamt)
                                : 'No current bond published for this licence') +
          pill(!!i, 'Insured', i ? i.insurancecompany + ' — ' + money(i.insuranceamt)
                                 : 'No current policy published for this licence') +
        '</div>' +
      '</header>' +

      (live ? '' : '<p class="flag flag--bad"><strong>' + esc(note[1]) + '.</strong> ' +
        'Whatever they told you, the state does not currently list this business as able ' +
        'to work. Ask them about it before you go any further.</p>') +

      (rec._impaired ? '<p class="flag flag--warn">A claim has been paid against this ' +
        'contractor’s bond' + (rec._impaired.bondimpaireddate ?
        ' (' + fmtDate(rec._impaired.bondimpaireddate) + ')' : '') + '.</p>' : '') +

      (!b ? '<p class="flag flag--info">The state publishes no current bond for this licence. ' +
        'That is not the same as being unbonded — the published file is missing rows for ' +
        'roughly half of all active registrations, and Washington allows an assigned savings ' +
        'account in place of a surety bond. Ask them for proof.</p>' : '') +

      '<dl class="card__meta">' +
        '<div><dt>Status</dt><dd>' + esc(titleCase(rec.contractorlicensestatus || '—')) + '</dd></div>' +
        '<div><dt>License #</dt><dd class="mono">' + esc(rec.contractorlicensenumber) + '</dd></div>' +
        '<div><dt>UBI</dt><dd class="mono">' + esc(rec.ubi || '—') + '</dd></div>' +
        '<div><dt>Type</dt><dd>' + esc(titleCase(rec.contractorlicensetypecodedesc || '—')) + '</dd></div>' +
        '<div><dt>Specialty</dt><dd>' + esc(titleCase(rec.specialtycode1desc || 'General')) + '</dd></div>' +
        '<div><dt>Registered since</dt><dd>' + fmtDate(rec.licenseeffectivedate) + '</dd></div>' +
        '<div><dt>Expires</dt><dd>' + fmtDate(rec.licenseexpirationdate) + '</dd></div>' +
        '<div><dt>City</dt><dd>' + esc(titleCase(rec.city || '—')) + ', ' + esc(rec.state || 'WA') + '</dd></div>' +
      '</dl>' +

      '<div class="detail-grid">' +
        '<div><h4>The bond</h4>' + (b
          ? '<p>' + esc(b.bondfirmname || '—') + '<br>Amount ' + money(b.bondamt) +
            '<br>Effective ' + fmtDate(b.bondeffectivedate) +
            '<br>Expires ' + fmtDate(b.bondexpirationdate) + '</p>'
          : '<p class="muted">Nothing current published.</p>') + '</div>' +
        '<div><h4>The insurance</h4>' + (i
          ? '<p>' + esc(i.insurancecompany || '—') + '<br>Coverage ' + money(i.insuranceamt) +
            '<br>Expires ' + fmtDate(i.expirationdate) + '</p>'
          : '<p class="muted">Nothing current published.</p>') + '</div>' +
      '</div>' +

      '<div class="card__contact">' +
        (rec.phonenumber ? '<a class="btn btn--ghost" href="tel:' +
          esc(String(rec.phonenumber).replace(/\D/g, '')) + '">' + esc(phone(rec.phonenumber)) + '</a>' : '') +
        '<span class="card__addr">' + esc([titleCase(rec.address1), titleCase(rec.city), 'WA', rec.zip]
          .filter(Boolean).join(', ')) + '</span>' +
      '</div>' +

      '<a class="btn btn--primary" href="' + esc(lni) + '" target="_blank" rel="noopener">' +
        'See the state’s own record →</a>' +
    '</article>';
  }

  function say(msg, kind) {
    statusEl.className = 'status' + (kind ? ' status--' + kind : '');
    statusEl.innerHTML = msg;
  }

  var inFlight = 0;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var term = input.value.trim();
    if (term.length < 3) { say('Type at least three characters.', 'warn'); return; }

    var mine = ++inFlight;
    results.innerHTML = '';
    say('Asking the state…');

    get('m8qx-ubtq', buildWhere(term), 25).then(function (rows) {
      if (mine !== inFlight) return;
      if (!rows.length) {
        say('No contractor found for <strong>' + esc(term) + '</strong>. Check the spelling, ' +
            'or try the licence number — names in this registry are often not what the ' +
            'business calls itself.', 'warn');
        return;
      }
      /* Active registrations first, then the most recently effective. */
      rows.sort(function (a, b) {
        var av = a.contractorlicensestatus === 'ACTIVE' ? 0 : 1;
        var bv = b.contractorlicensestatus === 'ACTIVE' ? 0 : 1;
        return av - bv || String(b.licenseeffectivedate).localeCompare(String(a.licenseeffectivedate));
      });
      rows = rows.slice(0, 10);

      var lics = rows.map(function (r) { return "'" + sq(r.contractorlicensenumber) + "'"; }).join(',');
      var where = 'contractorlicensenumber in(' + lics + ')';

      return Promise.all([
        get('bzff-4fmt', where, 200).catch(function () { return []; }),
        get('ciwg-agsx', where, 200).catch(function () { return []; })
      ]).then(function (both) {
        if (mine !== inFlight) return;
        var bonds = both[0], ins = both[1];

        rows.forEach(function (r) {
          var k = r.contractorlicensenumber;
          bonds.filter(function (x) { return x.contractorlicensenumber === k; })
               .forEach(function (x) {
                 if (x.bondimpaired === 'Y') r._impaired = x;
                 if (current(x.bondeffectivedate, x.bondcanceldate, x.bondexpirationdate) &&
                     (!r._bond || Number(x.bondamt) > Number(r._bond.bondamt))) r._bond = x;
               });
          ins.filter(function (x) { return x.contractorlicensenumber === k; })
             .forEach(function (x) {
               if (current(x.effectivedate, x.canceldate, x.expirationdate) &&
                   (!r._ins || Number(x.insuranceamt) > Number(r._ins.insuranceamt))) r._ins = x;
             });
        });

        say(rows.length === 1 ? 'One match.' : rows.length + ' matches, best first.');
        results.innerHTML = rows.map(render).join('');
      });
    }).catch(function (err) {
      if (mine !== inFlight) return;
      say('Could not reach the state’s data service. ' + esc(err.message) +
          ' You can look this up directly at <a href="https://secure.lni.wa.gov/verify/" ' +
          'target="_blank" rel="noopener">secure.lni.wa.gov/verify</a>.', 'bad');
    });
  });

  /* Deep link: /verify/?q=CORNEMR790DJ */
  try {
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; form.dispatchEvent(new Event('submit')); }
  } catch (e) {}
})();
