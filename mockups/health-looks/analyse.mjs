// The H1, H2 and H5 checks over measured records. Pure: records in, verdicts and numbers out.
// A record: { cond, vision, look, band, seed, L, warm, glow, ...the look vector keys }.
import { LOOK_KEYS, lookVector, dist, mean, centroid } from './metrics.mjs';

// H1: the three scale statistics and the direction each should step from lava to healthy
// (art direction §6 rule 1: worse is hotter and darker, so lightness rises and warmth and glow fall).
export const SCALE = [
  { key: 'L', label: 'lightness', dir: +1 },
  { key: 'warm', label: 'warmth', dir: -1 },
  { key: 'glow', label: 'glow', dir: -1 },
];
export const REVERSAL_TOL = 0.02; // a band-mean step against the expected way smaller than this (one OKLab JND; 2 points of glow share) is flat, not reversed: a person can't see it
// "At a glance": a difference a person sees between two separate small discs without comparing them
// side by side. OKLab's just-noticeable difference is about 0.02 for touching patches; GLANCE is 2.5x
// that, a lenient floor (it favours the design). Raw distances are reported, so a stricter floor can be applied.
export const GLANCE = 0.05;

export const summary = (xs) => ({ mean: mean(xs), min: Math.min(...xs), max: Math.max(...xs) });

/**
 * H1 for one condition and vision. bands: worst -> best. For every neighbouring pair (worse A,
 * better B) and statistic: step = the band-mean change in the expected direction (negative =
 * reversed), gap = the space between the two bands' seed ranges in that direction (negative = they
 * overlap by that much). Two readings:
 *   strict:  every statistic separates every neighbouring pair (gap > 0 throughout);
 *   ordered: no statistic reverses (step >= -REVERSAL_TOL; a tie where neither band has any glow is
 *            flat), and every neighbouring pair is separated by at least one statistic: their seed
 *            ranges don't overlap (gap > 0) and the band means differ by at least GLANCE.
 */
export function checkH1(records, bands) {
  const by = Object.fromEntries(bands.map((b) => [b, records.filter((r) => r.band === b)]));
  const stats = Object.fromEntries(bands.map((b) => [b, Object.fromEntries(SCALE.map(({ key }) => [key, summary(by[b].map((r) => r[key]))]))]));
  const pairs = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const [A, B] = [bands[i], bands[i + 1]];
    const per = SCALE.map(({ key, dir }) => {
      const a = stats[A][key], b = stats[B][key];
      const step = dir * (b.mean - a.mean);
      const gap = dir > 0 ? b.min - a.max : a.min - b.max;
      const none = a.max === 0 && b.max === 0; // neither band has any of it (glow on ash and healthy)
      return { key, step, gap, none, reversed: !none && step < -REVERSAL_TOL, separates: !none && gap > 0 && step >= GLANCE };
    });
    const separated = per.some((p) => p.separates), reversed = per.filter((p) => p.reversed).map((p) => p.key);
    pairs.push({ pair: [A, B], per, separated, reversed, ok: separated && !reversed.length });
  }
  const strict = pairs.every((p) => p.per.every((q) => q.gap > 0));
  const ordered = pairs.every((p) => p.ok);
  return { stats, pairs, strict, ordered, pass: ordered };
}

// ---------------------------------------------------------------- wording (one place for every report)
const statLabel = (key) => SCALE.find((s) => s.key === key).label;
/** What's wrong with each failing H1 step, e.g. "toxic→ash: warmth reversed". */
export const h1Problems = (h1) => h1.pairs.filter((p) => !p.ok).map((p) => `${p.pair.join('→')}: ${[p.reversed.length && `${p.reversed.map(statLabel).join(', ')} reversed`, !p.separated && 'not separated'].filter(Boolean).join(', ')}`);
export const describeH1 = (h1) => (h1.pass ? 'pass' : `FAIL (${h1Problems(h1).join('; ')})`);
export const describeH2 = (h2, fmt) => `${h2.pass ? 'pass' : 'FAIL'} (nearest healthy→ash ${fmt(h2.minAsh)}, margin ${fmt(h2.margin, true)}${h2.looks.filter((l) => l.nearerAsh).map((l) => `, ${l.look} nearer ash`).join('')})`;
/** Seeds grouped by look and the look they're confused with, e.g. "toxic→ocean: seeds 1, 3". */
export function groupSeeds(seeds, to) {
  const m = new Map();
  for (const o of seeds) { const k = `${o.look}→${o[to]}`; m.set(k, [...(m.get(k) ?? []), o.seed]); }
  return [...m].map(([k, s]) => `${k}: seeds ${s.join(', ')}`).join('; ');
}
export const describeH5 = (h5) => `${h5.pass ? 'pass' : 'FAIL'}: ${h5.misread.length} misread${h5.misread.length ? ` (${groupSeeds(h5.misread, 'nearest')})` : ''}, ${h5.confusable.length} within a glance${h5.confusable.length ? ` (${groupSeeds(h5.confusable, 'otherLook')})` : ''}`;
/** A seed's H5 flag for the sheets: null when it reads as its own band and nothing else is near. */
export const seedFlag = (s) => (s.read !== s.band ? { kind: 'misread', look: s.nearest } : s.confusable ? { kind: 'near', look: s.otherLook, d: s.dOther } : null);

/** Each look's centroid over its seeds in the look vector. */
function lookCentroids(records, looks) {
  return Object.fromEntries(looks.map((l) => [l, centroid(records.filter((r) => r.look === l).map(lookVector))]));
}

/**
 * H2 for one condition and vision: the healthy looks' centroids are closer to each other than any
 * of them is to the ash band's (the desert look's) centroid. Distances are Euclidean in the look
 * vector, and the nearest one is at least GLANCE from ash (so the grouping is visible at all). Also:
 * each healthy look's nearest sibling and its distance to ash, so "ice reads as stale" shows as ice
 * sitting nearer ash than any sibling.
 */
export function checkH2(records, { healthy, ash }) {
  const c = lookCentroids(records, [...healthy, ash]);
  const sib = [];
  for (let i = 0; i < healthy.length; i++) for (let j = i + 1; j < healthy.length; j++) sib.push({ pair: [healthy[i], healthy[j]], d: dist(c[healthy[i]], c[healthy[j]]) });
  const toAsh = Object.fromEntries(healthy.map((l) => [l, dist(c[l], c[ash])]));
  const looks = healthy.map((l) => {
    const near = sib.filter((s) => s.pair.includes(l)).sort((p, q) => p.d - q.d)[0];
    return { look: l, sibling: near.pair.find((x) => x !== l), dSibling: near.d, dAsh: toAsh[l], nearerAsh: toAsh[l] <= near.d };
  });
  const maxSib = Math.max(...sib.map((s) => s.d)), minAsh = Math.min(...Object.values(toAsh));
  const spread = Object.fromEntries(healthy.concat(ash).map((l) => [l, mean(records.filter((r) => r.look === l).map((r) => dist(lookVector(r), c[l])))]));
  return { siblings: sib, toAsh, looks, maxSib, minAsh, margin: minAsh - maxSib, spread, pass: maxSib < minAsh && minAsh >= GLANCE };
}

/**
 * H5 for one condition and vision: every seed, measured, lands in its own band. A seed is assigned
 * the band of its nearest look centroid, with its own look's centroid computed without it
 * (leave-one-out). margin: the distance to the nearest other band's look minus the distance to the
 * nearest look of its own band (negative = misread). A seed also fails when another band's look is
 * within GLANCE of it (confusable at a glance, even if nearer its own band).
 */
export function checkH5(records, looks, bandOf) {
  const vecs = records.map(lookVector);
  const sums = Object.fromEntries(looks.map((l) => [l, { s: LOOK_KEYS.map(() => 0), n: 0 }]));
  records.forEach((r, i) => { const t = sums[r.look]; vecs[i].forEach((x, k) => (t.s[k] += x)); t.n++; });
  const out = records.map((r, i) => {
    const d = looks.map((l) => {
      const t = sums[l];
      const own = l === r.look;
      const c = t.s.map((x, k) => (x - (own ? vecs[i][k] : 0)) / (t.n - (own ? 1 : 0)));
      return { look: l, d: dist(vecs[i], c) };
    }).sort((p, q) => p.d - q.d);
    const ownBest = d.find((x) => bandOf(x.look) === r.band).d;
    const other = d.find((x) => bandOf(x.look) !== r.band);
    return { look: r.look, seed: r.seed, nearest: d[0].look, band: r.band, read: bandOf(d[0].look), margin: other.d - ownBest, otherLook: other.look, dOther: other.d, confusable: other.d < GLANCE };
  });
  const misread = out.filter((o) => o.read !== o.band);
  const confusable = out.filter((o) => o.read === o.band && o.confusable);
  const worst = [...out].sort((p, q) => p.margin - q.margin)[0];
  const closest = [...out].sort((p, q) => p.dOther - q.dOther)[0];
  return { seeds: out, misread, confusable, worst, closest, pass: !misread.length && !confusable.length };
}
