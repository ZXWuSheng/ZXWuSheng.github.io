(function () {
  'use strict';
  const root = document.documentElement;
  const config = window.onceAgainConfig || {};
  const navbar = document.getElementById('navbar');
  const menu = document.getElementById('navLinks');
  const menuButton = document.getElementById('menuButton');
  const themeButton = document.getElementById('themeToggle');
  const mobile = matchMedia('(max-width: 1100px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const status = document.getElementById('siteStatus');

  function announce(message) {
    if (status) {
      status.textContent = message;
      clearTimeout(announce.timer);
      announce.timer = setTimeout(() => { status.textContent = ''; }, 6000);
    }
  }

  function updateThemeButton() {
    const label = root.dataset.theme === 'light' ? '切换到深色主题' : '切换到浅色主题';
    themeButton?.setAttribute('aria-label', label);
    themeButton?.setAttribute('title', label);
  }
  updateThemeButton();
  themeButton?.addEventListener('click', function () {
    const theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = theme;
    try { localStorage.setItem('website-theme', theme); } catch (_) {}
    updateThemeButton();
  });

  function setMenu(open, returnFocus = false) {
    if (!menu || !menuButton) return;
    menu.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    menuButton.textContent = open ? '×' : '☰';
    menu.inert = mobile.matches && !open;
    if (returnFocus) menuButton.focus();
  }
  setMenu(false);
  menuButton?.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
  mobile.addEventListener('change', () => setMenu(false));
  document.addEventListener('click', function (event) {
    if (mobile.matches && menu?.classList.contains('open') &&
        !menu.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
  });

  function samePage(url) {
    const normalize = path => path.endsWith('/') ? path + 'index.html' : path;
    return url.origin === location.origin && normalize(url.pathname) === normalize(location.pathname);
  }
  menu?.querySelectorAll('a').forEach(function (link) {
    const url = new URL(link.href);
    if (!samePage(url)) return;
    link.classList.toggle('is-active', url.hash === location.hash || (!location.hash && url.hash === '#home'));
  });
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !(url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) return;
    url.searchParams.set('theme', root.dataset.theme || 'dark');
    link.href = url.href;
    if (menu?.contains(link)) setMenu(false);
    if (samePage(url) && url.hash) {
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) {
        event.preventDefault();
        history.pushState(null, '', url);
        target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
  });

  let scrollFrame = 0;
  function updateNavbar() {
    scrollFrame = 0;
    navbar?.classList.toggle('scrolled', scrollY > 25);
    const links = [...(menu?.querySelectorAll('a') || [])];
    const sections = links.map(link => ({ link, url: new URL(link.href) }))
      .filter(item => samePage(item.url) && item.url.hash)
      .map(item => ({ ...item, section: document.getElementById(item.url.hash.slice(1)) }))
      .filter(item => item.section);
    const current = sections.filter(item => item.section.getBoundingClientRect().top <= 160).at(-1) || sections[0];
    sections.forEach(function (item) {
      item.link.classList.toggle('is-active', item === current);
      if (item === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', function () {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateNavbar);
  }, { passive: true });
  updateNavbar();

  // One image dialog is shared by the Logo and both unmodified payment images.
  const lightbox = document.getElementById('logoLightbox');
  const lightboxImage = document.getElementById('logoLightboxImage');
  const lightboxClose = document.getElementById('logoLightboxClose');
  const originalLink = document.getElementById('imageOriginalLink');
  const dialogTitle = document.getElementById('imagePreviewTitle');
  let previousFocus;
  let inertElements = [];

  function closePreview() {
    if (!lightbox?.classList.contains('open')) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.inert = true;
    document.body.classList.remove('lightbox-open');
    inertElements.forEach(item => { item.element.inert = item.inert; });
    inertElements = [];
    previousFocus?.focus();
  }
  function openPreview(trigger) {
    if (!lightbox) return;
    const source = trigger.dataset.previewSrc || 'NEW-logo-ICON.png';
    const title = trigger.dataset.previewTitle || 'Once Again Logo 大图预览';
    previousFocus = trigger;
    lightboxImage.src = source;
    lightboxImage.alt = title;
    dialogTitle.textContent = title;
    originalLink.href = source;
    lightbox.classList.toggle('payment-preview', trigger.hasAttribute('data-image-preview'));
    lightbox.inert = false;
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    inertElements = [...document.body.children].filter(element => element !== lightbox && element.tagName !== 'SCRIPT')
      .map(element => ({ element, inert: element.inert }));
    inertElements.forEach(item => { item.element.inert = true; });
    // The legacy preview has a visibility transition; focus after it settles.
    setTimeout(function () {
      if (lightbox.classList.contains('open') && !lightbox.contains(document.activeElement)) {
        lightboxClose.focus({ preventScroll: true });
      }
    }, reducedMotion.matches ? 0 : 240);
  }
  if (lightbox) lightbox.inert = true;
  document.querySelectorAll('#logoPreviewTrigger, [data-image-preview]').forEach(trigger => {
    trigger.addEventListener('click', () => openPreview(trigger));
  });
  lightboxClose?.addEventListener('click', closePreview);
  lightbox?.addEventListener('click', event => { if (event.target === lightbox) closePreview(); });
  document.addEventListener('keydown', function (event) {
    if (lightbox?.classList.contains('open')) {
      if (event.key === 'Escape') { event.preventDefault(); closePreview(); }
      if (event.key === 'Tab') {
        const focusable = [...lightbox.querySelectorAll('button, a[href]')].filter(el => !el.hidden);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    } else if (event.key === 'Escape' && menu?.classList.contains('open')) {
      setMenu(false, true);
    }
  });

  const teaser = document.getElementById('oaSceneTeaser');
  document.getElementById('oaSceneTeaserClose')?.addEventListener('click', function () {
    teaser?.remove();
    (mobile.matches ? menuButton : menu?.querySelector('a[href*="scene1.html"]'))?.focus();
  });

  async function copyText(button) {
    const target = button.dataset.copyTarget && document.querySelector(button.dataset.copyTarget);
    const text = button.dataset.copyText || target?.value || target?.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text.trim());
      announce('已复制，可粘贴使用。');
      const label = button.textContent;
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = label; }, 1800);
    } catch (_) {
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.focus(); target.select();
      } else {
        const field = document.getElementById('manualCopy');
        field.hidden = false;
        field.value = text.trim();
        field.focus(); field.select();
      }
      announce('自动复制不可用，已选中内容，请手动复制。');
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-copy-text], [data-copy-target]');
    if (button) copyText(button);
  });

  function safeDestination(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  document.querySelectorAll('[data-config-link]').forEach(function (placeholder) {
    const destination = safeDestination(config[placeholder.dataset.configLink]);
    if (!destination) return;
    const link = document.createElement('a');
    link.href = destination;
    link.textContent = placeholder.dataset.openLabel;
    link.className = placeholder.className;
    placeholder.replaceWith(link);
  });
  const address = document.getElementById('serverAddress');
  const addressButton = document.getElementById('copyButton');
  if (address && typeof config.serverAddress === 'string' && config.serverAddress.trim()) {
    address.textContent = config.serverAddress.trim();
    addressButton.disabled = false;
    addressButton.textContent = '复制地址';
    addressButton.dataset.copyTarget = '#serverAddress';
    document.querySelectorAll('[data-server-address]').forEach(el => { el.textContent = config.serverAddress.trim(); });
  }

  const log = document.getElementById('updateLog');
  if (log && Array.isArray(config.updates) && config.updates.length) {
    const fragment = document.createDocumentFragment();
    config.updates.forEach(function (entry) {
      if (!entry.title || !entry.body) return;
      const article = document.createElement('article');
      article.className = 'news-card update-entry';
      if (/^[a-z][a-z0-9-]*$/.test(entry.id || '')) article.id = entry.id;
      const meta = document.createElement('p');
      meta.className = 'update-meta';
      meta.textContent = [entry.category, entry.status].filter(Boolean).join(' · ');
      const date = document.createElement('p');
      date.className = 'update-date';
      if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') && !Number.isNaN(Date.parse(entry.date))) {
        const time = document.createElement('time');
        time.dateTime = entry.date; time.textContent = entry.date; date.append(time);
      } else date.textContent = '日期待补充';
      const title = document.createElement('h3'); title.textContent = entry.title;
      const body = document.createElement('p'); body.textContent = entry.body;
      article.append(meta, date, title, body); fragment.append(article);
    });
    if (fragment.childElementCount) log.replaceChildren(fragment);
  }

  // Reveal once; keep content readable with no script or with reduced motion.
  const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-smooth');
  document.body.classList.add('page-ready');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    root.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-active', 'visible', 'in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.04 });
    reveals.forEach(element => observer.observe(element));
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) root.classList.remove('motion-ready'); });
  }

  document.querySelectorAll('img').forEach(function (image) {
    function failed() {
      // Avatars own a finite fallback chain and accessible initials.
      if (image.dataset.mcid || !image.hasAttribute('src')) return;
      image.hidden = true;
      image.closest('.mc-item-icon')?.classList.add('mc-item-failed');
      let fallback = image.parentElement.querySelector('.image-fallback');
      if (!fallback) {
        fallback = document.createElement('span'); fallback.className = 'image-fallback';
        const isPayment = image.classList.contains('payment-qr') || image.closest('.payment-preview');
        fallback.textContent = isPayment ? '收款码加载失败，请刷新页面或查看原图。' : (image.alt || '');
        image.insertAdjacentElement('afterend', fallback);
      }
    }
    image.addEventListener('error', failed);
    image.addEventListener('load', () => {
      image.hidden = false;
      image.parentElement.querySelector('.image-fallback')?.remove();
    });
    if (image.hasAttribute('src') && image.complete && !image.naturalWidth) failed();
  });
  root.classList.add('site-ready');
})();
