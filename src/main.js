import './styles.css';
import { LEVELS, todayDef, makeRouter, makeLevel } from './core.js';

// ---------- game ----------
var $ = function (id) { return document.getElementById(id); };
var cv = $('board'), ctx = cv.getContext('2d');
var C = {}, cs = 32, L = null, fence = null, count = 0, router = null, openLen = 0, walk = 0;
var phase = 'plan', run = null, flash = null, drag = null, curDef = null;
var defs = LEVELS.concat([todayDef()]);
var KEY = 'maize-defense-v1';

// Only the daily field has a clock. It starts the first time that day's field is opened
// and runs on wall-clock time, even while the app is closed, so working a layout out
// offline does not help. It freezes at the moment the pigs are released.
var dailyStart = 0, frozen = null;
function isDaily(d) { return d.label === 'Today'; }
function nowT() { return frozen != null ? frozen : Date.now() - dailyStart; }
function fmt(ms, tenths) {
  if (tenths) {
    var t = Math.round(ms / 100), mt = Math.floor(t / 600), sec = (t - mt * 600) / 10;
    return mt + ':' + (sec < 10 ? '0' : '') + sec.toFixed(1);
  }
  var s = Math.floor(ms / 1000), m = Math.floor(s / 60), w = s - m * 60;
  return m + ':' + (w < 10 ? '0' : '') + w;
}
// third stat: the clock on the daily field, your best steps on every other field
function renderTime() {
  if (isDaily(curDef)) {
    $('kThird').textContent = 'Time'; $('sTime').textContent = fmt(nowT());
  } else {
    var r = rec(curDef);
    $('kThird').textContent = 'Your best'; $('sTime').textContent = r.steps ? String(r.steps) : '—';
  }
}

function store() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
// Saved scores belong to one layout. A record made for an older version of a field
// is ignored, so a reshaped field starts fresh. Older records without a signature
// are kept for fields whose layout has not changed.
var CHANGED = { '13': 1, '14': 1, '16': 1, '19': 1, '20': 1, '21': 1 };
function sigOf(d) {
  return [d.cols, d.rows, d.rocks, d.fences, d.mud || 0, d.ice || 0, d.pigs || 1, d.seed].join('-') +
    (d.cross ? '-x' + d.cross : '');
}
function validRec(r, d) { return !!r && (r.sig === sigOf(d) || (!r.sig && !CHANGED[d.id])); }
function rec(d) { var st = store(), r = st.lv && st.lv[d.id]; return validRec(r, d) ? r : {}; }
function writeRec(d, fn) {
  var st = store(); st.lv = st.lv || {};
  var r = validRec(st.lv[d.id], d) ? st.lv[d.id] : {};
  fn(r); r.sig = sigOf(d); st.lv[d.id] = r; save(st);
}

function refreshColors() {
  var s = getComputedStyle(document.documentElement);
  ['field-a','field-b','fence','fence-dk','rock','rock-hi','mud','mud-dk','ice','ice-hi','pig','pig-dk','pig2','pig2-dk','path','path2','crib','crib-dk','gold','bad'].forEach(function (n) {
    C[n] = s.getPropertyValue('--' + n).trim();
  });
}

function msg(t, kind) { var m = $('msg'); m.textContent = t; m.className = 'msg' + (kind ? ' ' + kind : ''); }
function tagFor(d) {
  var p = [];
  if (d.pigs > 1) p.push('2 pigs');
  if (d.mud) p.push('mud');
  if (d.ice || d.cross) p.push('ice');
  return p.join(' · ');
}

// cost of the quickest pig, or -1 if any pig would be walled in
function minWalk(f) {
  var m = 1e9;
  for (var q = 0; q < L.starts.length; q++) {
    var v = router(f, L.starts[q], false);
    if (v < 0) return -1;
    if (v < m) m = v;
  }
  return m;
}

function renderStats() {
  $('sFences').textContent = (L.fences - count);
  $('sWalk').textContent = walk;
  $('kWalk').textContent = L.pigs > 1 ? 'Quicker pig' : "Pig's walk";
  renderTime();
}

function renderLegend() {
  var lg = $('legend'); lg.textContent = '';
  var items = [];
  if (L.hasMud) items.push(['mud', 'Mud counts double']);
  if (L.hasIce) items.push(['ice', 'Ice: no turning']);
  if (L.pigs > 1) items.push(['p2', 'Quicker pig counts']);
  items.forEach(function (it) {
    var s = document.createElement('span');
    var sw = document.createElement('span'); sw.className = 'sw ' + it[0];
    s.appendChild(sw); s.appendChild(document.createTextNode(it[1]));
    lg.appendChild(s);
  });
  lg.hidden = items.length === 0;
}

function renderFields() {
  var box = $('fields'); box.textContent = '';
  defs.forEach(function (d) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fchip';
    if (curDef && d.id === curDef.id) b.setAttribute('aria-current', 'true');
    var r = rec(d);
    var n = document.createElement('span'); n.className = 'n'; n.textContent = d.label;
    var s = document.createElement('span'); s.className = 's';
    s.textContent = r.steps ? r.steps + (isDaily(d) && r.time != null ? ' · ' + fmt(r.time) : '') : '—';
    var t = document.createElement('span'); t.className = 't'; t.textContent = tagFor(d);
    b.appendChild(n); b.appendChild(s); b.appendChild(t);
    b.addEventListener('click', function () { loadLevel(d); $('fields').hidden = true; $('fieldsBtn').setAttribute('aria-expanded', 'false'); });
    box.appendChild(b);
  });
  $('fieldsBtn').textContent = curDef.label === 'Today' ? 'Today' : 'Field ' + curDef.label;
}

function setControls() {
  var b1 = $('b1'), b3 = $('b3');
  var rel = L && L.pigs > 1 ? 'Release the pigs' : 'Release the pig';
  if (phase === 'plan') {
    b1.hidden = false; b1.textContent = 'Clear'; b1.disabled = count === 0;
    b3.textContent = rel;
  } else if (phase === 'run') {
    b1.hidden = true; b3.textContent = 'Skip';
  } else {
    b1.hidden = false; b1.disabled = false; b1.textContent = 'Adjust';
    b3.textContent = 'Next field';
  }
}

function hint() {
  if (count === 0) {
    var t = L.pigs > 1
      ? 'Two pigs, one crib. The first to arrive eats, so lengthen both walks.'
      : 'The pig takes the shortest route to your corn. Fence it into the longest walk you can.';
    if (L.hasMud) t += ' Mud counts double.';
    if (L.hasIce) t += " Pigs can't turn on ice.";
    return t;
  }
  var extra = walk - openLen;
  return (L.pigs > 1 ? 'The quicker pig will walk ' : 'The pig will walk ') + walk + ' steps' +
    (extra > 0 ? ', ' + extra + ' more than an open field.' : ', no more than an open field.');
}

function changed() {
  walk = minWalk(fence);
  renderStats(); msg(hint()); setControls(); draw();
}

function loadLevel(def) {
  curDef = def; L = makeLevel(def);
  fence = new Uint8Array(L.cols * L.rows); count = 0;
  router = makeRouter(L);
  openLen = minWalk(fence); walk = openLen;
  phase = 'plan'; run = null; flash = null; frozen = null;
  var st = store(); st.last = def.id;
  if (isDaily(def)) {
    if (!st.clock || st.clock.id !== def.id) st.clock = { id: def.id, t: Date.now() };
    dailyStart = st.clock.t;
  }
  save(st);
  renderFields(); renderLegend(); layout();
  renderStats(); setControls(); msg(hint());
}

// ---------- drawing ----------
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function cx(c) { return (c % L.cols + 0.5) * cs; }
function cy(c) { return (Math.floor(c / L.cols) + 0.5) * cs; }

function drawRock(i) {
  var x = cx(i), y = cy(i), v = ((i * 37) % 7) / 7 * 0.1;
  ctx.fillStyle = C['rock'];
  ctx.beginPath(); ctx.ellipse(x, y + cs * 0.04, cs * (0.34 + v), cs * (0.28 + v * 0.6), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C['rock-hi'];
  ctx.beginPath(); ctx.ellipse(x - cs * 0.08, y - cs * 0.06, cs * 0.14, cs * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
}

function drawMud(i) {
  var px = (i % L.cols) * cs, py = Math.floor(i / L.cols) * cs;
  ctx.fillStyle = C['mud']; rr(px + cs * 0.04, py + cs * 0.04, cs * 0.92, cs * 0.92, cs * 0.2); ctx.fill();
  ctx.fillStyle = C['mud-dk'];
  var h = (i * 2654435761) >>> 0;
  for (var k = 0; k < 3; k++) {
    var ax = ((h >>> (k * 8)) & 255) / 255, ay = ((h >>> (k * 8 + 3)) & 255) / 255;
    ctx.beginPath(); ctx.ellipse(px + cs * (0.25 + 0.5 * ax), py + cs * (0.25 + 0.5 * ay), cs * 0.09, cs * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawIce(i) {
  var px = (i % L.cols) * cs, py = Math.floor(i / L.cols) * cs;
  ctx.fillStyle = C['ice']; rr(px + cs * 0.03, py + cs * 0.03, cs * 0.94, cs * 0.94, cs * 0.12); ctx.fill();
  ctx.save();
  ctx.strokeStyle = C['ice-hi']; ctx.lineWidth = Math.max(1.5, cs * 0.05); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px + cs * 0.22, py + cs * 0.46); ctx.lineTo(px + cs * 0.46, py + cs * 0.22);
  ctx.moveTo(px + cs * 0.46, py + cs * 0.78); ctx.lineTo(px + cs * 0.78, py + cs * 0.46);
  ctx.stroke();
  ctx.restore();
}

function drawFence(i) {
  var px = (i % L.cols) * cs, py = Math.floor(i / L.cols) * cs, m = cs * 0.14;
  ctx.fillStyle = C['fence-dk']; rr(px + m, py + m, cs - 2 * m, cs - 2 * m, cs * 0.12); ctx.fill();
  ctx.fillStyle = C['fence'];
  rr(px + m * 1.5, py + cs * 0.30, cs - m * 3, cs * 0.16, cs * 0.05); ctx.fill();
  rr(px + m * 1.5, py + cs * 0.54, cs - m * 3, cs * 0.16, cs * 0.05); ctx.fill();
}

function drawCrib(i) {
  var px = (i % L.cols) * cs, py = Math.floor(i / L.cols) * cs;
  ctx.fillStyle = C['crib-dk']; rr(px + cs * 0.14, py + cs * 0.34, cs * 0.72, cs * 0.52, cs * 0.06); ctx.fill();
  ctx.fillStyle = C['gold'];
  for (var k = 0; k < 4; k++) { rr(px + cs * 0.2 + k * cs * 0.16, py + cs * 0.40, cs * 0.1, cs * 0.40, cs * 0.03); ctx.fill(); }
  ctx.fillStyle = C['crib'];
  ctx.beginPath(); ctx.moveTo(px + cs * 0.06, py + cs * 0.38); ctx.lineTo(px + cs * 0.5, py + cs * 0.10); ctx.lineTo(px + cs * 0.94, py + cs * 0.38); ctx.closePath(); ctx.fill();
}

function drawPig(x, y, face, bob, alt) {
  var s = cs, body = alt ? C['pig2'] : C['pig'], dk = alt ? C['pig2-dk'] : C['pig-dk'];
  ctx.save(); ctx.translate(x, y + (bob || 0)); if (face < 0) ctx.scale(-1, 1);
  ctx.fillStyle = dk;
  ctx.fillRect(-s * 0.22, s * 0.12, s * 0.07, s * 0.16); ctx.fillRect(s * 0.08, s * 0.12, s * 0.07, s * 0.16);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(-s * 0.04, 0, s * 0.30, s * 0.21, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.25, -s * 0.04, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dk;
  ctx.beginPath(); ctx.moveTo(s * 0.20, -s * 0.16); ctx.lineTo(s * 0.30, -s * 0.28); ctx.lineTo(s * 0.34, -s * 0.12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.38, -s * 0.02, s * 0.07, s * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = body;
  ctx.fillRect(s * 0.36, -s * 0.04, s * 0.025, s * 0.035); ctx.fillRect(s * 0.405, -s * 0.04, s * 0.025, s * 0.035);
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(s * 0.28, -s * 0.09, s * 0.024, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = dk; ctx.lineWidth = Math.max(1.5, s * 0.04);
  ctx.beginPath(); ctx.arc(-s * 0.36, -s * 0.05, s * 0.05, 0, Math.PI * 1.6); ctx.stroke();
  ctx.restore();
}

// where a pig rests next to the crib once it has arrived
function crowdX(pi) { return cx(L.goal) + (L.pigs > 1 ? (pi ? 0.2 : -0.2) : -0.12) * cs; }

function draw() {
  if (!L) return;
  var W = cs * L.cols, H = cs * L.rows, i, x, y, n = L.cols * L.rows;
  ctx.clearRect(0, 0, W, H);
  for (i = 0; i < n; i++) {
    x = i % L.cols; y = (i - x) / L.cols;
    ctx.fillStyle = ((x + y) & 1) ? C['field-b'] : C['field-a'];
    ctx.fillRect(x * cs, y * cs, cs, cs);
  }
  for (i = 0; i < n; i++) { if (L.mud[i]) drawMud(i); else if (L.ice[i]) drawIce(i); }
  for (i = 0; i < n; i++) if (L.rock[i]) drawRock(i);

  var paths = (phase === 'run' && run) ? run.pigs.map(function (p) { return p.path; })
    : L.starts.map(function (s) { return router(fence, s, true); });
  paths.forEach(function (path, pi) {
    if (!path) return;
    ctx.save();
    ctx.globalAlpha = phase === 'run' ? 0.4 : 0.95;
    ctx.strokeStyle = pi ? C['path2'] : C['path']; ctx.lineWidth = Math.max(2, cs * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([cs * 0.02, cs * 0.2]);
    ctx.beginPath();
    path.forEach(function (c, k) { if (k) ctx.lineTo(cx(c), cy(c)); else ctx.moveTo(cx(c), cy(c)); });
    ctx.stroke();
    ctx.restore();
  });

  for (i = 0; i < n; i++) if (fence[i]) drawFence(i);
  drawCrib(L.goal);

  if (phase === 'run' && run) {
    var tau = Math.min(1, (performance.now() - run.t0) / run.dur) * run.maxC;
    run.pigs.forEach(function (pg, pi) {
      var path = pg.path, tl = pg.tl, last = path.length - 1;
      if (tau >= pg.total) { drawPig(crowdX(pi), cy(L.goal) + cs * 0.12, pg.face, 0, pi === 1); return; }
      var k = 0;
      while (k < last - 1 && tl[k + 1] <= tau) k++;
      var a = path[k], b = path[k + 1], f = (tau - tl[k]) / (tl[k + 1] - tl[k]);
      var px = cx(a) + (cx(b) - cx(a)) * f, py = cy(a) + (cy(b) - cy(a)) * f;
      if (cx(b) > cx(a)) pg.face = 1; else if (cx(b) < cx(a)) pg.face = -1;
      drawPig(px, py, pg.face, Math.sin(tau * Math.PI * 2) * cs * 0.03, pi === 1);
    });
  } else if (phase === 'done') {
    L.starts.forEach(function (s, pi) { drawPig(crowdX(pi), cy(L.goal) + cs * 0.12, -1, 0, pi === 1); });
  } else {
    L.starts.forEach(function (s, pi) { drawPig(cx(s), cy(s), pi ? -1 : 1, 0, pi === 1); });
  }

  if (flash && performance.now() < flash.until) {
    ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = C['bad'];
    rr((flash.cell % L.cols) * cs + 2, Math.floor(flash.cell / L.cols) * cs + 2, cs - 4, cs - 4, cs * 0.12); ctx.fill();
    ctx.restore();
  }
}

function layout() {
  if (!L) return;
  var wrap = $('boardwrap').clientWidth || 360;
  var availH = Math.max(260, window.innerHeight - 345);
  cs = Math.floor(Math.min(wrap / L.cols, availH / L.rows));
  cs = Math.max(24, Math.min(cs, 56));
  var w = cs * L.cols, h = cs * L.rows, dpr = window.devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

// ---------- input ----------
function cellAt(e) {
  var r = cv.getBoundingClientRect();
  var x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs);
  if (x < 0 || y < 0 || x >= L.cols || y >= L.rows) return -1;
  return y * L.cols + x;
}

function flashCell(c) {
  flash = { cell: c, until: performance.now() + 350 };
  draw(); setTimeout(draw, 380);
}

function isFixed(c) {
  return L.rock[c] || c === L.goal || L.starts.indexOf(c) >= 0;
}

function toggle(c, mode) {
  if (isFixed(c)) return;
  if (mode === 'remove') {
    if (fence[c]) { fence[c] = 0; count--; changed(); }
    return;
  }
  if (fence[c]) return;
  if (count >= L.fences) { msg('Out of fences. Tap one to pick it up.', 'bad'); flashCell(c); return; }
  fence[c] = 1;
  if (minWalk(fence) < 0) {
    fence[c] = 0;
    msg('A walled-in pig tramples the fence. Leave a way through for every pig.', 'bad'); flashCell(c); return;
  }
  count++; changed();
}

cv.addEventListener('pointerdown', function (e) {
  if (phase !== 'plan') return;
  var c = cellAt(e); if (c < 0) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  drag = { mode: fence[c] ? 'remove' : 'add', last: c };
  toggle(c, drag.mode);
});
cv.addEventListener('pointermove', function (e) {
  if (!drag || phase !== 'plan') return;
  var c = cellAt(e);
  if (c >= 0 && c !== drag.last) { drag.last = c; toggle(c, drag.mode); }
});
function endDrag() { drag = null; }
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

// ---------- run and results ----------
function release() {
  if (phase !== 'plan') return;
  var pigs = [], maxC = 0;
  for (var q = 0; q < L.starts.length; q++) {
    var path = router(fence, L.starts[q], true);
    if (!path) return;
    var tl = [0];
    for (var k = 1; k < path.length; k++) tl.push(tl[k - 1] + (L.mud[path[k]] ? 2 : 1));
    var total = tl[tl.length - 1];
    pigs.push({ path: path, tl: tl, total: total, face: q ? -1 : 1 });
    if (total > maxC) maxC = total;
  }
  if (isDaily(curDef)) frozen = Date.now() - dailyStart;
  renderTime();
  phase = 'run';
  run = { pigs: pigs, maxC: maxC, t0: performance.now(), dur: Math.min(7, Math.max(2.5, maxC * 0.14)) * 1000 };
  setControls(); msg(L.pigs > 1 ? 'Here they come…' : 'Here he comes…');
  requestAnimationFrame(frame);
}
function frame() {
  if (phase !== 'run') return;
  if (performance.now() - run.t0 >= run.dur) { finish(); return; }
  draw(); requestAnimationFrame(frame);
}

// High score: more steps wins. On the daily field a faster time breaks a tie.
function finish() {
  if (phase !== 'run') return;
  var steps = Math.min.apply(null, run.pigs.map(function (p) { return p.total; }));
  var daily = isDaily(curDef), time = daily ? frozen : null, prev = rec(curDef), had = !!prev.steps;
  var faster = daily && (prev.time == null || time < prev.time);
  var better = !had || steps > prev.steps || (steps === prev.steps && faster);
  var who = L.pigs > 1 ? ' for the quicker pig' : '';
  var t = steps + ' steps' + who + (daily ? ' in ' + fmt(time, true) : '') + '. ';
  if (!had) t += 'First score on this field.';
  else if (steps > prev.steps) t += 'New high score. Your last best was ' + prev.steps + '.';
  else if (daily && steps === prev.steps && prev.time == null) t += 'Matches your best. Time recorded.';
  else if (daily && steps === prev.steps && faster) t += 'Same steps, faster. New best time.';
  else if (steps === prev.steps) t += 'Matches your best' + (daily && prev.time != null ? ' steps, but your best time is ' + fmt(prev.time, true) : '') + '.';
  else t += 'Your best is ' + prev.steps + (daily && prev.time != null ? ' in ' + fmt(prev.time, true) : '') + '.';
  if (better) writeRec(curDef, function (r) {
    r.steps = steps;
    if (daily) r.time = time; else delete r.time;
    delete r.par; delete r.stars;
  });
  phase = 'done';
  msg(t, 'good'); setControls(); renderFields(); renderTime(); draw();
}

function nextField() {
  var i = 0;
  for (var k = 0; k < defs.length; k++) if (defs[k].id === curDef.id) i = k;
  loadLevel(defs[(i + 1) % defs.length]);
}

$('b1').addEventListener('click', function () {
  if (phase === 'plan') {
    fence.fill(0); count = 0; changed();
  } else if (phase === 'done') {
    phase = 'plan'; run = null; frozen = null;
    changed();
  }
});
$('b3').addEventListener('click', function () {
  if (phase === 'plan') release();
  else if (phase === 'run') finish();
  else if (phase === 'done') nextField();
});
$('fieldsBtn').addEventListener('click', function () {
  var box = $('fields'); box.hidden = !box.hidden;
  $('fieldsBtn').setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
  layout();
});

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
setInterval(function () { if (curDef && isDaily(curDef) && frozen == null) renderTime(); }, 250);
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { refreshColors(); draw(); });
  new MutationObserver(function () { refreshColors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
} catch (e) {}

refreshColors();
var last = store().last, startDef = defs[0];
for (var q = 0; q < defs.length; q++) if (defs[q].id === last) startDef = defs[q];
loadLevel(startDef);
