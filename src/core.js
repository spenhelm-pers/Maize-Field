// Pure game logic: no DOM access, so it can be unit tested in Node.

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export var LEVELS = [
  // single pig, open ground
  { cols: 7,  rows: 9,  rocks: 4,  fences: 8 },
  { cols: 7,  rows: 9,  rocks: 6,  fences: 9 },
  { cols: 7,  rows: 10, rocks: 6,  fences: 10 },
  { cols: 8,  rows: 10, rocks: 8,  fences: 12 },
  { cols: 8,  rows: 11, rocks: 8,  fences: 13 },
  { cols: 8,  rows: 12, rocks: 10, fences: 14 },
  { cols: 9,  rows: 12, rocks: 10, fences: 15 },
  { cols: 9,  rows: 13, rocks: 12, fences: 16 },
  { cols: 9,  rows: 13, rocks: 14, fences: 18 },
  { cols: 10, rows: 14, rocks: 14, fences: 20 },
  { cols: 10, rows: 14, rocks: 18, fences: 22 },
  { cols: 10, rows: 14, rocks: 20, fences: 24 },
  // mud, then ice, then both
  { cols: 7,  rows: 9,  rocks: 4,  fences: 8,  mud: 6 },
  { cols: 8,  rows: 10, rocks: 6,  fences: 10, mud: 10 },
  { cols: 8,  rows: 11, rocks: 6,  fences: 12, ice: 8 },
  { cols: 8,  rows: 11, rocks: 6,  fences: 12, ice: 4, cross: 1, mud: 8, seed: 6633 },
  // two pigs from the top corners, one crib at the bottom centre
  { cols: 9,  rows: 11, rocks: 8,  fences: 14, pigs: 2 },
  { cols: 9,  rows: 12, rocks: 8,  fences: 16, pigs: 2, mud: 12 },
  { cols: 9,  rows: 12, rocks: 8,  fences: 16, pigs: 2, ice: 4, cross: 1, seed: 3936 },
  { cols: 9,  rows: 13, rocks: 10, fences: 18, pigs: 2, mud: 12, ice: 4, cross: 1, seed: 11037 },
  { cols: 11, rows: 14, rocks: 12, fences: 22, pigs: 2, mud: 14, ice: 6, cross: 2, seed: 11138 }
].map(function (d, i) {
  d.id = String(i + 1); d.label = String(i + 1); d.seed = d.seed || (i + 1) * 101 + 17; return d;
});

// The daily field mixes the features based on the date.
export function todayDef(dt) {
  var t = dt || new Date();
  var n = t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate();
  var f = n % 4, two = Math.floor(n / 4) % 2 === 1;
  var d = { id: 'e' + n, label: 'Today', cols: 9, rows: two ? 12 : 13, rocks: 12, fences: 16, seed: n };
  if (f & 1) d.mud = 12;
  if (f & 2) { d.ice = 6; d.cross = 1; }
  if (two) d.pigs = 2;
  return d;
}

// Cheapest route to the crib. Entering a mud square costs 2, everything else 1.
// A pig on ice cannot turn: it has to keep moving the way it entered, so a strip
// it cannot cross in a straight line is a dead end. Search is over (square, heading)
// states with a three-bucket queue, since every step costs 1 or 2.
// Returns the cost (or -1 if the crib is unreachable); with wantPath, the list of squares.
export function makeRouter(L) {
  var cols = L.cols, rows = L.rows, n = cols * rows, S = n * 4, goal = L.goal;
  var rock = L.rock, mud = L.mud, ice = L.ice, INF = 0x3fffffff;
  var dist = new Int32Array(S), par = new Int32Array(S), cap = S * 4 + 8;
  var qa = new Int32Array(cap), qb = new Int32Array(cap), qc = new Int32Array(cap);
  var DX = [0, 1, 0, -1], DY = [1, 0, -1, 0];
  return function (fence, start, wantPath) {
    dist.fill(INF);
    var cur = qa, n1 = qb, n2 = qc, cl = 0, l1 = 0, l2 = 0, d = 0, s0 = start * 4;
    dist[s0] = 0; par[s0] = -1; cur[cl++] = s0;
    while (cl > 0 || l1 > 0 || l2 > 0) {
      for (var h = 0; h < cl; h++) {
        var st = cur[h];
        if (dist[st] !== d) continue;
        var c = st >> 2, dd = st & 3;
        if (c === goal) {
          if (!wantPath) return d;
          var p = [], q = st;
          while (q !== -1) { p.push(q >> 2); q = par[q]; }
          p.reverse();
          return p;
        }
        var x = c % cols, y = (c - x) / cols, from, to;
        if (ice[c]) { from = dd; to = dd + 1; } else { from = 0; to = 4; }
        for (var e = from; e < to; e++) {
          var nx = x + DX[e], ny = y + DY[e];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          var nc = ny * cols + nx;
          if (rock[nc] || fence[nc]) continue;
          var ns = ice[nc] ? nc * 4 + e : nc * 4, nd = d + (mud[nc] ? 2 : 1);
          if (nd < dist[ns]) {
            dist[ns] = nd; par[ns] = st;
            if (mud[nc]) n2[l2++] = ns; else n1[l1++] = ns;
          }
        }
      }
      var t = cur; cur = n1; n1 = n2; n2 = t;
      cl = l1; l1 = l2; l2 = 0; d++;
    }
    return wantPath ? null : -1;
  };
}

export function makeLevel(def) {
  var cols = def.cols, rows = def.rows, n = cols * rows, pigs = def.pigs || 1;
  var starts = pigs > 1 ? [0, cols - 1] : [0];
  var goal = pigs > 1 ? (rows - 1) * cols + Math.floor(cols / 2) : n - 1;
  var keep = {};
  function addKeep(c) {
    var x = c % cols, y = (c - x) / cols;
    keep[c] = 1;
    if (x > 0) keep[c - 1] = 1;
    if (x < cols - 1) keep[c + 1] = 1;
    if (y > 0) keep[c - cols] = 1;
    if (y < rows - 1) keep[c + cols] = 1;
  }
  starts.forEach(addKeep); addKeep(goal);
  var none = new Uint8Array(n), tries = 0, DXs = [0, 1, 0, -1], DYs = [1, 0, -1, 0];
  while (true) {
    var rng = mulberry32(def.seed + tries * 977);
    var rock = new Uint8Array(n), mud = new Uint8Array(n), ice = new Uint8Array(n), taken = new Uint8Array(n);
    var placed = 0, guard = 0, c;
    while (placed < def.rocks && guard < 5000) {
      guard++; c = Math.floor(rng() * n);
      if (rock[c] || keep[c]) continue;
      rock[c] = 1; taken[c] = 1; placed++;
    }
    // Ice crossings: one ice square with a rock on each of its four corners, which leaves
    // a plus-shaped junction. A pig cannot turn on the ice, so it has to go straight
    // through, and a layout can force it to leave, loop around and cross the same square
    // again from the other direction.
    var centers = [], made = 0;
    guard = 0;
    while (def.cross && made < def.cross && guard < 2000) {
      guard++;
      var ox = 1 + Math.floor(rng() * (cols - 2)), oy = 1 + Math.floor(rng() * (rows - 2));
      var ic = oy * cols + ox;
      var ring = [ic, ic - 1, ic + 1, ic - cols, ic + cols, ic - cols - 1, ic - cols + 1, ic + cols - 1, ic + cols + 1];
      if (ring.some(function (q) { return taken[q] || keep[q]; })) continue;
      ring.forEach(function (q) { taken[q] = 1; });      // keep other features off the junction
      ice[ic] = 1;
      [ic - cols - 1, ic - cols + 1, ic + cols - 1, ic + cols + 1].forEach(function (q) { rock[q] = 1; });
      centers.push(ic); made++;
    }
    // ice also comes in straight strips of 3 to 5 squares
    placed = 0; guard = 0;
    while (def.ice && placed < def.ice && guard < 2000) {
      guard++; c = Math.floor(rng() * n);
      if (taken[c] || keep[c]) continue;
      var horiz = rng() < 0.5, len = 3 + Math.floor(rng() * 3), x0 = c % cols, y0 = (c - x0) / cols;
      for (var k = 0; k < len && placed < def.ice; k++) {
        var xx = horiz ? x0 + k : x0, yy = horiz ? y0 : y0 + k;
        if (xx >= cols || yy >= rows) break;
        var cc = yy * cols + xx;
        if (taken[cc] || keep[cc]) break;
        ice[cc] = 1; taken[cc] = 1; placed++;
      }
    }
    // mud comes in small blobs
    placed = 0; guard = 0;
    while (def.mud && placed < def.mud && guard < 2000) {
      guard++; c = Math.floor(rng() * n);
      if (taken[c] || keep[c]) continue;
      var cur = c, steps = 0;
      mud[cur] = 1; taken[cur] = 1; placed++;
      while (steps < 4 && placed < def.mud) {
        steps++;
        var dir = Math.floor(rng() * 4), cx0 = cur % cols, cy0 = (cur - cx0) / cols;
        var nx = cx0 + DXs[dir], ny = cy0 + DYs[dir];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var nc = ny * cols + nx;
        if (taken[nc] || keep[nc]) continue;
        mud[nc] = 1; taken[nc] = 1; placed++; cur = nc;
      }
    }
    var L = {
      id: def.id, label: def.label, cols: cols, rows: rows, fences: def.fences, seed: def.seed,
      rock: rock, mud: mud, ice: ice, starts: starts, goal: goal, pigs: pigs,
      hasMud: !!def.mud, hasIce: !!(def.ice || def.cross), centers: centers
    };
    var route = makeRouter(L), ok = true;
    starts.forEach(function (s) { if (route(none, s, false) < 0) ok = false; });
    if (ok) return L;
    tries++;
  }
}

