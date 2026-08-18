/* Dark mode for the pre-rendered pages. Mirrors the same two functions in
   app.js and reads the same localStorage key, so a preference set on one page
   carries to every other page. Loaded on generated pages only; index.html gets
   this behaviour from app.js. */
(function () {
  'use strict';

  var KEY = 'kcc-theme';

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  var pref = saved();
  var prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (pref === 'dark' || (!pref && prefersDark)) {
    document.documentElement.classList.add('dark');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) {}
    });
  });
})();
