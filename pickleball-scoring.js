/* Pickleball scoring engine -- pure functions, no DOM, no I/O.

   Ported from the Rally Score app's scoring model and rebuilt around a
   configurable format: game target, win-by, best-of, and side-out or rally
   scoring. Loaded by the browser as `PickleScore` and by the tests via
   require().

   You tap the side that WON the rally:
     side-out scoring   only the serving side can score. If the receivers win
                        the rally it is a fault: the first server hands over to
                        the second server (doubles), the second server hands
                        the serve to the other side (first server).
     rally scoring      the rally winner always scores and takes the serve.

   Doubles start every game at 0-0-2 (the first side serves as server 2).
   All state is plain JSON, so it can be saved, synced and undone by keeping a
   stack of past states. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PickleScore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TARGETS = [7, 9, 11, 15, 21];
  const BEST_OF = [1, 3, 5];
  const DEFAULT_CONFIG = Object.freeze({ target: 11, winBy: 2, bestOf: 1, scoring: 'sideout', doubles: true });

  const other = (side) => (side === 'home' ? 'away' : 'home');
  const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };

  function normalizeConfig(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      target: intIn(r.target, 1, 50, DEFAULT_CONFIG.target),
      winBy: intIn(r.winBy, 1, 2, DEFAULT_CONFIG.winBy),
      bestOf: BEST_OF.includes(Number(r.bestOf)) ? Number(r.bestOf) : DEFAULT_CONFIG.bestOf,
      scoring: r.scoring === 'rally' ? 'rally' : 'sideout',
      doubles: r.doubles !== false,
    };
  }
  const gamesToWin = (config) => Math.ceil(config.bestOf / 2);
  const startsAtServerTwo = (config) => config.scoring === 'sideout' && config.doubles;

  function createMatch(rawConfig, names) {
    const config = normalizeConfig(rawConfig);
    const n = names || {};
    return {
      config,
      names: { home: String(n.home || 'Home').slice(0, 60), away: String(n.away || 'Away').slice(0, 60) },
      games: [],
      home: 0, away: 0,
      gamesWon: { home: 0, away: 0 },
      firstServer: 'home',
      serving: 'home',
      serverNumber: startsAtServerTwo(config) ? 2 : 1,
      gameOver: false,
      complete: false,
      winner: null,
      rallies: 0,
      startedAt: null,
      endedAt: null,
    };
  }

  function gameIsWon(config, mine, theirs) {
    return mine >= config.target && mine - theirs >= config.winBy;
  }

  /* `side` won the rally. Returns a NEW state (the old one is untouched). */
  function applyRally(state, side, now) {
    if (state.complete || state.gameOver) return state;
    if (side !== 'home' && side !== 'away') return state;
    const at = now == null ? Date.now() : now;
    const next = { ...state, gamesWon: { ...state.gamesWon }, games: state.games.slice(), rallies: state.rallies + 1, startedAt: state.startedAt || at };
    const cfg = state.config;

    if (cfg.scoring === 'rally') {
      next[side] += 1;
      next.serving = side;
      next.serverNumber = 1;
    } else if (side === state.serving) {
      next[side] += 1;
    } else if (cfg.doubles && state.serverNumber === 1) {
      next.serverNumber = 2;
    } else {
      next.serving = side;
      next.serverNumber = 1;
    }

    if (gameIsWon(cfg, next[side], next[other(side)])) settleGame(next, side, at);
    return next;
  }

  /* `side` has won the current game: record it and, if that wins the match, end it. */
  function settleGame(next, side, at) {
    next.games.push({ home: next.home, away: next.away });
    next.gamesWon[side] += 1;
    next.gameOver = true;
    if (next.gamesWon[side] >= gamesToWin(next.config)) { next.complete = true; next.winner = side; next.endedAt = at; }
  }

  const validPoints = (v) => Number.isInteger(v) && v >= 0 && v <= 99;

  /* Correct the points of the game in progress. Returns a NEW state. If the
     corrected score is already a won game, the game is settled as usual. */
  function setPoints(state, home, away) {
    if (state.complete || state.gameOver) return { error: 'This game is already finished. Edit the game score instead.' };
    if (!validPoints(home) || !validPoints(away)) return { error: 'Points must be whole numbers from 0 to 99.' };
    const next = { ...state, home, away, gamesWon: { ...state.gamesWon }, games: state.games.slice() };
    const cfg = state.config;
    if (gameIsWon(cfg, home, away)) settleGame(next, 'home', state.startedAt || Date.now());
    else if (gameIsWon(cfg, away, home)) settleGame(next, 'away', state.startedAt || Date.now());
    return next;
  }

  /* Correct the score of a finished game (index into state.games). The games
     are re-counted from scratch, so the match result always follows the games.
     Returns a NEW state, or { error } if the score or the resulting match is
     not legal. */
  function editGame(state, index, home, away) {
    const cfg = state.config;
    if (!Number.isInteger(index) || index < 0 || index >= state.games.length) return { error: 'That game does not exist.' };
    if (!validPoints(home) || !validPoints(away)) return { error: 'Points must be whole numbers from 0 to 99.' };
    const hi = Math.max(home, away), lo = Math.min(home, away);
    if (!gameIsWon(cfg, hi, lo) || hi === lo) return { error: `Game ${index + 1} must end on a winning score: to ${cfg.target}, win by ${cfg.winBy}.` };

    const games = state.games.map((g, i) => (i === index ? { home, away } : { home: g.home, away: g.away }));
    const gamesWon = { home: 0, away: 0 };
    let winner = null, decidedAt = -1;
    games.forEach((g, i) => {
      const side = g.home > g.away ? 'home' : 'away';
      gamesWon[side] += 1;
      if (winner === null && gamesWon[side] >= gamesToWin(cfg)) { winner = side; decidedAt = i; }
    });
    if (winner !== null && decidedAt < games.length - 1) {
      return { error: `Game ${decidedAt + 1} would already decide the match, so the games after it cannot stand. Change this game so the match still goes the full distance.` };
    }
    if (winner !== null && state.gameOver === false && !state.complete) {
      return { error: 'Finish the game in progress first, or undo back to the end of the last game, before this change can end the match.' };
    }
    /* A game in progress stays in progress; a finished match stays finished. */
    const finishedBefore = state.gameOver || state.complete;
    return {
      ...state, games, gamesWon,
      gameOver: winner !== null || finishedBefore,
      complete: winner !== null, winner,
      endedAt: winner !== null ? (state.endedAt || Date.now()) : null,
    };
  }

  /* After a game that did not decide the match: fresh score, serve alternates. */
  function startNextGame(state) {
    if (!state.gameOver || state.complete) return state;
    const first = other(state.firstServer);
    return { ...state, games: state.games.slice(), gamesWon: { ...state.gamesWon }, home: 0, away: 0, firstServer: first, serving: first, serverNumber: startsAtServerTwo(state.config) ? 2 : 1, gameOver: false };
  }

  /* The call a referee makes: server score, receiver score, server number. */
  function scoreCall(state) {
    const srv = state[state.serving], rec = state[other(state.serving)];
    if (state.config.scoring === 'sideout' && state.config.doubles) return [srv, rec, state.serverNumber];
    return [srv, rec];
  }
  const scoreCallText = (state) => scoreCall(state).join('-');
  const scoreCallSpoken = (state) => scoreCall(state).join(', ');

  function gameScoreText(g) { return `${Math.max(g.home, g.away)} to ${Math.min(g.home, g.away)}`; }

  /* What to say after a rally moved `prev` to `next`. */
  function announcement(prev, next) {
    if (next === prev) return '';
    const nm = next.names;
    if (next.complete) {
      const g = next.games[next.games.length - 1];
      return `Winner, ${nm[next.winner]}, ${gameScoreText(g)}.`;
    }
    if (next.gameOver) {
      const g = next.games[next.games.length - 1];
      const winner = g.home > g.away ? 'home' : 'away';
      return `Game to ${nm[winner]}, ${gameScoreText(g)}.`;
    }
    const sideOut = prev.serving !== next.serving;
    return `${sideOut && next.config.scoring === 'sideout' ? 'Side out. ' : ''}${scoreCallSpoken(next)}`;
  }

  function summary(state) {
    const total = state.games.reduce((a, g) => ({ home: a.home + g.home, away: a.away + g.away }), { home: 0, away: 0 });
    return {
      complete: state.complete, winner: state.winner,
      games: state.games.map((g) => ({ home: g.home, away: g.away })),
      gamesWon: { ...state.gamesWon },
      totalPoints: total,
      config: { ...state.config },
      startedAt: state.startedAt, endedAt: state.endedAt,
    };
  }

  /* A compact, public-safe view of a match in progress (what spectators see). */
  function liveView(state) {
    return {
      names: { ...state.names },
      games: state.games.map((g) => ({ home: g.home, away: g.away })),
      gamesWon: { ...state.gamesWon },
      points: { home: state.home, away: state.away },
      serving: state.serving,
      serverNumber: state.config.scoring === 'sideout' && state.config.doubles ? state.serverNumber : null,
      gameOver: state.gameOver, complete: state.complete, winner: state.winner,
      config: { ...state.config },
      startedAt: state.startedAt,
    };
  }

  function formatLabel(rawConfig) {
    const c = normalizeConfig(rawConfig);
    return `Game to ${c.target}, win by ${c.winBy}, ${c.bestOf === 1 ? 'one game' : `best of ${c.bestOf}`}, ${c.scoring === 'rally' ? 'rally' : 'side-out'} scoring`;
  }

  return {
    TARGETS, BEST_OF, DEFAULT_CONFIG,
    normalizeConfig, gamesToWin, createMatch, applyRally, startNextGame, setPoints, editGame,
    scoreCall, scoreCallText, scoreCallSpoken, announcement, summary, liveView, formatLabel,
  };
}));
