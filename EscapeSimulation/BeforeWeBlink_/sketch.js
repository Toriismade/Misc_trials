// Before We Blink: p5.js simulation (Plan A).
// Instance mode keeps names such as dist, box and label from clashing with p5's global functions.
(() => {
  'use strict';

  /* ---------- World constants (fixed rules from the slides) ---------- */
  const W = 1000, H = 700, CX = 500, CY = 350;
  const ZONE_R = 170, CONSOLE_R = 24, TL_R = 15, WA_R = 15, CRYSTAL_R = 8;
  const START_ENERGY = 3, FEED_FREEZE = 10;
  const BASE_REACH = 190, BASE_ARC = 70 * Math.PI / 180;
  const FIXED_DT = 1 / 60;
  // Time Lords react late and aim imperfectly, which keeps the default conditions evenly matched.
  const TUNE = { aiSpin: 1.7, aiAimError: .3, aiPlanEvery: .55 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Adjustable conditions (Plan A) ---------- */
  const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const DEFS = [
    { id: 'tl', label: 'Time Lords', min: 2, max: 10, step: 1, val: 4, fmt: v => v },
    { id: 'wa', label: 'Weeping Angels', min: 2, max: 10, step: 1, val: 4, fmt: v => v },
    { id: 'fov', label: 'Size of field of view', min: 50, max: 200, step: 10, val: 100, fmt: v => v + '%' },
    { id: 'crystals', label: 'Crystals to escape', min: 3, max: 20, step: 1, val: 12, fmt: v => v },
    { id: 'tlSpeed', label: 'Time Lord speed', min: 40, max: 200, step: 10, val: 80, fmt: v => v },
    { id: 'waSpeed', label: 'Angel speed', min: 40, max: 200, step: 10, val: 110, fmt: v => v },
    { id: 'storm', label: 'Storm countdown', min: 60, max: 300, step: 15, val: 180, fmt: fmtTime },
  ];
  const settings = {};
  DEFS.forEach(d => { settings[d.id] = d.val; });

  /* ---------- Simulation ---------- */
  let G = null;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Random start positions: the oval keeps everything reachable and clear of the field's corners.
  const inField = (x, y) => ((x - CX) / 450) ** 2 + ((y - CY) / 325) ** 2 <= 1;
  function scatter(count, spacing, allowed) {
    const points = [];
    for (let i = 0; i < count; i++) {
      let best = null, bestGap = -1;
      for (let tries = 0; tries < 40;) {
        const x = 20 + Math.random() * (W - 40), y = 20 + Math.random() * (H - 40);
        if (!allowed(x, y)) continue;
        tries++;
        const gap = Math.min(Infinity, ...points.map(q => Math.hypot(q.x - x, q.y - y)));
        if (gap > bestGap) { best = { x, y }; bestGap = gap; }
        if (gap >= spacing) break;
      }
      points.push(best);
    }
    return points;
  }

  function newRound(cfg) {
    const fovScale = cfg.fov / 100;
    const g = {
      cfg: { ...cfg }, time: cfg.storm, elapsed: 0, delivered: 0, required: cfg.crystals,
      reach: BASE_REACH * fovScale, halfArc: Math.min(Math.PI, BASE_ARC * fovScale) / 2,
      tls: [], was: [], crystals: [], floats: [], winner: null, reason: '', drained: 0,
      planT: 0, waT: 0, pulse: 0,
    };
    scatter(cfg.tl, 45, (x, y) => {
      const d = Math.hypot(x - CX, y - CY);
      return d >= CONSOLE_R + TL_R + 8 && d <= ZONE_R - TL_R - 5;
    }).forEach((q, i) => {
      g.tls.push({ kind: 'TL', id: i + 1, x: q.x, y: q.y, vx: 0, vy: 0,
        e: START_ENERGY, view: Math.random() * 2 * Math.PI - Math.PI, carry: null, aim: null, goal: null, giveCd: 0, trail: [], trailT: 0 });
    });
    scatter(cfg.wa, 110, (x, y) => inField(x, y) && Math.hypot(x - CX, y - CY) >= ZONE_R + 60).forEach((q, i) => {
      g.was.push({ kind: 'WA', id: i + 1, x: q.x, y: q.y, vx: 0, vy: 0,
        cool: 0, seen: false, target: null, goal: null, trail: [], trailT: 0 });
    });
    scatter(cfg.crystals, 60, (x, y) => inField(x, y) && Math.hypot(x - CX, y - CY) >= ZONE_R + 35).forEach(q => {
      g.crystals.push({ x: q.x, y: q.y, state: 'free', by: null });
    });
    return g;
  }

  const hasView = t => t.e > 0 && !t.carry;
  const canHunt = w => !w.seen && w.cool <= 0;

  function inView(px, py, r, t) {
    const dx = px - t.x, dy = py - t.y, d = Math.hypot(dx, dy);
    if (d > G.reach + r) return false;
    if (d <= r) return true;
    const off = Math.abs(wrap(Math.atan2(dy, dx) - t.view));
    return off <= G.halfArc + Math.asin(Math.min(1, r / d));
  }
  const anyView = (px, py, r) => G.tls.some(t => hasView(t) && inView(px, py, r, t));

  function steer(a, tx, ty, maxSpeed, dt) {
    // flOw-style drift: velocity eases toward the aim point. Time Lords slow as they arrive; Angels chase at full speed.
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    const speed = a.kind === 'TL' ? maxSpeed * Math.min(1, d / 70) : maxSpeed;
    const dvx = d > 2 ? dx / d * speed : 0, dvy = d > 2 ? dy / d * speed : 0;
    const k = Math.min(1, dt * 4);
    a.vx += (dvx - a.vx) * k;
    a.vy += (dvy - a.vy) * k;
    a.x = clamp(a.x + a.vx * dt, 14, W - 14);
    a.y = clamp(a.y + a.vy * dt, 14, H - 14);
    a.trailT -= dt;
    if (a.trailT <= 0) {
      a.trailT = .07;
      a.trail.push({ x: a.x, y: a.y });
      if (a.trail.length > 12) a.trail.shift();
    }
  }
  function halt(a) { a.vx = 0; a.vy = 0; if (a.trail.length) a.trail.shift(); }

  function addFloat(x, y, txt, col) {
    if (G.floats.length < 40) G.floats.push({ x, y, txt, col, life: 1.1 });
  }

  function giveEnergy(from, to) {
    if (from.e <= 1 || to.e <= 0) return false;
    from.e--; to.e++;
    addFloat(to.x, to.y - 34, '+1', '#f5a623');
    addFloat(from.x, from.y - 34, '-1', '#f5a623');
    return true;
  }
  const touchingAlly = t => G.tls.filter(o => o !== t && o.e > 0 && dist(o, t) <= TL_R * 2 + 8)
    .sort((a, b) => a.e - b.e)[0] || null;

  function planTimeLords() {
    const alive = G.tls.filter(t => t.e > 0);
    const ais = alive.slice().sort((a, b) => (b.carry ? 1 : 0) - (a.carry ? 1 : 0) || a.id - b.id);
    const runners = Math.max(1, Math.ceil(ais.length / 2));
    const threats = G.was.filter(w => w.cool < 2);
    const claimed = new Set();
    G.tls.forEach(t => { if (t.carry) claimed.add(t.carry); });
    const carriers = alive.filter(t => t.carry);

    ais.forEach((t, i) => {
      t.role = i < runners ? 'runner' : 'guard';
      let goal = { x: CX, y: CY };
      if (t.carry) {
        goal = { x: CX, y: CY };
      } else if (t.role === 'runner') {
        let best = null, score = Infinity;
        G.crystals.forEach(c => {
          if (c.state !== 'free' || claimed.has(c)) return;
          const danger = G.was.some(w => canHunt(w) && dist(w, c) < 90) ? 160 : 0;
          const s = dist(t, c) + danger;
          if (s < score) { score = s; best = c; }
        });
        if (best) { claimed.add(best); goal = best; } else { t.role = 'guard'; }
      }
      if (t.role === 'guard' && !t.carry) {
        const ward = (carriers.length ? carriers : alive.filter(o => o !== t))
          .sort((a, b) => dist(a, t) - dist(b, t))[0];
        if (ward) {
          const near = threats.slice().sort((a, b) => dist(a, ward) - dist(b, ward))[0];
          const d = near ? dist(near, ward) || 1 : 1;
          goal = near ? { x: ward.x + (near.x - ward.x) / d * 65, y: ward.y + (near.y - ward.y) / d * 65 } : { x: ward.x, y: ward.y };
        }
        const hurt = t.e >= 2 && alive.filter(o => o !== t && o.e === 1 && dist(o, t) < 260)
          .sort((a, b) => dist(a, t) - dist(b, t))[0];
        if (hurt) goal = { x: hurt.x, y: hurt.y };
      }
      // Sidestep Angels that are free to move.
      let ax = 0, ay = 0;
      G.was.forEach(w => {
        if (!canHunt(w)) return;
        const d = dist(w, t);
        if (d < 110 && d > 0) { const f = (110 - d) / 110; ax += (t.x - w.x) / d * f; ay += (t.y - w.y) / d * f; }
      });
      t.goal = { x: goal.x + ax * 110, y: goal.y + ay * 110 };
      t.aim = null;
    });

    // Assign each threat its closest free view, most urgent threat first.
    const vulnerable = alive.length ? alive : [];
    const urgency = w => Math.min(...vulnerable.map(t => dist(w, t) * (t.carry ? .65 : 1)), 1e9);
    const lookers = ais.filter(t => !t.carry);
    const used = new Set();
    threats.slice().sort((a, b) => urgency(a) - urgency(b)).forEach(w => {
      let best = null, bd = Infinity;
      lookers.forEach(t => {
        if (used.has(t)) return;
        const d = dist(t, w);
        if (d < G.reach + 70 && d < bd) { bd = d; best = t; }
      });
      if (best) { used.add(best); best.aim = Math.atan2(w.y - best.y, w.x - best.x) + (Math.random() - .5) * 2 * TUNE.aiAimError; }
    });
    lookers.forEach(t => {
      if (t.aim !== null || !threats.length) return;
      const w = threats.slice().sort((a, b) => dist(a, t) - dist(b, t))[0];
      t.aim = Math.atan2(w.y - t.y, w.x - t.x) + (Math.random() - .5) * 2 * TUNE.aiAimError;
    });
  }

  function planAngels() {
    const prey = G.tls.filter(t => t.e > 0);
    const counts = new Map();
    G.was.forEach(w => {
      if (!canHunt(w)) { w.goal = null; return; }
      let best = null, score = Infinity;
      prey.forEach(t => {
        const s = dist(w, t) - (t.carry ? 150 : 0) + (counts.get(t) || 0) * 80 + (t.e === 1 ? -30 : 0)
          + (anyView((w.x + t.x) / 2, (w.y + t.y) / 2, WA_R) ? 130 : 0);
        if (s < score) { score = s; best = t; }
      });
      if (!best) { w.goal = null; return; }
      counts.set(best, (counts.get(best) || 0) + 1);
      const base = Math.atan2(best.y - w.y, best.x - w.x);
      const d = dist(w, best);
      if (d < TL_R + WA_R + 34) { w.goal = { x: best.x, y: best.y }; return; }
      const offs = [0, .4, -.4, .8, -.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3];
      w.goal = null;
      for (const o of offs) {
        const a = base + o;
        const clear = [30, 62].every(L => {
          const x = w.x + Math.cos(a) * L, y = w.y + Math.sin(a) * L;
          return x > 15 && x < W - 15 && y > 15 && y < H - 15 && !anyView(x, y, WA_R + 3);
        });
        if (clear) { w.goal = { x: w.x + Math.cos(a) * 90, y: w.y + Math.sin(a) * 90 }; break; }
      }
    });
  }

  function step(dt) {
    G.elapsed += dt;
    G.time -= dt;
    G.pulse = Math.max(0, G.pulse - dt);
    G.planT -= dt;
    G.waT -= dt;
    if (G.planT <= 0) { G.planT = TUNE.aiPlanEvery * (.7 + Math.random() * .6); planTimeLords(); }
    if (G.waT <= 0) { G.waT = .08; planAngels(); }

    // Time Lords move and spin.
    G.tls.forEach(t => {
      t.giveCd = Math.max(0, t.giveCd - dt);
      if (t.e <= 0) { halt(t); return; }
      const g = t.goal || t;
      steer(t, g.x, g.y, G.cfg.tlSpeed, dt);
      if (t.aim !== null && t.aim !== undefined && !t.carry) {
        const d = wrap(t.aim - t.view);
        t.view = wrap(t.view + clamp(d, -TUNE.aiSpin * dt, TUNE.aiSpin * dt));
      }
      if (t.e >= 2 && t.giveCd <= 0) {
        const ally = touchingAlly(t);
        if (ally && ally.e === 1 && giveEnergy(t, ally)) t.giveCd = 1;
      }
    });

    // Views freeze Angels before they get to act.
    G.was.forEach(w => {
      w.cool = Math.max(0, w.cool - dt);
      w.seen = anyView(w.x, w.y, WA_R);
      if (!canHunt(w)) { halt(w); return; }
      if (w.goal) steer(w, w.goal.x, w.goal.y, G.cfg.waSpeed, dt);
      else steer(w, w.x, w.y, G.cfg.waSpeed, dt);
    });

    // Feeding. A freshly moved Angel can still be caught by a view this tick.
    G.was.forEach(w => {
      if (w.cool > 0 || anyView(w.x, w.y, WA_R)) return;
      const hit = G.tls.find(t => t.e > 0 && dist(t, w) < TL_R + WA_R);
      if (!hit) return;
      hit.e--;
      G.drained++;
      w.cool = FEED_FREEZE;
      w.vx = w.vy = 0;
      addFloat(hit.x, hit.y - 34, '-1', '#ff3366');
      if (hit.e === 0 && hit.carry) {
        hit.carry.state = 'free';
        hit.carry.x = hit.x;
        hit.carry.y = hit.y;
        hit.carry.by = null;
        hit.carry = null;
      }
    });

    // Crystals.
    G.tls.forEach(t => {
      if (t.e <= 0) return;
      if (t.carry) {
        t.carry.x = t.x; t.carry.y = t.y;
        if (Math.hypot(t.x - CX, t.y - CY) <= TL_R + CONSOLE_R + 2) {
          t.carry.state = 'delivered';
          t.carry = null;
          G.delivered++;
          G.pulse = .6;
        }
      } else {
        const c = G.crystals.find(c => c.state === 'free' && dist(c, t) <= TL_R + CRYSTAL_R);
        if (c) { c.state = 'carried'; c.by = t; t.carry = c; }
      }
    });

    G.floats.forEach(f => { f.life -= dt; f.y -= 22 * dt; });
    G.floats = G.floats.filter(f => f.life > 0);

    if (G.delivered >= G.required) { G.winner = 'TL'; G.reason = 'escape'; }
    else if (G.tls.every(t => t.e <= 0)) { G.winner = 'WA'; G.reason = 'drained'; }
    else if (G.time <= 0) { G.time = 0; G.winner = 'WA'; G.reason = 'storm'; }
  }

  /* ---------- App state ---------- */
  const $ = id => document.getElementById(id);
  let phase = 'intro';         // intro | playing | paused | ended
  let acc = 0;

  function syncDirty() {
    const changed = G && DEFS.some(d => G.cfg[d.id] !== settings[d.id]);
    $('dirty').textContent = changed ? 'Press Reset to run with these changes.' : '';
  }

  function startRound() {
    G = newRound(settings);
    acc = 0; phase = 'playing';
    $('endOverlay').hidden = true;
    $('pauseOverlay').hidden = true;
    $('pauseBtn').textContent = 'Pause';
    if ($('intro').open) $('intro').close();
    syncDirty();
    hudSig = '';
  }

  function setPaused(on) {
    if (on && phase === 'playing') {
      phase = 'paused';
      $('pauseOverlay').hidden = false;
      $('pauseBtn').textContent = 'Resume';
    } else if (!on && phase === 'paused') {
      phase = 'playing';
      $('pauseOverlay').hidden = true;
      $('pauseBtn').textContent = 'Pause';
    }
  }

  function openStory() {
    const inRound = phase === 'playing' || phase === 'paused';
    pausedByStory = phase === 'playing';
    if (pausedByStory) setPaused(true);
    $('dlgStorm').textContent = fmtTime(settings.storm);
    $('resumeBtn').hidden = !inRound;
    $('startBtn').textContent = inRound ? 'Start over' : 'Start simulation';
    $('intro').showModal();
    $('intro').scrollTop = 0;
  }
  let pausedByStory = false;

  function finishRound() {
    phase = 'ended';
    const titles = {
      escape: 'The Time Lords escaped',
      drained: 'The Angels fed',
      storm: 'The storm took the TARDIS',
    };
    const details = {
      escape: `All ${G.required} crystals reached the console with ${fmtTime(G.time)} left on the storm.`,
      drained: `Every Time Lord ran out of time energy after ${fmtTime(G.elapsed)}. ${G.delivered} of ${G.required} crystals reached the console.`,
      storm: `Time ran out with ${G.delivered} of ${G.required} crystals at the console. The Angels win.`,
    };
    fillIcon($('endIcon'), iconCanvas(27, 21, 3, (x, y) => (G.winner === 'TL' ? stampLord(x - 3, y, { id: 'I', view: 0 }) : stampAngel(x, y, { cool: 0, seen: false }))));
    $('endTitle').textContent = titles[G.reason];
    $('endText').textContent = details[G.reason];
    const o = $('endOverlay');
    o.className = 'overlay ' + (G.winner === 'TL' ? 'win-tl' : 'win-wa');
    o.hidden = false;
    $('againBtn').focus({ preventScroll: true });
  }

  /* ---------- HUD ---------- */
  let hudSig = '';
  function statusText() {
    const hunting = G.was.filter(canHunt).length;
    const fed = G.was.filter(w => w.cool > 0).length;
    const seen = G.was.filter(w => w.seen && w.cool <= 0).length;
    const carrying = G.tls.filter(t => t.carry).length;
    return `Angels: ${hunting} hunting, ${seen} frozen by a view, ${fed} frozen after feeding. Time Lords carrying: ${carrying}.`;
  }
  function updateHud() {
    const status = statusText();
    const sig = [Math.ceil(G.time), G.delivered, G.required, G.tls.map(t => t.e).join(), status].join('|');
    if (sig === hudSig) return;
    hudSig = sig;
    const c = $('clock');
    c.textContent = fmtTime(G.time);
    c.classList.toggle('late', G.time <= 30);
    $('escapeText').textContent = '[' + '#'.repeat(G.delivered) + '.'.repeat(G.required - G.delivered) + '] ' + G.delivered + '/' + G.required;
    $('energy').innerHTML = G.tls.map(t => t.e > 0
      ? `<span class="chip">${idGlyph(t)}:<b>${'#'.repeat(t.e)}</b></span>`
      : `<span class="chip out">${idGlyph(t)}:out</span>`).join('');
    if ($('status').textContent !== status) $('status').textContent = status;
  }

  /* ---------- 1-bit pixel drawing ---------- */
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const idGlyph = t => ROMAN[t.id - 1];
  const PAPER = 0, INK = 1, AMBER = 2;
  const reachColors = { [PAPER]: 0xffffffff, [INK]: 0xff000000, [AMBER]: 0xff00a4f5 };
  let cols = 0, rows = 0, buf = new Uint8Array(0);

  function dot(x, y, v) { if (x >= 0 && y >= 0 && x < cols && y < rows) buf[y * cols + x] = v; }
  function box(x, y, w, h, v) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(x + i, y + j, v); }

  // Density tones. The pattern is tied to the screen, so a sprite's dither stays stable as it moves.
  function toneAt(code, x, y) {
    switch (code) {
      case '#': return INK;                                   // 100%
      case 'd': return x % 2 === 0 && y % 2 === 0 ? PAPER : INK; // 75%
      case 'x': return (x + y) % 2 ? INK : PAPER;             // 50%
      case 'l': return x % 2 === 0 && y % 2 === 0 ? INK : PAPER; // 25%
      case 'a': return AMBER;
      default: return PAPER;                                  // '.'
    }
  }
  const mirror = rowsLeft => rowsLeft.map(l => l + [...l.slice(0, -1)].reverse().join(''));
  function discBitmap(r) {
    const size = r * 2 + 1, out = [];
    for (let y = 0; y < size; y++) {
      let line = '';
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - r, y - r);
        line += d <= r - .9 ? 'd' : d <= r + .4 ? '#' : ' ';
      }
      out.push(line);
    }
    return out;
  }
  const BITMAP = {
    lord: discBitmap(6),
    gem: ['   #   ', '  #a#  ', ' #aaa# ', '#aaaaa#', ' #aaa# ', '  #a#  ', '   #   '],
    hunting: mirror([
      '#       ', '##   ###', '### ####', '### #..#', '### #..#', '########', ' #######',
      '  ######', '   #####', '   #####', '  ######', ' #######', ' #######',
    ]),
    stoneSeen: mirror([
      '     ###', '    #xxx', '  # #...', '  ###...', '  #x#xxx', '  #xxxxx', '  #xxxxx',
      '   #xxxx', '   #xxxx', '   #xxxx', '  #xxxxx', '  #xxxxx', '  ######',
    ]),
    stoneFed: mirror([
      '     ###', '    #lll', '  # #...', '  ###...', '  #l#lll', '  #lllll', '  #lllll',
      '   #llll', '   #llll', '   #llll', '  #lllll', '  #lllll', '  ######',
    ]),
    crystal: (() => {
      const top = ['    #', '   #a', '  #aa', ' #aaa', '#aaaa'].map(l => l + [...l.slice(0, -1)].reverse().join(''));
      return [...top, ...top.slice(0, -1).reverse()];
    })(),
    out: (() => {
      const r = [];
      for (let y = 0; y < 11; y++) {
        let line = '';
        for (let x = 0; x < 11; x++) line += x === y || x + y === 10 ? '#' : ' ';
        r.push(line);
      }
      return r;
    })(),
  };

  const haloCache = new Map();
  function haloOf(bitmap) {
    if (haloCache.has(bitmap)) return haloCache.get(bitmap);
    const seen = new Set(), list = [];
    bitmap.forEach((line, j) => [...line].forEach((c, i) => {
      if (c === ' ') return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const key = (i + dx) + ',' + (j + dy);
        if (!seen.has(key)) { seen.add(key); list.push([i + dx, j + dy]); }
      }
    }));
    haloCache.set(bitmap, list);
    return list;
  }
  // Every sprite clears a white margin around itself, so it never melts into what is behind it.
  function stamp(cx, cy, bitmap) {
    const x0 = cx - (bitmap[0].length >> 1), y0 = cy - (bitmap.length >> 1);
    haloOf(bitmap).forEach(([i, j]) => dot(x0 + i, y0 + j, PAPER));
    bitmap.forEach((line, j) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ') dot(x0 + i, y0 + j, toneAt(line[i], x0 + i, y0 + j));
      }
    });
  }

  const FONT = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    '/': '001001010100100', '-': '000000111000000', '+': '000010111010000', ' ': '000000000000000',
    A: '010101111101101', D: '110101101101110', E: '111100110100111', I: '111010010010111', N: '110101101101101',
    O: '111101101101111', R: '110101110101101', S: '111100111001111', T: '111010010010010', Z: '111001010100111',
  };
  const textWidth = s => s.length * 4 - 1;
  function label(x, y, s, v = INK) {
    [...s].forEach((c, n) => {
      const g = FONT[c] || FONT[' '];
      for (let i = 0; i < 15; i++) if (g[i] === '1') dot(x + n * 4 + i % 3, y + Math.floor(i / 3), v);
    });
  }

  // Roman numerals name Time Lords. Angels use plain digits for their countdown.
  const NUMERAL = { I: ['1', '1', '1', '1', '1'], V: ['101', '101', '101', '101', '010'], X: ['101', '101', '010', '101', '101'] };
  const numeralWidth = s => [...s].reduce((sum, c) => sum + NUMERAL[c][0].length + 1, -1);
  function numeral(cx, cy, s) {
    let x = cx - (numeralWidth(s) >> 1);
    [...s].forEach(c => {
      NUMERAL[c].forEach((line, j) => [...line].forEach((v, i) => { if (v === '1') dot(x + i, cy - 2 + j, INK); }));
      x += NUMERAL[c][0].length + 1;
    });
  }

  function stampLord(cx, cy, opts) {
    stamp(cx, cy, BITMAP.lord);
    if (opts.carry) {
      // The crystal sits on the dense body, so a carrier still reads as a Time Lord.
      BITMAP.gem.forEach((line, j) => [...line].forEach((c, i) => {
        if (c !== ' ') dot(cx - 3 + i, cy - 3 + j, toneAt(c, cx - 3 + i, cy - 3 + j));
      }));
      return;
    }
    if (opts.view !== undefined) {
      // A solid pointer outside the body shows where the view is aimed.
      const px = cx + Math.round(Math.cos(opts.view) * 9), py = cy + Math.round(Math.sin(opts.view) * 9);
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
        const d = Math.hypot(i, j);
        if (d <= 3.4) dot(px + i, py + j, d <= 2.2 ? INK : PAPER);
      }
    }
    const half = (numeralWidth(opts.id) >> 1) + 1;
    for (let j = -3; j <= 3; j++) for (let i = -half; i <= half; i++) if (Math.hypot(i, j) <= 5.2) dot(cx + i, cy + j, PAPER);
    numeral(cx, cy, opts.id);
  }
  function stampAngel(cx, cy, w) {
    if (w.cool > 0) {
      stamp(cx, cy, BITMAP.stoneFed);
      const s = String(Math.ceil(w.cool));
      box(cx - (textWidth(s) >> 1) - 1, cy, textWidth(s) + 2, 7, PAPER);
      label(cx - (textWidth(s) >> 1), cy + 1, s);
    } else if (w.seen) {
      stamp(cx, cy, BITMAP.stoneSeen);
    } else {
      stamp(cx, cy, BITMAP.hunting);
    }
  }

  /* Paints the buffer onto any 2D context, one buffer cell per image pixel. */
  function bufferImage() {
    const img = new ImageData(cols, rows);
    const out = new Uint32Array(img.data.buffer);
    for (let i = 0; i < buf.length; i++) out[i] = reachColors[buf[i]];
    return img;
  }
  /* A small canvas for the key, the pop-up and the end notice, drawn with the field's own sprites. */
  function iconCanvas(w, h, scale, draw) {
    const saved = [cols, rows, buf];
    cols = w; rows = h; buf = new Uint8Array(w * h);
    draw(w >> 1, h >> 1);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.className = 'icon';
    c.style.width = w * scale + 'px';
    c.style.height = h * scale + 'px';
    c.getContext('2d').putImageData(bufferImage(), 0, 0);
    [cols, rows, buf] = saved;
    return c;
  }

  // First view: the field at rest behind the pop-up. It exists before p5 draws its first frame.
  G = newRound(settings);

  /* ---------- p5 rendering ---------- */
  new p5(p => {
    let u = 3, off, offCtx;

    function fit() {
      const stage = $('stage');
      const wide = innerWidth > 900;
      const top = stage.getBoundingClientRect().top + scrollY;
      let w = stage.closest('.win').clientWidth;
      if (wide) w = Math.min(w, Math.max(420, (innerHeight - top - 16) * W / H));
      u = Math.max(2, Math.round(w / 340));
      const nextCols = Math.floor(w / u), nextRows = Math.floor(nextCols * H / W);
      if (nextCols === cols && nextRows === rows) return;
      cols = nextCols; rows = nextRows;
      buf = new Uint8Array(cols * rows);
      off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      offCtx = off.getContext('2d');
      stage.style.width = cols * u + 'px';
      p.resizeCanvas(cols * u, rows * u, true);
    }

    p.setup = () => {
      p.createCanvas(600, 420);
      p.drawingContext.canvas.setAttribute('aria-label', 'Simulation field: Time Lords, Weeping Angels, crystals and the TARDIS console');
      p.frameRate(60);
      fit();
      new ResizeObserver(fit).observe(document.body);
    };

    const px = x => Math.round(x / W * cols);
    const py = y => Math.round(y / H * rows);

    function drawZone() {
      const rx = ZONE_R / W * cols, ry = ZONE_R / H * rows;
      const steps = Math.ceil(2 * Math.PI * rx);
      for (let i = 0; i < steps; i++) {
        if (i % 8 >= 5) continue;
        const a = i / steps * 2 * Math.PI;
        dot(Math.round(px(CX) + Math.cos(a) * rx), Math.round(py(CY) + Math.sin(a) * ry), INK);
      }
    }

    function drawZoneLabel() {
      const s = 'TARDIS ZONE', w = textWidth(s);
      box(px(CX) - (w >> 1) - 2, py(CY - ZONE_R) - 4, w + 4, 9, PAPER);
      label(px(CX) - (w >> 1), py(CY - ZONE_R) - 2, s);
    }

    function drawViews() {
      // Light diagonal hatch: the lowest density on the field, so everything else reads on top of it.
      const toWx = W / cols, toWy = H / rows;
      G.tls.forEach(t => {
        if (!hasView(t)) return;
        const x0 = Math.max(0, px(t.x - G.reach)), x1 = Math.min(cols - 1, px(t.x + G.reach));
        const y0 = Math.max(0, py(t.y - G.reach)), y1 = Math.min(rows - 1, py(t.y + G.reach));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if ((x + y) % 5 !== 0) continue;
            if (inView((x + .5) * toWx, (y + .5) * toWy, 0, t)) buf[y * cols + x] = INK;
          }
        }
      });
    }

    function drawConsole() {
      const s = G.delivered + '/' + G.required;
      const w = Math.max(25, textWidth(s) + 8), h = 15, x = px(CX) - (w >> 1), y = py(CY) - (h >> 1);
      const flash = G.pulse > 0;
      box(x - 2, y - 2, w + 4, h + 4, PAPER);
      box(x, y, w, h, INK);
      box(x + 2, y + 3, w - 4, h - 6, flash ? INK : PAPER);
      label(px(CX) - (textWidth(s) >> 1), y + 5, s, flash ? PAPER : INK);
    }

    function drawCrystals() {
      G.crystals.forEach(k => { if (k.state === 'free') stamp(px(k.x), py(k.y), BITMAP.crystal); });
    }

    function drawAngels() { G.was.forEach(w => stampAngel(px(w.x), py(w.y), w)); }

    function drawLords() {
      G.tls.forEach(t => {
        const x = px(t.x), y = py(t.y);
        if (t.e <= 0) { stamp(x, y, BITMAP.out); return; }
        stampLord(x, y, { id: idGlyph(t), view: hasView(t) ? t.view : undefined, carry: !!t.carry });
        const slots = Math.max(START_ENERGY, t.e), left = x - ((slots * 4 - 1) >> 1);
        box(left - 2, y - 13, slots * 4 + 3, 6, PAPER);
        for (let i = 0; i < slots; i++) {
          box(left + i * 4, y - 12, 3, 3, INK);
          if (i >= t.e) dot(left + i * 4 + 1, y - 11, PAPER);
        }
      });
    }

    function drawFloats() {
      G.floats.forEach(f => {
        const w = textWidth(f.txt), x = px(f.x) - (w >> 1), y = py(f.y) - 8;
        box(x - 2, y - 2, w + 4, 9, INK);
        label(x, y, f.txt, PAPER);
      });
    }

    p.draw = () => {
      const realDt = Math.min(p.deltaTime / 1000, .05);
      if (phase === 'playing') {
        acc += realDt;
        while (acc >= FIXED_DT && !G.winner) {
          step(FIXED_DT);
          acc -= FIXED_DT;
        }
        if (G.winner) finishRound();
      }
      updateHud();
      buf.fill(PAPER);
      drawZone();
      drawViews();
      drawZoneLabel();
      drawConsole();
      drawCrystals();
      drawAngels();
      drawLords();
      drawFloats();
      offCtx.putImageData(bufferImage(), 0, 0);
      const ctx = p.drawingContext;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, p.width, p.height);
    };
  }, $('stage'));

  /* ---------- DOM wiring ---------- */
  const SAMPLE = {
    lord: () => iconCanvas(27, 21, 2, (x, y) => stampLord(x - 3, y, { id: 'I', view: 0 })),
    carry: () => iconCanvas(25, 21, 2, (x, y) => stampLord(x, y, { carry: true })),
    out: () => iconCanvas(25, 21, 2, (x, y) => stamp(x, y, BITMAP.out)),
    hunting: () => iconCanvas(25, 21, 2, (x, y) => stampAngel(x, y, { cool: 0, seen: false })),
    seen: () => iconCanvas(25, 21, 2, (x, y) => stampAngel(x, y, { cool: 0, seen: true })),
    fed: () => iconCanvas(25, 21, 2, (x, y) => stampAngel(x, y, { cool: 7, seen: false })),
    crystal: () => iconCanvas(25, 21, 2, (x, y) => stamp(x, y, BITMAP.crystal)),
    view: () => iconCanvas(25, 21, 2, () => {
      for (let y = 2; y < 19; y++) for (let x = 2; x < 23; x++) if ((x + y) % 5 === 0) dot(x, y, INK);
    }),
  };
  const fillIcon = (el, canvas) => { el.replaceChildren(canvas); };
  [
    ['lord', 'Time Lord, pointer shows its view'],
    ['carry', 'Time Lord carrying a crystal, no view'],
    ['out', 'Time Lord out of energy'],
    ['hunting', 'Angel hunting'],
    ['seen', 'Angel frozen by a view'],
    ['fed', 'Angel frozen after feeding, seconds left'],
    ['crystal', 'Zeiton Crystal'],
    ['view', 'Field of view'],
  ].forEach(([name, text]) => {
    const row = document.createElement('span');
    row.textContent = text;
    $('key').append(SAMPLE[name](), row);
  });
  fillIcon($('introTL'), iconCanvas(27, 21, 3, (x, y) => stampLord(x - 3, y, { id: 'I', view: 0 })));
  fillIcon($('introWA'), iconCanvas(25, 21, 3, (x, y) => stampAngel(x, y, { cool: 0, seen: false })));
  fillIcon($('pauseIcon'), iconCanvas(25, 21, 3, (x, y) => stampAngel(x, y, { cool: 0, seen: true })));

  const sliderBox = $('sliders');
  DEFS.forEach(d => {
    const wrapEl = document.createElement('div');
    wrapEl.className = 'field';
    wrapEl.innerHTML = `<label for="s-${d.id}"><span>${d.label}</span><output id="o-${d.id}">${d.fmt(d.val)}</output></label>
      <input type="range" id="s-${d.id}" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.val}">`;
    sliderBox.appendChild(wrapEl);
    wrapEl.querySelector('input').addEventListener('input', e => {
      settings[d.id] = Number(e.target.value);
      $('o-' + d.id).textContent = d.fmt(settings[d.id]);
      syncDirty();
    });
  });

  $('startBtn').addEventListener('click', startRound);
  $('resumeBtn').addEventListener('click', () => {
    $('intro').close();
    if (pausedByStory) setPaused(false);
  });
  $('resetBtn').addEventListener('click', startRound);
  $('againBtn').addEventListener('click', startRound);
  $('storyBtn').addEventListener('click', openStory);
  $('unpauseBtn').addEventListener('click', () => setPaused(false));
  $('pauseBtn').addEventListener('click', () => setPaused(phase !== 'paused'));
  $('intro').addEventListener('cancel', e => {
    // The first pop-up stays until the simulation starts. Later on, Esc returns to the run.
    if (phase === 'intro') e.preventDefault();
    else if (pausedByStory) setPaused(false);
  });

  addEventListener('keydown', e => {
    if ($('intro').open) return;
    if (e.key === ' ' && !(e.target && e.target.tagName === 'BUTTON')) {
      e.preventDefault();
      setPaused(phase !== 'paused');
    }
  });

  /* ---------- Opening pop-up ---------- */
  $('dlgStorm').textContent = fmtTime(settings.storm);
  $('intro').showModal();
  $('intro').scrollTop = 0;

  /* Small hook for testing conditions from the console. */
  window.BWB = {
    get state() { return G; }, settings, TUNE, phase: () => phase,
    simulate(cfg, tick = FIXED_DT) {
      const saved = G;
      G = newRound({ ...settings, ...cfg });
      while (!G.winner) step(tick);
      const out = { winner: G.winner, reason: G.reason, t: G.elapsed, delivered: G.delivered, drained: G.drained };
      G = saved;
      return out;
    },
    start: startRound,
    load(cfg) { G = newRound({ ...settings, ...cfg }); return G; },
    step(n) { for (let i = 0; i < n && !G.winner; i++) step(FIXED_DT); return G; },
  };
})();