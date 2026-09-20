/* Court-side pickleball scoreboard -- a full-screen overlay any page can open.

     CourtBoard.open({
       title, names: { home, away }, config,        // format: see pickleball-scoring.js
       storageKey,                                  // resume after a refresh
       finishLabel,                                 // e.g. "Submit result"
       onFinish(summary, state) -> Promise|void,    // called when the match is done and saved
       onLive(view),                                // every change (callers throttle)
       onCancel()
     })

   Tap the side that WON the rally. Undo reaches back through the whole match.
   Spoken score calls are on by default (the toggle is remembered). Needs
   pickleball-scoring.js loaded first. Uses textContent only, so names typed by
   players can never inject markup. */
(function () {
  'use strict';
  const P = window.PickleScore;
  if (!P) { console.error('[CourtBoard] pickleball-scoring.js must load first'); return; }

  const AUDIO_KEY = 'cb_board_audio_v1';
  const CSS = `
  .rb-root{position:fixed;inset:0;z-index:2147483000;background:#08111F;color:#F4E7D0;font-family:"Bricolage Grotesque",system-ui,sans-serif;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  .rb-mono{font-family:"JetBrains Mono",ui-monospace,monospace}
  .rb-top{display:flex;align-items:center;gap:10px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));min-height:52px}
  .rb-title{flex:1;min-width:0;text-align:center;font-size:13px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#91A4B8}
  .rb-btn{min-height:48px;min-width:48px;padding:0 16px;border-radius:999px;border:1px solid #27405E;background:#101D30;color:#F4E7D0;font:700 14px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
  .rb-btn:active{transform:scale(.97)}
  .rb-btn[aria-pressed="true"]{border-color:var(--rb-accent,#D6FF5F);color:var(--rb-accent,#D6FF5F)}
  .rb-btn.rb-primary{background:var(--rb-accent,#D6FF5F);border-color:var(--rb-accent,#D6FF5F);color:#08111F}
  .rb-btn:disabled{opacity:.4}
  .rb-banner{margin:0 12px;padding:8px 12px;border-radius:12px;background:#101D30;border:1px solid #27405E;font-size:12px;color:#91A4B8;display:flex;align-items:center;justify-content:space-between;gap:10px}
  .rb-banner button{background:none;border:0;color:var(--rb-accent,#D6FF5F);font:700 12px inherit;font-family:inherit;cursor:pointer;text-decoration:underline;padding:6px}
  .rb-mid{padding:6px 12px 0;text-align:center}
  .rb-call{font-size:clamp(22px,5.5vmin,40px);font-weight:800;letter-spacing:.04em;color:var(--rb-accent,#D6FF5F)}
  .rb-sub{font-size:12px;color:#91A4B8;margin-top:2px;min-height:16px}
  .rb-board{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px}
  @media (orientation:portrait){.rb-board{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
  .rb-side{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:24px;background:#101D30;border:2px solid #27405E;cursor:pointer;padding:10px;min-height:0;font-family:inherit;color:inherit}
  .rb-side:active{background:#152740}
  .rb-side.rb-serving{border-color:var(--rb-accent,#D6FF5F)}
  .rb-name{font-size:clamp(16px,4vmin,28px);font-weight:800;max-width:100%;text-align:center;overflow-wrap:anywhere;color:#F4E7D0;line-height:1.1}
  .rb-pts{font-size:clamp(72px,24vmin,220px);font-weight:900;line-height:.95;letter-spacing:-.04em;color:#fff;font-variant-numeric:tabular-nums}
  .rb-srv{min-height:20px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--rb-accent,#D6FF5F);display:flex;align-items:center;gap:6px}
  .rb-dot{width:10px;height:10px;border-radius:50%;background:var(--rb-accent,#D6FF5F)}
  .rb-pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;min-height:24px}
  .rb-pill{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:#08111F;border:1px solid #27405E;color:#91A4B8}
  .rb-pill.rb-won{border-color:var(--rb-accent,#D6FF5F);color:var(--rb-accent,#D6FF5F)}
  .rb-hint{position:absolute;bottom:8px;font-size:11px;color:#527089;letter-spacing:.05em;text-transform:uppercase}
  .rb-rail{display:flex;gap:10px;justify-content:space-between;padding:8px 12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}
  .rb-rail .rb-btn{flex:1}
  .rb-panel{position:absolute;inset:0;background:rgba(8,17,31,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;z-index:2}
  .rb-panel h2{margin:0;font-size:clamp(26px,7vmin,48px);font-weight:900;letter-spacing:-.02em}
  .rb-panel .rb-scoreline{font-size:clamp(18px,4.5vmin,28px);font-weight:700;color:var(--rb-accent,#D6FF5F)}
  .rb-panel .rb-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px}
  .rb-err{color:#F3B562;font-size:13px;min-height:18px}
  .rb-setup{display:grid;gap:12px;width:min(420px,100%);text-align:left}
  .rb-setup label{display:grid;gap:4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#91A4B8}
  .rb-setup input,.rb-setup select{min-height:46px;border-radius:14px;border:1px solid #27405E;background:#101D30;color:#F4E7D0;padding:0 12px;font:600 15px inherit;font-family:inherit}
  .rb-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-height:480px){
    .rb-top{min-height:0;padding:6px 10px}
    .rb-btn{min-height:44px}
    .rb-hint,.rb-sub{display:none}
    .rb-mid{padding-top:0}
    .rb-call{font-size:clamp(18px,7vh,30px)}
    .rb-board{padding:4px 10px;gap:8px}
    .rb-side{gap:2px;border-radius:18px}
    .rb-pts{font-size:clamp(56px,34vh,170px)}
    .rb-rail{padding:6px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom))}
    .rb-panel{gap:8px;padding:12px}
    .rb-panel h2{font-size:clamp(20px,9vh,34px)}
  }`;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function open(opts) {
    if (document.querySelector('.rb-root')) return null;
    if (!document.getElementById('rb-style')) { const s = el('style'); s.id = 'rb-style'; s.textContent = CSS; document.head.appendChild(s); }

    const config = P.normalizeConfig(opts.config);
    const names = { home: String((opts.names && opts.names.home) || 'Home'), away: String((opts.names && opts.names.away) || 'Away') };
    const sig = JSON.stringify([config, names]);
    const key = opts.storageKey || null;
    let state = P.createMatch(config, names);
    let history = [];
    let resumed = false;
    let saving = false;
    let audioOn = true;
    try { audioOn = localStorage.getItem(AUDIO_KEY) !== 'off'; } catch (e) { /* default on */ }

    if (key) {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && saved.sig === sig && saved.state && !saved.done) { state = saved.state; history = saved.history || []; resumed = state.rallies > 0; }
      } catch (e) { /* start fresh */ }
    }
    const persist = () => { if (key) { try { localStorage.setItem(key, JSON.stringify({ sig, state, history: history.slice(-400), done: false })); } catch (e) { /* storage full or blocked */ } } };
    const forget = () => { if (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } } };

    /* ---------- DOM ---------- */
    const root = el('div', 'rb-root');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Scoreboard');
    if (opts.accent && /^#[0-9a-fA-F]{6}$/.test(opts.accent)) root.style.setProperty('--rb-accent', opts.accent);

    const top = el('div', 'rb-top');
    const cancelBtn = el('button', 'rb-btn', 'Close'); cancelBtn.type = 'button'; cancelBtn.setAttribute('aria-label', 'Close scoreboard');
    const title = el('div', 'rb-title', opts.title || 'Scoreboard');
    const fsBtn = el('button', 'rb-btn', 'Full screen'); fsBtn.type = 'button';
    top.append(cancelBtn, title, fsBtn);

    const bannerHost = el('div');
    const mid = el('div', 'rb-mid'); const call = el('div', 'rb-call rb-mono'); const sub = el('div', 'rb-sub'); mid.append(call, sub);
    const board = el('div', 'rb-board');
    const sides = {};
    ['home', 'away'].forEach((side) => {
      const b = el('button', 'rb-side'); b.type = 'button';
      const name = el('div', 'rb-name'); const pts = el('div', 'rb-pts'); const srv = el('div', 'rb-srv'); const pills = el('div', 'rb-pills'); const hint = el('div', 'rb-hint', 'Tap when they win the rally');
      b.append(name, pts, srv, pills, hint);
      b.addEventListener('click', () => tap(side));
      sides[side] = { b, name, pts, srv, pills };
      board.appendChild(b);
    });

    const rail = el('div', 'rb-rail');
    const undoBtn = el('button', 'rb-btn', 'Undo'); undoBtn.type = 'button';
    const audioBtn = el('button', 'rb-btn'); audioBtn.type = 'button';
    const testBtn = el('button', 'rb-btn', 'Test voice'); testBtn.type = 'button';
    rail.append(undoBtn, audioBtn, testBtn);

    const panel = el('div', 'rb-panel'); panel.style.display = 'none';
    root.append(top, bannerHost, mid, board, rail, panel);
    document.body.appendChild(root);
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';

    /* ---------- speech / haptics / wake lock ---------- */
    let voiceOk = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
    function speak(text, force) {
      if ((!audioOn && !force) || !text || !voiceOk) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.95;
        window.speechSynthesis.speak(u);
      } catch (e) { voiceOk = false; }
    }
    const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not supported */ } };
    let wake = null;
    async function keepAwake() { try { if (navigator.wakeLock && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { /* not supported or denied */ } }
    const onVis = () => { if (document.visibilityState === 'visible') keepAwake(); };
    document.addEventListener('visibilitychange', onVis); keepAwake();

    /* ---------- rendering ---------- */
    function gameNumber() { return state.games.length + (state.gameOver ? 0 : 1); }
    function render() {
      const cfg = state.config;
      ['home', 'away'].forEach((side) => {
        const s = sides[side];
        s.name.textContent = state.names[side];
        s.pts.textContent = String(state[side]);
        const isServing = state.serving === side && !state.complete && !state.gameOver;
        s.b.classList.toggle('rb-serving', isServing);
        s.b.disabled = state.complete || state.gameOver;
        s.b.setAttribute('aria-label', `${state.names[side]} won the rally. ${state.names[side]} has ${state[side]}.`);
        s.srv.textContent = '';
        if (isServing) {
          const d = el('span', 'rb-dot'); s.srv.append(d, document.createTextNode(cfg.scoring === 'sideout' && cfg.doubles ? `Serving · server ${state.serverNumber}` : 'Serving'));
        }
        s.pills.textContent = '';
        if (cfg.bestOf > 1) {
          const need = P.gamesToWin(cfg);
          const won = el('span', 'rb-pill' + (state.gamesWon[side] >= need ? ' rb-won' : ''), `Games ${state.gamesWon[side]}`);
          s.pills.appendChild(won);
        }
        state.games.forEach((g) => s.pills.appendChild(el('span', 'rb-pill' + (g[side] > g[side === 'home' ? 'away' : 'home'] ? ' rb-won' : ''), String(g[side]))));
      });
      call.textContent = state.complete || state.gameOver ? 'Game over' : P.scoreCallText(state);
      sub.textContent = state.complete ? `${state.names[state.winner]} win the match` : cfg.bestOf > 1 ? `Game ${gameNumber()} of ${cfg.bestOf} · ${P.formatLabel(cfg)}` : P.formatLabel(cfg);
      undoBtn.disabled = history.length === 0;
      audioBtn.textContent = audioOn ? 'Voice on' : 'Voice off'; audioBtn.setAttribute('aria-pressed', String(audioOn));
      testBtn.style.display = audioOn ? '' : 'none';
      bannerHost.textContent = '';
      if (resumed) {
        const b = el('div', 'rb-banner'); b.appendChild(el('span', '', 'Picked up where you left off.'));
        const so = el('button', '', 'Start over'); so.type = 'button'; so.addEventListener('click', startOver); b.appendChild(so); bannerHost.appendChild(b);
      }
      if (!voiceOk && audioOn) bannerHost.appendChild(el('div', 'rb-banner', 'This browser has no speech voice, so calls will be silent.'));
      renderPanel();
    }

    function renderPanel() {
      panel.textContent = '';
      if (!state.gameOver && !state.complete) { panel.style.display = 'none'; return; }
      panel.style.display = 'flex';
      const g = state.games[state.games.length - 1];
      if (state.complete) {
        panel.appendChild(el('div', 'rb-mono', 'MATCH COMPLETE'));
        panel.appendChild(el('h2', '', `${state.names[state.winner]} win`));
        panel.appendChild(el('div', 'rb-scoreline rb-mono', state.games.map((x) => `${x.home}-${x.away}`).join('   ')));
        const err = el('div', 'rb-err'); err.id = 'rb-err'; panel.appendChild(err);
        const actions = el('div', 'rb-actions');
        const fin = el('button', 'rb-btn rb-primary', opts.finishLabel || 'Save result'); fin.type = 'button'; fin.addEventListener('click', () => finish(fin, err));
        const un = el('button', 'rb-btn', 'Fix last point'); un.type = 'button'; un.addEventListener('click', undo);
        actions.append(fin, un); panel.appendChild(actions);
      } else {
        const winner = g.home > g.away ? 'home' : 'away';
        panel.appendChild(el('div', 'rb-mono', `GAME ${state.games.length} COMPLETE`));
        panel.appendChild(el('h2', '', `${state.names[winner]} take the game`));
        panel.appendChild(el('div', 'rb-scoreline rb-mono', `${g.home} - ${g.away}`));
        panel.appendChild(el('div', 'rb-sub', `Games: ${state.gamesWon.home} - ${state.gamesWon.away}`));
        const actions = el('div', 'rb-actions');
        const nx = el('button', 'rb-btn rb-primary', `Start game ${state.games.length + 1}`); nx.type = 'button'; nx.addEventListener('click', nextGame);
        const un = el('button', 'rb-btn', 'Fix last point'); un.type = 'button'; un.addEventListener('click', undo);
        actions.append(nx, un); panel.appendChild(actions);
      }
    }

    /* ---------- actions ---------- */
    let liveTimer = null;
    function live() {
      if (!opts.onLive) return;
      try { opts.onLive(P.liveView(state)); } catch (e) { /* live view is best-effort */ }
    }
    function change(next, sayText) {
      state = next; resumed = false; persist(); render(); live();
      if (sayText) speak(sayText);
    }
    function tap(side) {
      if (state.complete || state.gameOver) return;
      const prev = state; history.push(prev);
      const next = P.applyRally(prev, side, Date.now());
      buzz(next.gameOver ? [30, 40, 30] : 15);
      change(next, P.announcement(prev, next));
    }
    function undo() {
      if (!history.length) return;
      const prev = history.pop(); buzz(10);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      change(prev);
    }
    function nextGame() {
      history.push(state);
      const next = P.startNextGame(state);
      change(next, `Game ${next.games.length + 1}. ${P.scoreCallSpoken(next)}`);
    }
    function startOver() {
      if (state.rallies > 0 && !confirm('Start the scoreboard over? The current score will be lost.')) return;
      state = P.createMatch(config, names); history = []; resumed = false; forget(); render(); live();
    }
    async function finish(btn, errBox) {
      if (saving) return; saving = true; btn.disabled = true; errBox.textContent = '';
      const old = btn.textContent; btn.textContent = 'Saving…';
      try {
        if (opts.onFinish) await opts.onFinish(P.summary(state), state);
        forget(); close(true);
      } catch (e) {
        errBox.textContent = (e && e.message) ? e.message : 'Could not save. Check your connection and try again.';
        btn.disabled = false; btn.textContent = old; saving = false;
      }
    }
    function close(finished) {
      clearTimeout(liveTimer);
      document.removeEventListener('visibilitychange', onVis);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      try { if (wake) wake.release(); } catch (e) { /* ignore */ }
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* ignore */ }
      document.body.style.overflow = prevOverflow;
      root.remove();
      if (!finished && opts.onCancel) opts.onCancel();
    }

    cancelBtn.addEventListener('click', () => close(false));
    undoBtn.addEventListener('click', undo);
    audioBtn.addEventListener('click', () => {
      audioOn = !audioOn;
      try { localStorage.setItem(AUDIO_KEY, audioOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      render(); if (audioOn) speak('Voice on', true);
    });
    testBtn.addEventListener('click', () => speak(`Score call: ${P.scoreCallSpoken(state)}`, true));
    fsBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else { await root.requestFullscreen(); try { await screen.orientation.lock('landscape'); } catch (e) { /* not supported */ } }
      } catch (e) { /* not supported */ }
    });
    if (!root.requestFullscreen) fsBtn.style.display = 'none';
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });

    render(); live();
    setTimeout(() => { try { cancelBtn.focus(); } catch (e) { /* ignore */ } }, 0);
    return { close: () => close(false), getState: () => state };
  }

  window.CourtBoard = { open };
}());
