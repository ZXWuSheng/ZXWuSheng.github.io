/* Apply the saved theme before the first paint; storage can be unavailable. */
(function () {
  let theme;
  try {
    theme = new URLSearchParams(location.search).get('theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = localStorage.getItem('website-theme');
    }
  } catch (_) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
