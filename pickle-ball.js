/* An interactive pickleball that lives on the facility picker: bounces off a
   short opt-in list of big elements (never small text), can be dragged and
   flung, follows the phone's tilt once granted, and launches at the camera
   for the "warp" page transition when a facility is picked.

   Nothing here scans the whole page -- only elements explicitly marked
   data-pb="Label" [data-pb-kind="soft|hard|bouncy"] are colliders, so labels,
   captions and footer text are never touched. Loaded by the browser as
   `PickleBall`; pure math is exported for tests via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PickleBall = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* ---------------- pure physics math (tested) ---------------- */

  /* The scale a ball of radius r, centered at (x,y), needs so it covers every
     corner of a w x h viewport -- i.e. the moment it becomes a full loading
     screen. */
  function coverScale(x, y, w, h, r) {
    const d = Math.max(Math.hypot(x, y), Math.hypot(x - w, y), Math.hypot(x, y - h), Math.hypot(x - w, y - h));
    return Math.max(8, (d / r) * 1.12);
  }

  /* Closest-point circle-vs-AABB. Returns null when the circle doesn't reach
     the rect, else the contact normal (nx,ny, pointing from the rect toward
     the ball) and how deep the ball has penetrated. */
  function circleRectHit(bx, by, r, rx, ry, rw, rh) {
    const cx = clamp(bx, rx, rx + rw);
    const cy = clamp(by, ry, ry + rh);
    let dx = bx - cx, dy = by - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, pen: r - d };
    }
    // center is inside the box -- eject along the shallowest side
    const l = bx - rx, right = rx + rw - bx, t = by - ry, bo = ry + rh - by;
    const m = Math.min(l, right, t, bo);
    if (m === l) return { nx: -1, ny: 0, pen: r + l };
    if (m === right) return { nx: 1, ny: 0, pen: r + right };
    if (m === t) return { nx: 0, ny: -1, pen: r + t };
    return { nx: 0, ny: 1, pen: r + bo };
  }

  /* Reflects (vx,vy) off a surface normal (nx,ny) with restitution e.
     Returns null when the ball is already moving away from the surface
     (nothing to bounce). */
  function bounceVelocity(vx, vy, nx, ny, e) {
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return null;
    const j = -(1 + e) * vn;
    return { vx: vx + j * nx, vy: vy + j * ny };
  }

  /* Device beta/gamma (degrees) -> a 2D gravity vector in px/s^2, clamped to
     `mag`. Flat-on-a-table (beta≈0) still reads as "down" (the +0.35 bias),
     matching how a phone is actually held while browsing, not lying flat. */
  function gravityFromTilt(beta, gamma, mag) {
    const gx = clamp((Number(gamma) || 0) / 45, -1, 1);
    const gy = clamp((Number(beta) || 0) / 45 + 0.35, -1, 1);
    return { x: gx * mag, y: gy * mag };
  }

  // ==========================================================================
  // Everything below touches the DOM / rAF and has no meaningful unit tests.
  // ==========================================================================
  if (!root || !root.document) {
    return { coverScale, circleRectHit, bounceVelocity, gravityFromTilt };
  }
  const document = root.document;

  const R = 18; // ball radius, px -- kept small so it has real room to roam the page
  const CRUISE = 300;
  const GRAVITY_MAG = 760;
  const KIND_E = { soft: 0.72, hard: 0.86, bouncy: 1.05 };

  const ball = { x: 80, y: 140, vx: 220, vy: 160, spin: 0, squash: 0, squashAngle: 0 };
  const pointer = { x: -999, y: -999, vx: 0, vy: 0 };
  let dragging = false;
  let gravityOn = false;
  let gravity = { x: 0, y: GRAVITY_MAG };

  const colliders = new Map(); // el -> {label, kind}
  let rects = [];
  let dirty = true;
  let lastMeasure = 0;
  let started = false;
  let prev = 0;

  let warpPhase = 'idle'; // idle -> in -> hold -> out -> idle
  let wT = 0, wSpin = 0, wCover = 1, wHold = 0.75, wLoadDone = true, wCoverFired = false, wOnCover = null, wOnDone = null;

  /* ---------------- DOM: the ball layer ---------------- */

  const CSS = `
  .pw-layer{position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden}
  .pw-ball{position:absolute;top:0;left:0;width:36px;height:36px;will-change:transform}
  .pw-glow{position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,rgba(214,255,95,.55),rgba(214,255,95,0) 70%);filter:blur(2px)}
  .pw-squash{position:relative;width:100%;height:100%}
  .pw-spin{position:absolute;inset:0;border-radius:50%;filter:drop-shadow(0 4px 8px rgba(32,28,25,.3))}
  .pw-shine{position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(circle at 32% 26%, rgba(255,255,255,.8), rgba(255,255,255,0) 46%)}
  .pw-shadow{position:absolute;top:0;left:0;width:30px;height:7px;border-radius:999px;background:#201C19;opacity:0;filter:blur(3px)}
  .pw-caption{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(84vw,380px);text-align:center;opacity:0;transition:opacity .25s ease;font-family:"Bricolage Grotesque",system-ui,sans-serif;color:#201C19;text-shadow:0 2px 18px rgba(255,255,255,.4)}
  .pw-caption-eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;opacity:.55}
  .pw-caption-title{margin-top:8px;font-size:clamp(24px,7vw,40px);font-weight:800;letter-spacing:-.03em;line-height:1.05}
  .pw-caption-bar{margin:20px auto 0;height:4px;width:130px;border-radius:999px;background:rgba(32,28,25,.18);overflow:hidden}
  .pw-caption-fill{height:100%;width:34%;border-radius:999px;background:#201C19;animation:pw-slide 1.05s ease-in-out infinite}
  @keyframes pw-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
  .pw-target{transition:box-shadow .3s ease,text-shadow .3s ease}
  .pw-hit{box-shadow:0 0 0 2px rgba(214,255,95,.9),0 0 24px 2px rgba(214,255,95,.3)}
  /* Text callouts (the headline, facility names) get a glow that hugs the
     glyphs instead -- a box-shadow on a multi-line block just draws a
     rectangle around empty space, not around the actual letters. */
  .pw-hit-text{text-shadow:0 0 1px rgba(214,255,95,.95),0 0 14px rgba(214,255,95,.85),0 0 30px rgba(214,255,95,.55)}
  .pw-tilt-btn{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:70;height:38px;padding:0 16px;border-radius:999px;background:#201C19;color:#FFFBF5;border:none;font:700 12px "JetBrains Mono",monospace;display:inline-flex;align-items:center;gap:7px;cursor:pointer;box-shadow:0 8px 22px rgba(32,28,25,.28)}
  @media (prefers-reduced-motion: reduce){.pw-caption-fill{animation:none}.pw-ball{display:none}}
  `;

  function ballSvg() {
    const holes = [{ x: 50, y: 50, r: 6.2 }];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; holes.push({ x: 50 + Math.cos(a) * 18, y: 50 + Math.sin(a) * 18, r: 6 }); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; holes.push({ x: 50 + Math.cos(a) * 33.5, y: 50 + Math.sin(a) * 33.5, r: 5.2 }); }
    const dots = holes.map((h) => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="#201C19"/>`).join('');
    return `<svg viewBox="0 0 100 100" style="width:100%;height:100%"><defs><radialGradient id="pwShell" cx="36%" cy="30%" r="78%"><stop offset="0%" stop-color="#f2ffb8"/><stop offset="45%" stop-color="#D6FF5F"/><stop offset="100%" stop-color="#8fa800"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#pwShell)"/>${dots}<circle cx="50" cy="50" r="47" fill="none" stroke="#6f8400" stroke-opacity=".5" stroke-width="2"/></svg>`;
  }

  let layer, ballEl, spinEl, squashEl, shadowEl, glowEl, captionEl, captionTitleEl;
  function ensureLayer() {
    if (layer) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    layer = document.createElement('div');
    layer.className = 'pw-layer';
    layer.innerHTML =
      '<div class="pw-shadow"></div>' +
      '<div class="pw-ball">' +
        '<div class="pw-glow"></div>' +
        '<div class="pw-squash"><div class="pw-spin">' + ballSvg() + '</div><div class="pw-shine"></div></div>' +
      '</div>' +
      '<div class="pw-caption"><div class="pw-caption-eyebrow">Serving</div><div class="pw-caption-title"></div><div class="pw-caption-bar"><div class="pw-caption-fill"></div></div></div>';
    document.body.appendChild(layer);
    ballEl = layer.querySelector('.pw-ball');
    spinEl = layer.querySelector('.pw-spin');
    squashEl = layer.querySelector('.pw-squash');
    shadowEl = layer.querySelector('.pw-shadow');
    glowEl = layer.querySelector('.pw-glow');
    captionEl = layer.querySelector('.pw-caption');
    captionTitleEl = layer.querySelector('.pw-caption-title');
  }

  /* ---------------- colliders ---------------- */

  function register(el, label, kind) {
    if (!el || colliders.has(el)) return;
    el.classList.add('pw-target');
    colliders.set(el, { label: label || 'element', kind: KIND_E[kind] ? kind : 'hard', lastHit: 0 });
    dirty = true;
  }
  function scan(rootEl) {
    (rootEl || document).querySelectorAll('[data-pb]').forEach((el) => {
      if (colliders.has(el)) return;
      register(el, el.getAttribute('data-pb'), el.getAttribute('data-pb-kind'));
    });
    dirty = true;
  }
  const invalidate = () => { dirty = true; };

  function measure(now) {
    if (!dirty && now - lastMeasure < 120) return;
    lastMeasure = now; dirty = false;
    const w = root.innerWidth, h = root.innerHeight;
    const out = [];
    colliders.forEach((meta, el) => {
      if (!el.isConnected) { colliders.delete(el); return; }
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (r.bottom < -160 || r.top > h + 160 || r.right < -160 || r.left > w + 160) return;
      out.push({ el, meta, x: r.left, y: r.top, w: r.width, h: r.height });
    });
    rects = out;
  }

  /* ---------------- ambient physics ---------------- */

  function impact(x, y, nx, ny, speed, rectHit) {
    ball.squash = clamp(speed / 1400, 0.05, 0.4);
    ball.squashAngle = Math.atan2(ny, nx);
    if (rectHit && root.performance.now() - rectHit.meta.lastHit > 120) {
      rectHit.meta.lastHit = root.performance.now();
      const hitCls = rectHit.el.classList.contains('pw-text-target') ? 'pw-hit-text' : 'pw-hit';
      rectHit.el.classList.add(hitCls);
      setTimeout(() => rectHit.el.classList.remove(hitCls), 260);
    }
  }

  function walls() {
    const w = root.innerWidth, h = root.innerHeight, e = 0.86;
    if (ball.x - R < 0) { ball.x = R; if (ball.vx < 0) { impact(R, ball.y, 1, 0, Math.abs(ball.vx)); ball.vx = -ball.vx * e; } }
    else if (ball.x + R > w) { ball.x = w - R; if (ball.vx > 0) { impact(w - R, ball.y, -1, 0, Math.abs(ball.vx)); ball.vx = -ball.vx * e; } }
    if (ball.y - R < 0) { ball.y = R; if (ball.vy < 0) { impact(ball.x, R, 0, 1, Math.abs(ball.vy)); ball.vy = -ball.vy * e; } }
    else if (ball.y + R > h) {
      ball.y = h - R;
      if (ball.vy > 0) {
        const v = Math.abs(ball.vy);
        if (v > 50) impact(ball.x, h - R, 0, -1, v);
        ball.vy = -ball.vy * e; ball.vx *= 0.985;
        if (gravityOn && Math.abs(ball.vy) < 70) { ball.vy = 0; ball.vx *= 0.94; }
      }
    }
  }

  function collideRects() {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const hit = circleRectHit(ball.x, ball.y, R, r.x, r.y, r.w, r.h);
      if (!hit) continue;
      const push = Math.min(hit.pen + 0.5, R * 0.9);
      ball.x += hit.nx * push; ball.y += hit.ny * push;
      const bv = bounceVelocity(ball.vx, ball.vy, hit.nx, hit.ny, KIND_E[r.meta.kind]);
      if (!bv) continue;
      ball.vx = bv.vx; ball.vy = bv.vy;
      const tx = -hit.ny, ty = hit.nx;
      const vt = ball.vx * tx + ball.vy * ty;
      ball.vx -= vt * 0.05 * tx; ball.vy -= vt * 0.05 * ty;
      ball.spin += vt * 0.0018;
      impact(ball.x - hit.nx * R, ball.y - hit.ny * R, hit.nx, hit.ny, Math.hypot(ball.vx, ball.vy), r);
    }
  }

  function physicsStep(dt) {
    if (gravityOn) { ball.vx += gravity.x * dt; ball.vy += gravity.y * dt; }
    const damp = Math.exp(-(gravityOn ? 0.1 : 0.04) * dt);
    ball.vx *= damp; ball.vy *= damp;
    if (!gravityOn) {
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 1) { const k = 1 + (CRUISE / sp - 1) * clamp(2.2 * dt, 0, 0.08); ball.vx *= k; ball.vy *= k; }
      else ball.vx = CRUISE;
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 1800) { ball.vx = (ball.vx / sp) * 1800; ball.vy = (ball.vy / sp) * 1800; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    walls();
    collideRects();
  }

  /* ---------------- warp (the page transition) ---------------- */

  function stepWarp(dt, now) {
    const cx = root.innerWidth / 2, cy = root.innerHeight / 2;
    if (warpPhase === 'in') {
      wT = Math.min(1, wT + dt / 0.78);
      const e = wT * wT * wT;
      wCover = coverScale(ball.x, ball.y, root.innerWidth, root.innerHeight, R);
      const scale = 1 + (wCover - 1) * e;
      ball.x += (cx - ball.x) * e * 0.02;
      ball.y += (cy - ball.y) * e * 0.02;
      wSpin += dt * (2.4 + e * 10);
      ballEl.style.transform = 'translate3d(' + (ball.x - R) + 'px,' + (ball.y - R) + 'px,0) scale(' + scale + ')';
      ballEl.style.filter = 'blur(' + (wT * 1.1) + 'px)';
      spinEl.style.transform = 'rotate(' + wSpin + 'rad)';
      captionEl.style.opacity = wT > 0.55 ? '1' : '0';
      if (wT >= 1) { warpPhase = 'hold'; wT = 0; }
    } else if (warpPhase === 'hold') {
      wT = Math.min(1, wT + dt / wHold);
      wSpin += dt * 1.6;
      const wob = 1 + Math.sin(now / 280) * 0.012;
      ballEl.style.transform = 'translate3d(' + (cx - R) + 'px,' + (cy - R) + 'px,0) scale(' + (wCover * wob) + ')';
      ballEl.style.filter = 'none';
      spinEl.style.transform = 'rotate(' + wSpin + 'rad)';
      captionEl.style.opacity = '1';
      // onCover fires as soon as the prefetch (or its timeout) settles --
      // NOT after a minimum hold. For a real page navigation, the destination
      // has its own unavoidable loading screen (a pause-status check that is
      // deliberately never cached) once it starts loading, so padding this
      // wait any further only delays when that starts, for no benefit.
      if (!wCoverFired && wLoadDone) { wCoverFired = true; wOnCover && wOnCover(); }
      if (wT >= 1 && wLoadDone) { warpPhase = 'out'; wT = 0; }
    } else if (warpPhase === 'out') {
      wT = Math.min(1, wT + dt / 0.7);
      const e = 1 - Math.pow(1 - wT, 3);
      const scale = wCover * (1 + e * 4.6);
      wSpin += dt * (1.6 + e * 5);
      ballEl.style.transform = 'translate3d(' + (cx - R) + 'px,' + (cy - R) + 'px,0) scale(' + scale + ')';
      spinEl.style.transform = 'rotate(' + wSpin + 'rad)';
      captionEl.style.opacity = String(Math.max(0, 1 - wT * wT));
      if (wT >= 1) {
        warpPhase = 'idle';
        layer.style.pointerEvents = 'none';
        document.body.style.overflow = '';
        const done = wOnDone;
        wOnDone = null;
        done && done();
      }
    }
  }

  function warp(opts) {
    opts = opts || {};
    if (warpPhase !== 'idle') return Promise.resolve();
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { opts.onCover && opts.onCover(); opts.onDone && opts.onDone(); return Promise.resolve(); }
    ensureLayer();
    dragging = false;
    return new Promise((resolve) => {
      wHold = Math.max(0.25, opts.hold || 0.75);
      wCoverFired = false;
      wLoadDone = !opts.load;
      if (opts.load) Promise.resolve().then(opts.load).catch(() => {}).finally(() => { wLoadDone = true; });
      wOnCover = () => { opts.onCover && opts.onCover(); resolve(); };
      wOnDone = opts.onDone;
      wCover = coverScale(ball.x, ball.y, root.innerWidth, root.innerHeight, R);
      captionTitleEl.textContent = opts.label || '';
      layer.style.pointerEvents = 'auto';
      document.body.style.overflow = 'hidden';
      captionEl.style.opacity = '0';
      warpPhase = 'in'; wT = 0; wSpin = ball.spin;
    });
  }

  /* ---------------- render + loop ---------------- */

  function render() {
    if (!layer) return;
    if (warpPhase === 'idle') {
      ballEl.style.transform = 'translate3d(' + (ball.x - R) + 'px,' + (ball.y - R) + 'px,0)';
      ballEl.style.filter = 'none';
      const a = (ball.squashAngle * 180) / Math.PI;
      squashEl.style.transform = 'rotate(' + a + 'deg) scale(' + (1 - ball.squash) + ',' + (1 + ball.squash * 0.8) + ') rotate(' + -a + 'deg)';
      spinEl.style.transform = 'rotate(' + ball.spin + 'rad)';
      const h = root.innerHeight;
      const gap = Math.max(0, h - ball.y - R);
      const k = Math.max(0, 1 - gap / 220);
      shadowEl.style.opacity = String((gravityOn ? k : 0.14) * 0.3);
      shadowEl.style.transform = 'translate3d(' + (ball.x - 15) + 'px,' + (h - 9) + 'px,0) scale(' + (0.6 + k * 0.6) + ')';
      glowEl.style.opacity = '1';
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    let dt = Math.min((now - prev) / 1000, 1 / 20);
    prev = now;
    if (warpPhase !== 'idle') { stepWarp(dt, now); return; }
    measure(now);
    if (dragging) {
      ball.vx = pointer.vx; ball.vy = pointer.vy; ball.x = pointer.x; ball.y = pointer.y;
    } else {
      const speed = Math.hypot(ball.vx, ball.vy);
      const steps = clamp(Math.ceil((speed * dt) / (R * 0.6)), 1, 8);
      for (let i = 0; i < steps; i++) physicsStep(dt / steps);
    }
    ball.spin += (ball.vx / R) * dt * 0.6;
    ball.squash *= Math.exp(-10 * dt);
    render();
  }

  /* ---------------- input: drag to fling, never steals a real click ---------------- */

  let lx = 0, ly = 0, lt = 0;
  function onMove(e) {
    const now = root.performance.now();
    const dt = Math.max(8, now - lt) / 1000;
    lt = now;
    const ivx = (e.clientX - lx) / dt, ivy = (e.clientY - ly) / dt;
    lx = e.clientX; ly = e.clientY;
    pointer.vx = pointer.vx * 0.55 + clamp(ivx, -2600, 2600) * 0.45;
    pointer.vy = pointer.vy * 0.55 + clamp(ivy, -2600, 2600) * 0.45;
    pointer.x = e.clientX; pointer.y = e.clientY;
  }
  function onDown(e) {
    if (warpPhase !== 'idle') return;
    // Real controls always win: never hijack a tap meant for a button/link/input.
    if (e.target && e.target.closest && e.target.closest('button, a, input, textarea, select, [role="button"]')) return;
    if (Math.hypot(e.clientX - ball.x, e.clientY - ball.y) > R + 18) return;
    dragging = true;
    pointer.x = e.clientX; pointer.y = e.clientY; lx = e.clientX; ly = e.clientY; lt = root.performance.now();
    e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    ball.vx = clamp(pointer.vx * 1.05, -2000, 2000);
    ball.vy = clamp(pointer.vy * 1.05, -2000, 2000);
    if (Math.hypot(ball.vx, ball.vy) < 100) { ball.vx = 260; ball.vy = -160; }
  }

  /* ---------------- tilt gravity ---------------- */

  function onOrientation(e) {
    if (e.beta == null && e.gamma == null) return;
    gravityOn = true;
    gravity = gravityFromTilt(e.beta, e.gamma, GRAVITY_MAG);
  }
  function enableTilt() {
    const DOE = root.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then((state) => { if (state === 'granted') root.addEventListener('deviceorientation', onOrientation); }).catch(() => {});
    } else if (DOE) {
      root.addEventListener('deviceorientation', onOrientation);
    }
  }

  function start() {
    if (started) return;
    started = true;
    ensureLayer();
    ball.x = clamp(root.innerWidth * 0.18, 40, root.innerWidth - 40);
    ball.y = root.innerHeight * 0.22;
    prev = root.performance.now();
    requestAnimationFrame(tick);
    root.addEventListener('resize', invalidate, { passive: true });
    root.addEventListener('scroll', invalidate, { passive: true, capture: true });
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    // Android/most browsers: no permission needed, just start listening.
    // iOS 13+: onOrientation only ever fires after enableTilt() is called
    // from a user gesture (DeviceOrientationEvent.requestPermission).
    const DOE = root.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission !== 'function') root.addEventListener('deviceorientation', onOrientation);
  }

  return { start, register, scan, invalidate, warp, enableTilt, coverScale, circleRectHit, bounceVelocity, gravityFromTilt };
}));
