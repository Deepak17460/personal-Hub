// Applies the saved theme before first paint to avoid a light/dark flash.
// Kept as an external file so the Content Security Policy needs no 'unsafe-inline'.
(function () {
  try {
    var pref = localStorage.getItem('ph-theme') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    /* ignore */
  }
})();
