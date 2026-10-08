/* 首次绘制前应用已保存的主题，并兼容本地存储不可用的情况。 */
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
