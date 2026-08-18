/* ==========================================================================
   Bond calculator
   --------------------------------------------------------------------------
   No network, no dependencies. The arithmetic is deliberately simple because
   the point is not precision — it is showing someone that the word "bonded"
   covers a fraction of their job, and that the fraction shrinks further when
   they are not the only claimant.
   ========================================================================== */
(function () {
  'use strict';

  var money = function (n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  };

  var els = {
    cost: document.getElementById('jobCost'),
    kind: document.getElementById('contractorKind'),
    actual: document.getElementById('actualBond'),
    claimants: document.getElementById('claimants'),
    out: document.getElementById('calcOut')
  };
  if (!els.out) return;

  function render() {
    var cost = Math.max(0, Number(els.cost.value) || 0);
    var statutory = Number(els.kind.value) || 30000;
    var actual = Number(els.actual.value) || 0;
    var bond = actual > 0 ? actual : statutory;
    var claimants = Math.max(1, Math.min(50, Number(els.claimants.value) || 1));

    var share = bond / claimants;
    var covered = cost > 0 ? Math.min(100, share / cost * 100) : 0;
    var gap = Math.max(0, cost - share);

    /* Tone tracks how bad the gap is, and every state carries words as well as
       a colour — never colour alone. */
    var tone = covered >= 100 ? 'good' : covered >= 50 ? 'warn' : 'bad';
    var verdict =
      covered >= 100 ? 'The bond would cover this job in full.'
      : covered >= 50 ? 'The bond covers about half of what you are spending.'
      : covered >= 20 ? 'The bond covers a small part of what you are spending.'
      : 'The bond barely touches a job this size.';

    els.out.innerHTML =
      '<div class="calc__hero calc__hero--' + tone + '">' +
        '<span class="calc__pctlabel">The bond would cover</span>' +
        '<span class="calc__pct">' + covered.toFixed(covered < 10 ? 1 : 0) + '%</span>' +
        '<span class="calc__verdict">' + verdict + '</span>' +
      '</div>' +

      '<div class="calc__meter" role="img" aria-label="' +
        covered.toFixed(0) + ' percent of the job cost is covered by the bond">' +
        '<span class="calc__fill calc__fill--' + tone + '" style="width:' +
          Math.max(covered, 0.6).toFixed(2) + '%"></span>' +
      '</div>' +

      '<dl class="calc__rows">' +
        row('What the job costs', money(cost)) +
        row('Bond posted', money(bond) + (actual > 0 ? '' : ' (the legal minimum)')) +
        (claimants > 1
          ? row('Your share if ' + claimants + ' claim at once', money(share))
          : '') +
        row('Left uncovered', money(gap), gap > 0 ? 'bad' : 'good') +
      '</dl>' +

      (gap > 0
        ? '<p class="calc__foot">A bond is not insurance for your project. You would have to' +
          ' win a claim first, and anyone else owed money by the same contractor — other' +
          ' homeowners, suppliers, subcontractors — draws from the same pot.</p>'
        : '<p class="calc__foot">Even here, the bond only pays if you win a claim, and you' +
          ' would be sharing it with anyone else who files against the same contractor.</p>');
  }

  function row(label, value, tone) {
    return '<div class="calc__row' + (tone ? ' calc__row--' + tone : '') + '">' +
      '<dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  ['input', 'change'].forEach(function (evt) {
    [els.cost, els.kind, els.actual, els.claimants].forEach(function (el) {
      if (el) el.addEventListener(evt, render);
    });
  });

  render();
})();
