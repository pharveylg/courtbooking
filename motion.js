/* ═══════════════════════════════════════════════════════════════
   MOTION PRIMITIVES JS — Vanilla JS implementations
   Adapted from ibelick/motion-primitives & WatermelonCorp
   ═══════════════════════════════════════════════════════════════ */

const MP = (() => {
  'use strict';

  // ── In-View Observer ─────────────────────────────────────
  let _viewObserver = null;

  function initView() {
    if (_viewObserver) return;
    _viewObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mp-visible');
          _viewObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.mp-in-view, .mp-in-view-scale, .mp-in-view-left, .mp-in-view-right').forEach(el => {
      _viewObserver.observe(el);
    });
  }

  // Re-observe new elements (call after dynamic content)
  function observeNew() {
    if (!_viewObserver) initView();
    document.querySelectorAll('.mp-in-view:not(.mp-visible), .mp-in-view-scale:not(.mp-visible), .mp-in-view-left:not(.mp-visible), .mp-in-view-right:not(.mp-visible)').forEach(el => {
      _viewObserver.observe(el);
    });
  }

  // ── Tilt Effect ──────────────────────────────────────────
  function initTilt() {
    document.querySelectorAll('.mp-tilt').forEach(el => {
      if (el._mpTilt) return;
      el._mpTilt = true;

      const maxTilt = parseFloat(el.dataset.tiltMax || '8');

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const tiltX = (y - 0.5) * maxTilt * -2;
        const tiltY = (x - 0.5) * maxTilt * 2;
        el.style.transform = `perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(600px) rotateX(0) rotateY(0)';
      });
    });
  }

  // ── Spotlight Effect ─────────────────────────────────────
  function initSpotlight() {
    document.querySelectorAll('.mp-spotlight').forEach(el => {
      if (el._mpSpotlight) return;
      el._mpSpotlight = true;

      let beam = el.querySelector('.mp-spotlight-beam');
      if (!beam) {
        beam = document.createElement('div');
        beam.className = 'mp-spotlight-beam';
        el.appendChild(beam);
      }

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        beam.style.left = (e.clientX - rect.left) + 'px';
        beam.style.top = (e.clientY - rect.top) + 'px';
      });
    });
  }

  // ── Magnetic Button ──────────────────────────────────────
  function initMagnetic() {
    document.querySelectorAll('.mp-magnetic').forEach(el => {
      if (el._mpMagnetic) return;
      el._mpMagnetic = true;

      const strength = parseFloat(el.dataset.magneticStrength || '0.3');

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'translate(0, 0)';
      });
    });
  }

  // ── Animated Counter ─────────────────────────────────────
  function animateCounter(el, target, duration = 800) {
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = Math.round(start + diff * eased);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initCounters() {
    document.querySelectorAll('[data-mp-counter]').forEach(el => {
      if (el._mpCounted) return;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            el._mpCounted = true;
            const target = parseInt(el.dataset.mpCounter);
            animateCounter(el, target, parseInt(el.dataset.mpDuration || '800'));
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      observer.observe(el);
    });
  }

  // ── Text Scramble ────────────────────────────────────────
  function scrambleText(el, finalText, duration = 600) {
    const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?01';
    const length = finalText.length;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const revealed = Math.floor(progress * length);
      let display = '';
      for (let i = 0; i < length; i++) {
        if (i < revealed) {
          display += finalText[i];
        } else if (finalText[i] === ' ') {
          display += ' ';
        } else {
          display += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      el.textContent = display;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── Transition Panel ─────────────────────────────────────
  function switchPanel(container, newIndex, direction = 'right') {
    const panels = container.querySelectorAll('[data-mp-panel]');
    panels.forEach((panel, i) => {
      if (i === newIndex) {
        panel.style.display = '';
        panel.classList.remove('mp-panel-exit');
        panel.classList.add('mp-panel-enter');
      } else {
        panel.classList.remove('mp-panel-enter');
        panel.classList.add('mp-panel-exit');
        setTimeout(() => {
          panel.style.display = 'none';
          panel.classList.remove('mp-panel-exit');
        }, 200);
      }
    });
  }

  // ── Toast System ─────────────────────────────────────────
  function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('mp-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mp-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
      document.body.appendChild(container);
    }

    const colors = {
      success: 'background:#201C19;color:#D6FF5F;border:1px solid rgba(214,255,95,0.3)',
      error: 'background:#201C19;color:#FF8A5B;border:1px solid rgba(255,138,91,0.3)',
      info: 'background:#201C19;color:#FFFBF5;border:1px solid rgba(255,255,255,0.1)'
    };

    const toast = document.createElement('div');
    toast.className = 'mp-toast-enter';
    toast.style.cssText = `${colors[type] || colors.info};padding:10px 20px;border-radius:999px;font-family:"JetBrains Mono",monospace;font-size:12px;font-weight:700;pointer-events:auto;backdrop-filter:blur(12px);`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.className = 'mp-toast-exit';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // ── Smooth Tab Switch ────────────────────────────────────
  function initTabTransitions() {
    document.querySelectorAll('[data-mp-tab-group]').forEach(group => {
      if (group._mpTabs) return;
      group._mpTabs = true;

      const tabs = group.querySelectorAll('[data-mp-tab]');
      const panels = group.querySelectorAll('[data-mp-panel]');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.mpTab;
          tabs.forEach(t => t.classList.toggle('active', t === tab));
          panels.forEach((panel, i) => {
            const isActive = panel.dataset.mpPanel === target;
            if (isActive) {
              panel.style.display = '';
              panel.classList.remove('mp-panel-exit');
              panel.classList.add('mp-panel-enter');
            } else {
              panel.style.display = 'none';
              panel.classList.remove('mp-panel-enter');
            }
          });
        });
      });
    });
  }

  // ── Initialize All ───────────────────────────────────────
  function init() {
    initView();
    initTilt();
    initSpotlight();
    initMagnetic();
    initCounters();
    initTabTransitions();
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  return {
    init,
    initView,
    observeNew,
    initTilt,
    initSpotlight,
    initMagnetic,
    animateCounter,
    scrambleText,
    switchPanel,
    showToast,
    initTabTransitions
  };
})();
