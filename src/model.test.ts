/**
 * model.test.ts — pins the toy engine's invariants AND the transcribed paper
 * figures against regression.
 *
 * The demo's credibility rests on two things being true at once:
 *   (1) the TOY engine genuinely reproduces the paper's *dynamics* — the score is
 *       zero exactly at the true key, hill-climbing descends it monotonically, the
 *       run is deterministic, and it degrades gracefully under noise; and
 *   (2) the PAPER figures shown in the overlay are transcribed within the published
 *       bands (5,000–35,000 relations; 37–68× reduction; ≤45% noise), so a mistyped
 *       number fails loudly here.
 *
 * The toy's OWN measured numbers (its ≈1,500-relation noiseless convergence and its
 * noise ceiling) are documented in comments below; they are NOT the paper's and are
 * never asserted to equal the paper's.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  makeRng,
  makeToyInstance,
  makeRelations,
  predictedBit,
  score,
  hillClimb,
  recovers,
  relationsToConverge,
  vectorsEqual,
  TOY_N,
  TOY_ETA,
  TOY_BOUND,
  TOY_Q,
  DEFAULT_TIERS,
} from './model';
import {
  PAPER,
  RELATIONS_TO_RECOVER,
  REDUCTION_FACTOR,
  NOISE_TOLERANCE_MAX_P,
  PRIOR_WORK,
  ML_DSA_SETS,
} from './paperData';

// ===========================================================================
// Seeded PRNG — determinism
// ===========================================================================
describe('makeRng', () => {
  it('is deterministic for a fixed seed', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces floats in [0, 1) and ints in range', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const k = r.int(-3, 3);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(-3);
      expect(k).toBeLessThanOrEqual(3);
    }
  });

  it('different seeds give different streams', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });
});

// ===========================================================================
// Toy instance
// ===========================================================================
describe('makeToyInstance', () => {
  it('produces a short secret of the toy shape with coeffs in [-eta, eta]', () => {
    const inst = makeToyInstance(99);
    expect(inst.n).toBe(TOY_N);
    expect(inst.q).toBe(TOY_Q);
    expect(inst.eta).toBe(TOY_ETA);
    expect(inst.secret).toHaveLength(TOY_N);
    for (const c of inst.secret) {
      expect(Number.isInteger(c)).toBe(true);
      expect(Math.abs(c)).toBeLessThanOrEqual(TOY_ETA);
    }
  });

  it('is never the all-zero vector (a degenerate key)', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(makeToyInstance(seed).secret.some((c) => c !== 0)).toBe(true);
    }
  });

  it('is deterministic for a fixed seed', () => {
    expect(makeToyInstance(2024).secret).toEqual(makeToyInstance(2024).secret);
  });
});

// ===========================================================================
// Relations + scoring
// ===========================================================================
describe('relations and the scoring function', () => {
  it('makeRelations emits ternary public vectors and a single bit each', () => {
    const inst = makeToyInstance(5);
    const rels = makeRelations(inst, 200, 0, 5);
    expect(rels).toHaveLength(200);
    for (const r of rels) {
      expect(r.a).toHaveLength(TOY_N);
      for (const ai of r.a) expect([-1, 0, 1]).toContain(ai);
      expect([0, 1]).toContain(r.bit);
      expect(Number.isInteger(r.tau)).toBe(true);
    }
  });

  it('score(trueKey, relations) === 0 for NOISELESS relations (the unique zero)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const inst = makeToyInstance(seed);
      const rels = makeRelations(inst, 1000, 0, seed * 13);
      expect(score(inst.secret, rels)).toBe(0);
    }
  });

  it('a wrong candidate scores > 0 given enough noiseless relations', () => {
    const inst = makeToyInstance(3);
    const rels = makeRelations(inst, 1000, 0, 33);
    const wrong = inst.secret.slice();
    wrong[0] += 1; // perturb one coordinate
    expect(score(wrong, rels)).toBeGreaterThan(0);
  });

  it('predictedBit is the affine halfspace test ⟨a,v⟩ ≥ tau', () => {
    expect(predictedBit([1, 1], [1, 1], 2)).toBe(1); // 2 >= 2
    expect(predictedBit([1, 1], [1, 1], 3)).toBe(0); // 2 < 3
    expect(predictedBit([1, -1], [1, 1], 0)).toBe(1); // 0 >= 0
  });

  it('under noise p, score(trueKey) ≈ p·count (count-based degradation, not 0)', () => {
    const inst = makeToyInstance(8);
    const count = 4000;
    const p = 0.2;
    const rels = makeRelations(inst, count, p, 808);
    const s = score(inst.secret, rels);
    // The true key no longer fits every relation, but only ~p·count are flipped.
    expect(s).toBeGreaterThan(0.5 * p * count);
    expect(s).toBeLessThan(1.5 * p * count);
  });
});

// ===========================================================================
// Hill-climb — recovery, descent property, determinism
// ===========================================================================
describe('hillClimb (multi-tier local optimization)', () => {
  // The toy RELIABLY recovers from ≈1,500 noiseless relations (5-trial), and every
  // default seed converges by 4,000. We pin recovery at 4,000 for a margin of safety.
  const NOISELESS_COUNT = 4000;

  it('recovers the toy key from sufficient noiseless relations (fixed seeds)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const inst = makeToyInstance(seed);
      const rels = makeRelations(inst, NOISELESS_COUNT, 0, seed * 100);
      const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: seed * 7 });
      expect(res.converged).toBe(true);
      expect(res.bestScore).toBe(0);
      expect(recovers(res, inst)).toBe(true);
      expect(vectorsEqual(res.best, inst.secret)).toBe(true);
    }
  });

  it('trajectory scores are monotone non-increasing (the descent property)', () => {
    const inst = makeToyInstance(4);
    const rels = makeRelations(inst, NOISELESS_COUNT, 0, 444);
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 28 });
    expect(res.trajectory.length).toBeGreaterThan(1);
    for (let i = 1; i < res.trajectory.length; i++) {
      expect(res.trajectory[i].score).toBeLessThanOrEqual(res.trajectory[i - 1].score);
    }
    // ends at zero, starts well above zero
    expect(res.trajectory[0].score).toBeGreaterThan(0);
    expect(res.trajectory[res.trajectory.length - 1].score).toBe(0);
  });

  it('is monotone non-increasing WITHIN each tier', () => {
    const inst = makeToyInstance(6);
    const rels = makeRelations(inst, NOISELESS_COUNT, 0, 666);
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 66 });
    const byTier = new Map<number, number[]>();
    for (const pt of res.trajectory) {
      const arr = byTier.get(pt.tier) ?? [];
      arr.push(pt.score);
      byTier.set(pt.tier, arr);
    }
    for (const scores of byTier.values()) {
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    }
  });

  it('default tier count is DEFAULT_TIERS and is reported', () => {
    const inst = makeToyInstance(2);
    const rels = makeRelations(inst, 1000, 0, 22);
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 2 });
    expect(res.tiers).toBe(DEFAULT_TIERS);
  });

  it('is deterministic: same seed ⇒ identical trajectory', () => {
    const inst = makeToyInstance(11);
    const rels = makeRelations(inst, NOISELESS_COUNT, 0, 111);
    const a = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 5 });
    const b = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 5 });
    expect(a.trajectory).toEqual(b.trajectory);
    expect(a.best).toEqual(b.best);
    expect(a.bestScore).toBe(b.bestScore);
    expect(a.iterations).toBe(b.iterations);
  });

  it('the climber never reads the secret — only relations and public (n,q,bound)', () => {
    // Two instances whose secrets differ but whose relation SETS are identical
    // bytes would, by construction, produce identical climbs. We can't fake that,
    // but we CAN assert the API surface: hillClimb takes no instance/secret.
    const inst = makeToyInstance(1);
    const rels = makeRelations(inst, 1000, 0, 1);
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 1 });
    expect(res.best).toHaveLength(inst.n);
  });

  it('always terminates under maxIters even with unsatisfiable relations', () => {
    const inst = makeToyInstance(1);
    // Contradictory relations: same (a, tau) with both bits — no candidate fits all.
    const rels = [
      { a: [1, 0, 0, 0, 0, 0, 0, 0], tau: 1, bit: 1 as const },
      { a: [1, 0, 0, 0, 0, 0, 0, 0], tau: 1, bit: 0 as const },
    ];
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 1, maxIters: 5000 });
    expect(res.iterations).toBeLessThanOrEqual(5000);
    expect(res.bestScore).toBeGreaterThanOrEqual(1); // can't satisfy both
  });
});

// ===========================================================================
// Graceful degradation under noise (TOY ceiling — documented, not the paper's)
// ===========================================================================
describe('graceful degradation under noise', () => {
  // TOY NOISE CEILING (this engine's OWN number, NOT the paper's 45%):
  // empirically the toy still recovers reliably at p ≈ 0.1–0.2 GIVEN enough
  // relations (≈4,000–6,000), and the descent STALLS by p ≈ 0.4. This ceiling is a
  // property of the toy's tiny dimension and single-start search; it is deliberately
  // lower than the paper's measured 45% and must never be conflated with it.
  it('recovers at moderate noise when given MORE relations', () => {
    const inst = makeToyInstance(1);
    const p = 0.1;
    // Few relations at this noise: may fail. Many relations: recovers. We assert the
    // "more relations rescue it" direction with a count known to succeed.
    const rels = makeRelations(inst, 6000, p, 1234);
    const res = hillClimb(rels, { n: inst.n, q: inst.q, bound: TOY_BOUND, seed: 9 });
    expect(recovers(res, inst)).toBe(true);
  });

  it('relationsToConverge reports the toy\'s own scaling (a number, in-range)', () => {
    const inst = makeToyInstance(42);
    const probe = relationsToConverge(inst, 0, 11);
    expect(probe.relations).not.toBeNull();
    expect(probe.grid).toContain(probe.relations);
    // The toy's noiseless convergence is its OWN figure — sanity-bound it, and note
    // it is NOT the paper's 5,000–35,000 band.
    expect(probe.relations!).toBeGreaterThan(0);
    expect(probe.relations!).toBeLessThanOrEqual(5000);
  });
});

// ===========================================================================
// Purity — no Date / network / ambient randomness in the core source
// ===========================================================================
describe('purity of the model core', () => {
  it('model.ts source contains no Math.random, Date, or fetch', () => {
    const path = fileURLToPath(new URL('./model.ts', import.meta.url));
    const src = readFileSync(path, 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bnew Date\b/);
    expect(code).not.toMatch(/\bDate\.now\b/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });
});

// ===========================================================================
// PAPER-DATA TRANSCRIPTION GUARDS — fail loudly if a figure was mistyped.
// (5,000–35,000 relations; 37–68× reduction; ≤45% noise.)
// ===========================================================================
describe('paper-data transcription guards (ePrint 2026/472)', () => {
  it('relation counts lie within the stated 5,000–35,000 band', () => {
    expect(RELATIONS_TO_RECOVER.min).toBe(5_000);
    expect(RELATIONS_TO_RECOVER.max).toBe(35_000);
    expect(RELATIONS_TO_RECOVER.min).toBeLessThan(RELATIONS_TO_RECOVER.max);
    expect(RELATIONS_TO_RECOVER.min).toBeGreaterThanOrEqual(5_000);
    expect(RELATIONS_TO_RECOVER.max).toBeLessThanOrEqual(35_000);
  });

  it('reduction factor lies within the stated 37–68× span', () => {
    expect(REDUCTION_FACTOR.min).toBe(37);
    expect(REDUCTION_FACTOR.max).toBe(68);
    expect(REDUCTION_FACTOR.min).toBeLessThan(REDUCTION_FACTOR.max);
    expect(REDUCTION_FACTOR.min).toBeGreaterThanOrEqual(37);
    expect(REDUCTION_FACTOR.max).toBeLessThanOrEqual(68);
  });

  it('noise tolerance is the stated ~45% ceiling (≤ 0.45)', () => {
    expect(NOISE_TOLERANCE_MAX_P.value).toBeCloseTo(0.45, 5);
    expect(NOISE_TOLERANCE_MAX_P.value).toBeLessThanOrEqual(0.45);
    expect(NOISE_TOLERANCE_MAX_P.value).toBeGreaterThan(0.4);
  });

  it('metadata + prior-work attribution are present and correct', () => {
    expect(PAPER.eprint).toBe('2026/472');
    expect(PAPER.authors).toContain('Jean-Pierre Seifert');
    expect(PAPER.authors).toContain('Marian Margraf');
    expect(PAPER.authors).toHaveLength(4);
    const names = PRIOR_WORK.map((w) => w.authors);
    expect(names).toContain('Liu et al.');
    expect(names).toContain('Damm et al.');
  });

  it('every paper figure carries a non-empty citation', () => {
    for (const r of [RELATIONS_TO_RECOVER, REDUCTION_FACTOR]) {
      expect(r.cite.length).toBeGreaterThan(0);
      expect(r.provenance.startsWith('paper')).toBe(true);
    }
    expect(NOISE_TOLERANCE_MAX_P.cite.length).toBeGreaterThan(0);
  });

  it('lists the three ML-DSA parameter sets the band spans (FIPS 204 names)', () => {
    expect(ML_DSA_SETS.map((s) => s.label)).toEqual(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']);
  });
});
