(function () {
  const standaloneSurfaceClasses = new Set([
    'intro',
    'journey-step',
    'metric',
    'thanks'
  ]);

  function getFollowSurfaces() {
    return Array.from(document.querySelectorAll('[class]')).filter(function (element) {
      return Array.from(element.classList).some(function (className) {
        return className.endsWith('-card') ||
          className.endsWith('-panel') ||
          className.endsWith('-teaser') ||
          standaloneSurfaceClasses.has(className);
      });
    });
  }

  function supportsFollowPointer(event) {
    return !event.pointerType || event.pointerType === 'mouse' || event.pointerType === 'pen';
  }

  function isTouchPointer(event) {
    return event.pointerType === 'touch';
  }

  function initializeTouchFollow() {
    if (document.querySelector('.oa-touch-follow')) return;

    const touchFollow = document.createElement('span');
    touchFollow.className = 'oa-touch-follow';
    touchFollow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(touchFollow);

    const swipeHint = document.createElement('span');
    swipeHint.className = 'oa-mobile-swipe-hint';
    swipeHint.setAttribute('aria-hidden', 'true');
    document.body.appendChild(swipeHint);

    const touchState = {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      frame: 0,
      releaseTimer: 0,
      hintTimer: 0
    };

    function renderTouchPosition() {
      touchState.frame = 0;
      touchFollow.style.setProperty('--oa-touch-x', touchState.clientX.toFixed(2) + 'px');
      touchFollow.style.setProperty('--oa-touch-y', touchState.clientY.toFixed(2) + 'px');
    }

    function queueTouchPosition(event, immediate) {
      touchState.clientX = event.clientX;
      touchState.clientY = event.clientY;

      if (immediate) {
        if (touchState.frame) cancelAnimationFrame(touchState.frame);
        renderTouchPosition();
      } else if (!touchState.frame) {
        touchState.frame = requestAnimationFrame(renderTouchPosition);
      }
    }

    function dismissSwipeHint() {
      window.clearTimeout(touchState.hintTimer);
      swipeHint.classList.remove('is-visible');
      swipeHint.classList.add('is-dismissed');
    }

    function dismissVisibleSwipeHint() {
      if (swipeHint.classList.contains('is-visible')) {
        dismissSwipeHint();
      }
    }

    function beginTouch(event) {
      if (!isTouchPointer(event)) return;
      window.clearTimeout(touchState.releaseTimer);
      queueTouchPosition(event, true);
      document.documentElement.classList.add('oa-touch-following');
      touchFollow.classList.add('is-active');
      dismissSwipeHint();
    }

    function moveTouch(event) {
      if (!isTouchPointer(event)) return;
      queueTouchPosition(event, false);
    }

    function endTouch(event) {
      if (!isTouchPointer(event)) return;
      queueTouchPosition(event, false);
      touchFollow.classList.add('is-releasing');
      touchState.releaseTimer = window.setTimeout(function () {
        touchFollow.classList.remove('is-active', 'is-releasing');
        document.documentElement.classList.remove('oa-touch-following');
      }, 220);
    }

    window.addEventListener('pointerdown', beginTouch, { passive: true, capture: true });
    window.addEventListener('pointermove', moveTouch, { passive: true, capture: true });
    window.addEventListener('pointerup', endTouch, { passive: true, capture: true });
    window.addEventListener('pointercancel', endTouch, { passive: true, capture: true });
    window.addEventListener('scroll', dismissVisibleSwipeHint, { passive: true });

    touchState.hintTimer = window.setTimeout(function () {
      if (!swipeHint.classList.contains('is-dismissed')) {
        swipeHint.classList.add('is-visible');
        touchState.hintTimer = window.setTimeout(dismissSwipeHint, 4600);
      }
    }, 850);
  }

  function initializeGlobalPointerFollow() {
    if (document.querySelector('.oa-global-pointer-light')) return;

    const light = document.createElement('span');
    light.className = 'oa-global-pointer-light';
    light.setAttribute('aria-hidden', 'true');
    document.body.appendChild(light);

    const pointerState = {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      frame: 0
    };

    function renderPointerPosition() {
      pointerState.frame = 0;
      light.style.setProperty('--oa-global-pointer-x', pointerState.clientX.toFixed(2) + 'px');
      light.style.setProperty('--oa-global-pointer-y', pointerState.clientY.toFixed(2) + 'px');
    }

    function movePointer(event) {
      if (!supportsFollowPointer(event)) return;
      pointerState.clientX = event.clientX;
      pointerState.clientY = event.clientY;
      document.documentElement.classList.add('oa-global-pointer-active');

      if (!pointerState.frame) {
        pointerState.frame = requestAnimationFrame(renderPointerPosition);
      }
    }

    function hidePointer(event) {
      if (event && event.relatedTarget) return;
      document.documentElement.classList.remove('oa-global-pointer-active');
    }

    window.addEventListener('pointermove', movePointer, { passive: true, capture: true });
    window.addEventListener('pointercancel', hidePointer, { passive: true });
    window.addEventListener('blur', hidePointer);
    document.addEventListener('pointerout', hidePointer, { passive: true });
  }

  function initializeCardFollow() {
    initializeGlobalPointerFollow();
    initializeTouchFollow();

    getFollowSurfaces().forEach(function (card) {
      if (card.querySelector(':scope > .oa-card-pointer-light')) return;

      const light = document.createElement('span');
      light.className = 'oa-card-pointer-light';
      light.setAttribute('aria-hidden', 'true');
      card.classList.add('oa-pointer-card');
      card.appendChild(light);

      const pointerState = {
        clientX: 0,
        clientY: 0,
        frame: 0,
        touchReleaseTimer: 0
      };

      function renderPointerPosition() {
        pointerState.frame = 0;
        const rect = card.getBoundingClientRect();
        const scaleX = rect.width ? card.offsetWidth / rect.width : 1;
        const scaleY = rect.height ? card.offsetHeight / rect.height : 1;
        const x = Math.max(0, Math.min(card.offsetWidth, (pointerState.clientX - rect.left) * scaleX));
        const y = Math.max(0, Math.min(card.offsetHeight, (pointerState.clientY - rect.top) * scaleY));
        card.style.setProperty('--oa-pointer-x', x.toFixed(2) + 'px');
        card.style.setProperty('--oa-pointer-y', y.toFixed(2) + 'px');
      }

      function queuePointerPosition(event, immediate) {
        pointerState.clientX = event.clientX;
        pointerState.clientY = event.clientY;

        if (immediate) {
          if (pointerState.frame) cancelAnimationFrame(pointerState.frame);
          renderPointerPosition();
          return;
        }

        if (!pointerState.frame) {
          pointerState.frame = requestAnimationFrame(renderPointerPosition);
        }
      }

      card.addEventListener('pointerenter', function (event) {
        if (!supportsFollowPointer(event)) return;
        queuePointerPosition(event, true);
        card.classList.add('oa-pointer-active');
      });

      card.addEventListener('pointerdown', function (event) {
        if (!isTouchPointer(event)) return;
        window.clearTimeout(pointerState.touchReleaseTimer);
        queuePointerPosition(event, true);
        card.classList.add('oa-pointer-active');
      }, { passive: true });

      card.addEventListener('pointermove', function (event) {
        if (!supportsFollowPointer(event) && !isTouchPointer(event)) return;
        queuePointerPosition(event, false);
      }, { passive: true });

      card.addEventListener('pointerleave', function () {
        if (pointerState.frame) cancelAnimationFrame(pointerState.frame);
        pointerState.frame = 0;
        card.classList.remove('oa-pointer-active');
      });

      card.addEventListener('pointercancel', function () {
        if (pointerState.frame) cancelAnimationFrame(pointerState.frame);
        pointerState.frame = 0;
        card.classList.remove('oa-pointer-active');
      });

      card.addEventListener('pointerup', function (event) {
        if (!isTouchPointer(event)) return;
        pointerState.touchReleaseTimer = window.setTimeout(function () {
          card.classList.remove('oa-pointer-active');
        }, 220);
      }, { passive: true });
    });

    let themeTransitionTimer = 0;
    const themeObserver = new MutationObserver(function () {
      document.documentElement.classList.add('oa-card-theme-changing');
      window.clearTimeout(themeTransitionTimer);
      themeTransitionTimer = window.setTimeout(function () {
        document.documentElement.classList.remove('oa-card-theme-changing');
      }, 140);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCardFollow, { once: true });
  } else {
    initializeCardFollow();
  }
})();
