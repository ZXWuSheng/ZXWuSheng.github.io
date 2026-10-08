(function () {
  const surfaceSelector = [
    '.intro', '.journey-step', '.metric', '.thanks',
    '.apply-panel', '.contact-card', '.feature-card', '.info-card',
    '.join-panel', '.member-card', '.metric-card', '.news-card',
    '.oa-scene-teaser', '.pay-card', '.player-list-panel', '.profile-panel',
    '.role-card', '.server-card', '.stat-card', '.story-card', '.terms-panel'
  ].join(', ');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let stopFollow = null;

  function supportsPointer(event) {
    return event.pointerType === 'mouse' || event.pointerType === 'pen';
  }

  function startFollow() {
    const globalLight = document.createElement('span');
    globalLight.className = 'oa-global-pointer-light';
    globalLight.setAttribute('aria-hidden', 'true');
    document.body.appendChild(globalLight);

    const cleanup = [];
    const pendingCards = new Map();
    let pointerX = 0;
    let pointerY = 0;
    let globalPending = false;
    let frame = 0;

    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      cleanup.push(function () { target.removeEventListener(type, handler, options); });
    }

    function render() {
      frame = 0;
      // 先统一读取卡片尺寸，再写入样式，避免反复触发布局计算。
      const positions = Array.from(pendingCards, function ([card, point]) {
        const rect = card.getBoundingClientRect();
        const scaleX = rect.width ? card.offsetWidth / rect.width : 1;
        const scaleY = rect.height ? card.offsetHeight / rect.height : 1;
        return {
          card,
          x: Math.max(0, Math.min(card.offsetWidth, (point.x - rect.left) * scaleX)),
          y: Math.max(0, Math.min(card.offsetHeight, (point.y - rect.top) * scaleY))
        };
      });
      pendingCards.clear();

      if (globalPending) {
        globalLight.style.setProperty('--oa-global-pointer-x', pointerX.toFixed(2) + 'px');
        globalLight.style.setProperty('--oa-global-pointer-y', pointerY.toFixed(2) + 'px');
        globalPending = false;
      }
      positions.forEach(function (position) {
        position.card.style.setProperty('--oa-pointer-x', position.x.toFixed(2) + 'px');
        position.card.style.setProperty('--oa-pointer-y', position.y.toFixed(2) + 'px');
      });
    }

    function queueFrame() {
      if (!frame) frame = window.requestAnimationFrame(render);
    }

    function hideGlobal(event) {
      if (event && event.relatedTarget) return;
      document.documentElement.classList.remove('oa-global-pointer-active');
    }

    listen(window, 'pointermove', function (event) {
      if (!supportsPointer(event)) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      globalPending = true;
      document.documentElement.classList.add('oa-global-pointer-active');
      queueFrame();
    }, { passive: true, capture: true });
    listen(window, 'pointercancel', hideGlobal, { passive: true });
    listen(window, 'blur', hideGlobal);
    listen(document, 'pointerout', hideGlobal, { passive: true });

    document.querySelectorAll(surfaceSelector).forEach(function (card) {
      const light = document.createElement('span');
      light.className = 'oa-card-pointer-light';
      light.setAttribute('aria-hidden', 'true');
      const hadPointerClass = card.classList.contains('oa-pointer-card');
      card.classList.add('oa-pointer-card');
      card.appendChild(light);

      function movePointer(event) {
        if (!supportsPointer(event)) return;
        pendingCards.set(card, { x: event.clientX, y: event.clientY });
        queueFrame();
      }

      function hideCard() {
        pendingCards.delete(card);
        card.classList.remove('oa-pointer-active');
      }

      listen(card, 'pointerenter', function (event) {
        if (!supportsPointer(event)) return;
        movePointer(event);
        card.classList.add('oa-pointer-active');
      });
      listen(card, 'pointermove', movePointer, { passive: true });
      listen(card, 'pointerleave', hideCard);
      listen(card, 'pointercancel', hideCard);
      listen(window, 'blur', hideCard);
      cleanup.push(function () {
        hideCard();
        light.remove();
        if (!hadPointerClass) card.classList.remove('oa-pointer-card');
        card.style.removeProperty('--oa-pointer-x');
        card.style.removeProperty('--oa-pointer-y');
      });
    });

    return function () {
      if (frame) window.cancelAnimationFrame(frame);
      pendingCards.clear();
      cleanup.forEach(function (dispose) { dispose(); });
      globalLight.remove();
      document.documentElement.classList.remove('oa-global-pointer-active');
    };
  }

  function updateFollow() {
    if (stopFollow) {
      stopFollow();
      stopFollow = null;
    }
    if (finePointer.matches && !reducedMotion.matches) stopFollow = startFollow();
  }

  function watchPreference(query) {
    if (query.addEventListener) query.addEventListener('change', updateFollow);
    else query.addListener(updateFollow);
  }

  function initialize() {
    watchPreference(finePointer);
    watchPreference(reducedMotion);
    updateFollow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
