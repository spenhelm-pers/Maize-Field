import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, LEVELS, todayDef, makeRouter, makeLevel } from '../src/core.js';

// Build a tiny hand-made field. Cells are row-major; start is cell 0.
function field(cols, rows, goal, { rocks = [], mud = [], ice = [] } = {}) {
  const n = cols * rows, mk = (list) => { const a = new Uint8Array(n); list.forEach((c) => { a[c] = 1; }); return a; };
  return { cols, rows, goal, rock: mk(rocks), mud: mk(mud), ice: mk(ice) };
}
const noFence = (L) => new Uint8Array(L.cols * L.rows);

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('router: open field is Manhattan distance', () => {
  const L = field(3, 3, 8);
  assert.equal(makeRouter(L)(noFence(L), 0, false), 4);
});

test('router: fences and rocks can wall the crib in', () => {
  const L = field(3, 3, 8, { rocks: [5] });
  const f = noFence(L); f[7] = 1;
  assert.equal(makeRouter(L)(f, 0, false), -1);
});

test('router: entering mud costs 2', () => {
  const L = field(3, 1, 2, { mud: [1] });
  assert.equal(makeRouter(L)(noFence(L), 0, false), 3);
});

test('router: a pig cannot turn on ice', () => {
  // Rocks at 1 and 6 force the pig through the centre square (4) with a turn to reach 7.
  const open = field(3, 3, 7, { rocks: [1, 6] });
  assert.equal(makeRouter(open)(noFence(open), 0, false), 3);          // 0,3,4,7
  const icy = field(3, 3, 7, { rocks: [1, 6], ice: [4] });
  assert.equal(makeRouter(icy)(noFence(icy), 0, false), 5);            // 0,3,4,5,8,7
});

test('router: path starts at the start, ends at the goal, and matches the cost', () => {
  const L = field(4, 4, 15, { mud: [5, 6] });
  const route = makeRouter(L), f = noFence(L);
  const path = route(f, 0, true), cost = route(f, 0, false);
  assert.equal(path[0], 0);
  assert.equal(path[path.length - 1], 15);
  const walked = path.slice(1).reduce((s, c) => s + (L.mud[c] ? 2 : 1), 0);
  assert.equal(walked, cost);
});

test('there are 21 numbered fields', () => {
  assert.equal(LEVELS.length, 21);
  LEVELS.forEach((d, i) => { assert.equal(d.id, String(i + 1)); assert.ok(d.seed > 0); });
});

test('every field generates identically each time and is solvable when empty', () => {
  for (const def of LEVELS) {
    const a = makeLevel(def), b = makeLevel(def);
    assert.deepEqual(a.rock, b.rock, `field ${def.id} rocks differ between runs`);
    assert.deepEqual(a.mud, b.mud);
    assert.deepEqual(a.ice, b.ice);
    const route = makeRouter(a), none = noFence(a);
    a.starts.forEach((s) => assert.ok(route(none, s, false) > 0, `field ${def.id}: start ${s} cannot reach the crib`));
    assert.ok(a.rock.reduce((s, v) => s + v, 0) >= def.rocks, `field ${def.id}: too few rocks`);
    a.starts.forEach((s) => assert.equal(a.rock[s], 0));
    assert.equal(a.rock[a.goal], 0);
  }
});

test('mud and ice appear only where the field asks for them', () => {
  for (const def of LEVELS) {
    const L = makeLevel(def);
    assert.equal(L.mud.some(Boolean), !!def.mud, `field ${def.id} mud`);
    assert.equal(L.ice.some(Boolean), !!(def.ice || def.cross), `field ${def.id} ice`);
    assert.equal(L.pigs, def.pigs || 1);
  }
});

test('ice junctions: one ice square with a rock on each corner', () => {
  for (const def of LEVELS.filter((d) => d.cross)) {
    const L = makeLevel(def);
    assert.equal(L.centers.length, def.cross, `field ${def.id}`);
    for (const c of L.centers) {
      assert.equal(L.ice[c], 1);
      [-L.cols - 1, -L.cols + 1, L.cols - 1, L.cols + 1].forEach((o) => assert.equal(L.rock[c + o], 1));
      [-1, 1, -L.cols, L.cols].forEach((o) => assert.equal(L.rock[c + o], 0));   // the plus stays open
    }
  }
});

test('the daily field is valid on every day of a year', () => {
  for (let day = 0; day < 366; day++) {
    const dt = new Date(2026, 0, 1 + day), def = todayDef(dt);
    assert.equal(def.label, 'Today');
    const L = makeLevel(def), route = makeRouter(L), none = noFence(L);
    L.starts.forEach((s) => assert.ok(route(none, s, false) > 0, `${dt.toDateString()} start ${s}`));
  }
});

test('the daily field depends only on the date', () => {
  const a = todayDef(new Date(2026, 9, 17, 3)), b = todayDef(new Date(2026, 9, 17, 22));
  assert.deepEqual(a, b);
  assert.notEqual(a.id, todayDef(new Date(2026, 9, 18)).id);
});
