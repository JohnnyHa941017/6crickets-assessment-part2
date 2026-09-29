'use strict';

/*
 * Checks whether a set of hardware cameras covers the desired (distance, light) range.
 * Each camera is a closed rectangle; ranges are inclusive and min === max is allowed.
 *
 * Split the distance axis at every camera boundary, then check light coverage at the
 * midpoint of each strip. Closed rectangles mean the strip edges are covered too.
 * O(n^2 log n).
 */

/**
 * @typedef {{ min: number, max: number }} Range
 * @typedef {{ distance: Range, light: Range }} Spec
 */

/**
 * @param {Spec} desired
 * @param {Spec[]} cameras
 * @returns {boolean}
 */
function isSufficient(desired, cameras) {
  validateSpec(desired, 'desired');
  if (!Array.isArray(cameras)) throw new TypeError('cameras must be an array');
  cameras.forEach((c, i) => validateSpec(c, `cameras[${i}]`));

  const { distance: D, light: L } = desired;

  const relevant = cameras.filter(c =>
    overlaps(c.distance, D) && overlaps(c.light, L));
  if (relevant.length === 0) return false;

  for (const d of distanceSamples(D, relevant)) {
    const lightRanges = relevant
      .filter(c => c.distance.min <= d && d <= c.distance.max)
      .map(c => c.light);
    if (!coversRange(lightRanges, L)) return false;
  }
  return true;
}

// One sample (midpoint) per strip between distance boundaries.
function distanceSamples(D, cameras) {
  if (D.min === D.max) return [D.min];

  const bounds = new Set([D.min, D.max]);
  for (const c of cameras) {
    if (c.distance.min > D.min && c.distance.min < D.max) bounds.add(c.distance.min);
    if (c.distance.max > D.min && c.distance.max < D.max) bounds.add(c.distance.max);
  }
  const sorted = [...bounds].sort((a, b) => a - b);

  const samples = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    samples.push(pointBetween(sorted[i], sorted[i + 1]));
  }
  return samples;
}

// A point strictly inside (a, b). Handles infinite bounds (e.g. focus to infinity)
// and avoids the overflow in a + (b - a) / 2 for very large magnitudes.
function pointBetween(a, b) {
  if (a === -Infinity && b === Infinity) return 0;
  if (a === -Infinity) return b - Math.max(1, Math.abs(b));
  if (b === Infinity) return a + Math.max(1, Math.abs(a));
  return a / 2 + b / 2;
}

function coversRange(ranges, target) {
  const useful = ranges
    .filter(r => r.max >= target.min && r.min <= target.max)
    .sort((a, b) => a.min - b.min);

  let reach = target.min;
  for (const r of useful) {
    if (r.min > reach) return false;
    reach = Math.max(reach, r.max);
    if (reach >= target.max) return true;
  }
  return false;
}

function overlaps(a, b) {
  return a.min <= b.max && b.min <= a.max;
}

function validateSpec(spec, name) {
  if (!spec || typeof spec !== 'object') throw new TypeError(`${name} must be an object`);
  validateRange(spec.distance, `${name}.distance`);
  validateRange(spec.light, `${name}.light`);
}

function validateRange(r, name) {
  if (!r || typeof r !== 'object') throw new TypeError(`${name} must be { min, max }`);
  if (typeof r.min !== 'number' || typeof r.max !== 'number' || Number.isNaN(r.min) || Number.isNaN(r.max)) {
    throw new TypeError(`${name}.min and ${name}.max must be numbers`);
  }
  if (r.min > r.max) throw new RangeError(`${name}: min (${r.min}) is greater than max (${r.max})`);
}

module.exports = { isSufficient };

// Tests: node softwareCamera.js
if (require.main === module) {
  const assert = require('assert');

  const spec = (dMin, dMax, lMin, lMax) => ({
    distance: { min: dMin, max: dMax },
    light: { min: lMin, max: lMax },
  });
  const target = spec(0, 10, 0, 10);

  const cases = [
    ['one camera covers exactly', [spec(0, 10, 0, 10)], true],
    ['one camera covers more than needed', [spec(-5, 20, -5, 20)], true],
    ['no cameras', [], false],
    ['cameras outside the target', [spec(20, 30, 20, 30)], false],
    ['four quadrants meeting at boundaries',
      [spec(0, 5, 0, 5), spec(5, 10, 0, 5), spec(0, 5, 5, 10), spec(5, 10, 5, 10)], true],
    ['gap in distance',
      [spec(0, 4.9, 0, 10), spec(5, 10, 0, 10)], false],
    ['gap in light',
      [spec(0, 10, 0, 4.9), spec(0, 10, 5, 10)], false],
    ['one quadrant missing',
      [spec(0, 5, 0, 5), spec(5, 10, 0, 5), spec(0, 5, 5, 10)], false],
    ['hole in the middle',
      [spec(0, 10, 0, 3), spec(0, 10, 7, 10), spec(0, 3, 0, 10), spec(7, 10, 0, 10)], false],
    ['hole in the middle filled',
      [spec(0, 10, 0, 3), spec(0, 10, 7, 10), spec(0, 3, 0, 10), spec(7, 10, 0, 10), spec(2, 8, 2, 8)], true],
    ['overlapping strips, staggered',
      [spec(0, 6, 0, 4), spec(4, 10, 0, 6), spec(0, 5, 3, 10), spec(4, 10, 5, 10)], true],
    ['missing top-right corner point',
      [spec(0, 10, 0, 9.999), spec(0, 9.999, 0, 10)], false],
    ['covered only up to an edge',
      [spec(0, 10, 0, 9)], false],
  ];

  for (const [name, cameras, expected] of cases) {
    assert.strictEqual(isSufficient(target, cameras), expected, name);
  }

  // Point/line targets
  assert.strictEqual(isSufficient(spec(5, 5, 5, 5), [spec(0, 5, 0, 5)]), true, 'point on a corner');
  assert.strictEqual(isSufficient(spec(5, 5, 5, 5), [spec(0, 4, 0, 10)]), false, 'point missed');
  assert.strictEqual(isSufficient(spec(5, 5, 0, 10), [spec(5, 6, 0, 4), spec(4, 5, 4, 10)]), true, 'line at distance 5');
  assert.strictEqual(isSufficient(spec(5, 5, 0, 10), [spec(5, 6, 0, 4), spec(4, 5, 4.5, 10)]), false, 'line with gap');

  // Infinite and very large bounds
  const Inf = Infinity;
  assert.strictEqual(isSufficient(spec(-Inf, Inf, 0, 10), [spec(-Inf, Inf, 0, 10)]), true, 'unbounded distance');
  assert.strictEqual(isSufficient(spec(0, Inf, 0, 10), [spec(0, 5, 0, 10), spec(5, Inf, 0, 10)]), true, 'focus to infinity');
  assert.strictEqual(isSufficient(spec(0, Inf, 0, 10), [spec(0, 5, 0, 10), spec(Inf, Inf, 0, 10)]), false, 'only a point at infinity');
  assert.strictEqual(isSufficient(spec(-Inf, 0, 0, 10), [spec(-Inf, -5, 0, 10)]), false, 'unbounded below with gap');
  assert.strictEqual(isSufficient(spec(-1.7e308, 1.7e308, 0, 1), [spec(-1.7e308, 1.7e308, 0, 1)]), true, 'huge finite range');

  assert.throws(() => isSufficient(spec(10, 0, 0, 10), []), RangeError);
  assert.throws(() => isSufficient(target, [{ distance: { min: 0, max: 1 } }]), TypeError);

  // Fuzz against brute force. Integer coords, so a half-step grid is exact.
  const bruteForce = (t, cams) => {
    for (let d = t.distance.min; d <= t.distance.max; d += 0.5) {
      for (let l = t.light.min; l <= t.light.max; l += 0.5) {
        const hit = cams.some(c =>
          c.distance.min <= d && d <= c.distance.max && c.light.min <= l && l <= c.light.max);
        if (!hit) return false;
      }
    }
    return true;
  };
  const randRange = () => {
    const a = Math.floor(Math.random() * 7), b = Math.floor(Math.random() * 7);
    return [Math.min(a, b), Math.max(a, b)];
  };
  for (let i = 0; i < 5000; i++) {
    const [d0, d1] = randRange(), [l0, l1] = randRange();
    const t = spec(d0, d1, l0, l1);
    const cams = Array.from({ length: Math.floor(Math.random() * 8) }, () => {
      const [a, b] = randRange(), [c, d] = randRange();
      return spec(a, b, c, d);
    });
    assert.strictEqual(isSufficient(t, cams), bruteForce(t, cams),
      `random case ${JSON.stringify({ t, cams })}`);
  }

  console.log('All tests passed.');
}
