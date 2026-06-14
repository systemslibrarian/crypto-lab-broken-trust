/**
 * model.ts — pure, deterministic toy core for crypto-lab-broken-trust.
 *
 * WHAT THIS IS. An ILLUSTRATIVE, TOY-SCALE reconstruction of the recovery
 * algorithm in:
 *
 *   Carsten Schubert, Niklas Julius Müller, Jean-Pierre Seifert, Marian Margraf,
 *   "Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage
 *    and Local Optimization", IACR ePrint 2026/472.
 *
 * WHAT THIS IS NOT. It is NOT an attack on real ML-DSA. There is no real key,
 * no real side channel, no real signature, no lattice reduction. The "secret"
 * recovered here is a tiny vector THIS MODULE generated, used only to make the
 * algorithm's *dynamics* visible. The paper's real-scale numbers live in
 * `paperData.ts` and are never produced by this engine — see PAPER-NOTES.md.
 *
 * THE IDEA IT TEACHES (faithful in shape, not scale).
 *   ML-DSA releases signatures that are statistically independent of the secret
 *   key — rejection sampling is the defense. That defense collapses once an
 *   attacker learns even ONE bit of the per-signature masking randomness: each
 *   leaked bit, paired with public signature data, becomes an *informative
 *   relation* constraining a secret subkey. The paper's contribution is a
 *   verification routine that SCORES a candidate subkey using only those
 *   relations (no other secret component, no lattice reduction), reaching ZERO
 *   exactly at the true key, plus a multi-tier hill-climbing optimizer that
 *   descends that score to the key — and which still works under heavy noise.
 *
 * HOW THE TOY MIRRORS THAT.
 *   - A secret subkey is a short integer vector `s` (toy dimension n, small
 *     coefficients), exactly the *shape* of an ML-DSA s1/s2 block but tiny.
 *   - An informative relation is `(a, bit)`: a public vector `a` over Z_q and a
 *     single leaked bit. The honest bit is the "high bit" of the secret-dependent
 *     inner product `⟨a, s⟩ mod q` — i.e. whether it lands in the upper half
 *     [q/2, q). That is one halfspace constraint on `s`, the toy analogue of
 *     "one leaked bit of masking randomness gives one relation on the subkey."
 *   - `score(candidate, relations)` counts relations whose predicted bit differs
 *     from the observed bit. With noiseless relations it is ZERO exactly at the
 *     true key and grows with distance from it — a hill you can roll down. Under
 *     noise it is the count-based variant the paper uses in its noisy setting.
 *   - `hillClimb` is multi-tier local search: coarse coordinate steps first, then
 *     progressively finer ones, greedily accepting any move that lowers the score.
 *     It NEVER reads the secret — only the public relations and (n, q, bound).
 *
 * HARD RULES (mirrored by tests): deterministic under an explicit seed; no Date,
 * no network, no ambient Math.random. Randomness is ONLY the seeded PRNG below.
 */

// ---------------------------------------------------------------------------
// Toy parameters. SMALL ON PURPOSE so the descent converges in milliseconds and
// is watchable. These are the TOY's own numbers — they are NOT the paper's and
// must never be presented as the paper's (see paperData.ts for the real scale).
// ---------------------------------------------------------------------------

/** Toy subkey dimension (ML-DSA s1/s2 blocks are 256-wide; this is a miniature). */
export const TOY_N = 8;
/** Toy coefficient modulus, recorded for flavor. ML-DSA uses q = 8 380 417; this
 *  is a miniature. The toy LEAK is a threshold comparison (below), not mod-q
 *  arithmetic, so q does not enter the scoring — it only frames the coefficient ring. */
export const TOY_Q = 257;
/** Toy secret coefficient bound: coeffs are uniform in [-ETA, ETA] (ML-DSA uses η∈{2,4}). */
export const TOY_ETA = 2;
/** Search-box bound for candidate coefficients: the climber explores [-BOUND, BOUND]^n. */
export const TOY_BOUND = 3;
/** Default number of refinement tiers (coarse → fine). */
export const DEFAULT_TIERS = 3;

// ---------------------------------------------------------------------------
// Seeded PRNG — the ONLY source of randomness. Deterministic, pure, no Date.
// mulberry32: tiny, well-distributed 32-bit generator.
// ---------------------------------------------------------------------------

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
}

export function makeRng(seed: number): Rng {
  // Force to an unsigned 32-bit integer state.
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(lo: number, hi: number): number {
      if (hi < lo) throw new Error(`int(${lo}, ${hi}): hi < lo`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function requireInt(name: string, x: number): void {
  if (!Number.isInteger(x)) throw new Error(`${name} must be an integer (got ${x})`);
}

/** Inner product ⟨a, v⟩ as a plain integer (no reduction). */
function dot(a: number[], v: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * v[i];
  return s;
}

export function vectorsEqual(x: number[], y: number[]): boolean {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// A. Toy instance — the secret subkey THIS DEMO generates (not a real key).
// ---------------------------------------------------------------------------

export interface ToyInstance {
  /** Toy dimension. */
  n: number;
  /** Toy modulus. */
  q: number;
  /** Secret coefficient bound (|s_i| <= eta). */
  eta: number;
  /** The true toy subkey, length n, coeffs in [-eta, eta]. Generated here. */
  secret: number[];
  /** The seed it was generated from (for reproducibility / deep links). */
  seed: number;
}

/**
 * Generate a toy ML-DSA-shaped secret subkey from a seed: a short integer vector
 * of dimension TOY_N with coefficients uniform in [-TOY_ETA, TOY_ETA]. Rejects
 * the all-zero vector (a degenerate "key" that every relation trivially fits).
 * This is the secret the demo will recover — it is NOT a real ML-DSA key.
 */
export function makeToyInstance(seed: number): ToyInstance {
  requireInt('seed', seed);
  const rng = makeRng(seed);
  let secret: number[] = [];
  // Re-draw on the (vanishingly rare) all-zero vector so there is a real target.
  for (let attempt = 0; attempt < 16; attempt++) {
    secret = Array.from({ length: TOY_N }, () => rng.int(-TOY_ETA, TOY_ETA));
    if (secret.some((c) => c !== 0)) break;
  }
  return { n: TOY_N, q: TOY_Q, eta: TOY_ETA, secret, seed };
}

// ---------------------------------------------------------------------------
// B. Informative relations — one leaked bit each.
//
// Each relation pairs a public, challenge-shaped ternary vector `a ∈ {−1,0,+1}^n`
// (ML-DSA challenges are sparse ternary) with a public integer threshold `tau`.
// The single leaked bit answers ONE yes/no question about the secret:
//
//        bit = 1  ⟺  ⟨a, s⟩ ≥ tau          (which side of a known boundary the
//        bit = 0  ⟺  ⟨a, s⟩ <  tau           secret-dependent value falls on)
//
// That is the toy analogue of "one leaked bit of masking randomness, paired with
// public signature/challenge data, yields one informative relation on the subkey."
// Because `a` is ternary (small), nudging one candidate coordinate by ±1 changes
// ⟨a, candidate⟩ by at most 1 — so the violation count is a SMOOTH function of the
// candidate. That smoothness is exactly what makes the score a hill you can roll
// down; the true key sits at the bottom. (A leak with large random coefficients
// would instead give a noise-like, undescendable landscape.)
// ---------------------------------------------------------------------------

export interface Relation {
  /** Public ternary vector a ∈ {−1,0,+1}^n (challenge-shaped, public). */
  a: number[];
  /** Public integer threshold the secret-dependent value is compared against. */
  tau: number;
  /** The leaked bit: 1 iff ⟨a, s⟩ ≥ tau, possibly flipped by noise. */
  bit: 0 | 1;
}

/**
 * The honest leaked bit for a vector `v` against public `(a, tau)`: 1 iff
 * ⟨a, v⟩ ≥ tau. One affine halfspace constraint — the toy's "one leaked bit."
 */
export function predictedBit(v: number[], a: number[], tau: number): 0 | 1 {
  return dot(a, v) >= tau ? 1 : 0;
}

/** Threshold half-range: thresholds are drawn uniformly from [-TAU_RANGE, TAU_RANGE],
 *  which covers the full span of ⟨a, c⟩ over the candidate box for ternary a. */
const TAU_RANGE = TOY_N * TOY_BOUND;

/**
 * Produce `count` informative relations for `instance`. Each relation draws a
 * fresh public ternary vector `a ∈ {−1,0,+1}^n` and a public threshold `tau`,
 * computes the honest leaked bit from the TRUE secret, then flips that bit
 * independently with probability `noiseP` (the paper's noisy-leakage model: the
 * leaked bit is flipped i.i.d. with error probability p). Deterministic for a
 * fixed seed.
 */
export function makeRelations(
  instance: ToyInstance,
  count: number,
  noiseP: number,
  seed: number,
): Relation[] {
  requireInt('count', count);
  requireInt('seed', seed);
  if (count < 0) throw new Error(`count must be >= 0 (got ${count})`);
  if (!(noiseP >= 0 && noiseP <= 1)) throw new Error(`noiseP must be in [0, 1] (got ${noiseP})`);
  const { n, secret } = instance;
  const rng = makeRng(seed);
  const relations: Relation[] = [];
  for (let i = 0; i < count; i++) {
    const a = Array.from({ length: n }, () => rng.int(-1, 1));
    const tau = rng.int(-TAU_RANGE, TAU_RANGE);
    let bit = predictedBit(secret, a, tau);
    if (rng.next() < noiseP) bit = (bit ^ 1) as 0 | 1;
    relations.push({ a, tau, bit });
  }
  return relations;
}

// ---------------------------------------------------------------------------
// C. The scoring function (verification routine).
// ---------------------------------------------------------------------------

/**
 * Score a candidate subkey using ONLY the relations: the number of relations whose
 * predicted high bit disagrees with the observed bit. This is the count-based
 * variant the paper uses in the noisy setting (and it degrades gracefully).
 *
 * Key property (noiseless relations): score(trueSecret) === 0 exactly, and the
 * score grows with distance from the true key — the hill the optimizer descends.
 */
export function score(candidate: number[], relations: Relation[]): number {
  let violations = 0;
  for (const r of relations) {
    if (predictedBit(candidate, r.a, r.tau) !== r.bit) violations++;
  }
  return violations;
}

// ---------------------------------------------------------------------------
// D. Multi-tier hill-climbing optimizer.
// ---------------------------------------------------------------------------

export interface HillClimbConfig {
  /** Candidate dimension (public; equals instance.n). */
  n: number;
  /** Modulus (public; equals instance.q). */
  q: number;
  /** Candidate coefficient bound: search box is [-bound, bound]^n. */
  bound: number;
  /** Number of refinement tiers (coarse → fine). Default DEFAULT_TIERS. */
  tiers?: number;
  /** Seed for the initial guess (deterministic). Used only when `start` is absent. */
  seed: number;
  /** Hard cap on candidate evaluations, so it always terminates. */
  maxIters?: number;
  /**
   * Optional explicit initial candidate (length n). When provided, the climber
   * starts here instead of the seeded random guess — used by the UI's
   * "click to set the start point" on the score landscape. Entries are rounded
   * and clamped to [-bound, bound]. Determinism is preserved (same start ⇒ same run).
   */
  start?: number[];
}

/** One recorded point on the descent (only improving moves + tier starts). */
export interface TrajectoryPoint {
  /** Monotone step index (0 = initial guess). */
  step: number;
  /** Which refinement tier produced this point. */
  tier: number;
  /** Score (violations) of the best candidate at this point — non-increasing. */
  score: number;
  /** A copy of the candidate vector at this point (so the UI can render it). */
  candidate: number[];
}

export interface HillClimbResult {
  /** The full descent: an array of improving steps, monotone non-increasing in score. */
  trajectory: TrajectoryPoint[];
  /** The best candidate found. */
  best: number[];
  /** Its score (0 ⇒ fits every relation; with noise this can be > 0). */
  bestScore: number;
  /** True iff bestScore reached 0 (perfect fit to the relations). */
  converged: boolean;
  /** Number of tiers actually run. */
  tiers: number;
  /** Total candidate evaluations performed. */
  iterations: number;
}

/**
 * Coordinate step sizes for a given tier: coarse first (big jumps to cross the
 * landscape), then progressively finer down to ±1. Tier t uses steps of size
 * 2^(lastTier - t) down to 1, each in both directions.
 */
function stepSet(tier: number, tiers: number): number[] {
  const coarsest = Math.max(0, tiers - 1 - tier); // tier 0 -> largest exponent
  const steps: number[] = [];
  for (let mag = 1 << coarsest; mag >= 1; mag >>= 1) {
    steps.push(mag, -mag);
  }
  return steps;
}

function clamp(x: number, bound: number): number {
  return x < -bound ? -bound : x > bound ? bound : x;
}

/**
 * Multi-tier local search from a seeded initial guess. At each tier it sweeps
 * every coordinate, trying each step in this tier's step set, and greedily accepts
 * any single-coordinate change that LOWERS the score, until a full sweep makes no
 * improvement (a local optimum for that tier). Then it refines with the next,
 * finer tier. Records the trajectory of improving moves for animation.
 *
 * Reads ONLY the relations and the public (n, q, bound) — never the secret.
 * Deterministic for a fixed seed; always terminates (bounded by maxIters and by
 * the strictly-decreasing, lower-bounded score).
 */
export function hillClimb(relations: Relation[], cfg: HillClimbConfig): HillClimbResult {
  const { n, q, bound, seed } = cfg;
  const tiers = cfg.tiers ?? DEFAULT_TIERS;
  const maxIters = cfg.maxIters ?? 200_000;
  requireInt('n', n);
  requireInt('q', q);
  requireInt('bound', bound);
  requireInt('tiers', tiers);
  if (n < 1) throw new Error(`n must be >= 1 (got ${n})`);
  if (bound < 1) throw new Error(`bound must be >= 1 (got ${bound})`);
  if (tiers < 1) throw new Error(`tiers must be >= 1 (got ${tiers})`);

  let candidate: number[];
  if (cfg.start !== undefined) {
    if (cfg.start.length !== n) {
      throw new Error(`start must have length n=${n} (got ${cfg.start.length})`);
    }
    candidate = cfg.start.map((v) => clamp(Math.round(v), bound));
  } else {
    const rng = makeRng(seed);
    candidate = Array.from({ length: n }, () => rng.int(-bound, bound));
  }
  let bestScore = score(candidate, relations);
  let iterations = 0;
  let step = 0;
  const trajectory: TrajectoryPoint[] = [
    { step: 0, tier: 0, score: bestScore, candidate: candidate.slice() },
  ];

  outer: for (let tier = 0; tier < tiers; tier++) {
    const steps = stepSet(tier, tiers);
    let improvedThisTier = true;
    while (improvedThisTier) {
      improvedThisTier = false;
      for (let i = 0; i < n; i++) {
        const original = candidate[i];
        for (const d of steps) {
          if (iterations >= maxIters) break outer;
          const moved = clamp(original + d, bound);
          if (moved === candidate[i]) continue;
          const prev = candidate[i];
          candidate[i] = moved;
          iterations++;
          const s = score(candidate, relations);
          if (s < bestScore) {
            bestScore = s;
            improvedThisTier = true;
            step++;
            trajectory.push({ step, tier, score: s, candidate: candidate.slice() });
            if (bestScore === 0) break outer; // perfect fit — nothing better exists
          } else {
            candidate[i] = prev; // revert non-improving move
          }
        }
      }
    }
  }

  return {
    trajectory,
    best: candidate.slice(),
    bestScore,
    converged: bestScore === 0,
    tiers,
    iterations,
  };
}

// ---------------------------------------------------------------------------
// E. Toy scaling probe — smallest relation count at which the toy reliably
//    recovers, for the toy-vs-paper discussion. (The toy's OWN number, not the
//    paper's 5k–35k.)
// ---------------------------------------------------------------------------

/** True iff a hill-climb run recovered the exact toy secret. */
export function recovers(result: HillClimbResult, instance: ToyInstance): boolean {
  return vectorsEqual(result.best, instance.secret);
}

export interface ConvergenceProbe {
  /** Smallest relation count at which every trial recovered, or null if none did. */
  relations: number | null;
  /** The grid of counts that was tried (ascending). */
  grid: number[];
  /** Number of independent trials required to agree at each count. */
  trials: number;
}

/**
 * Find the smallest relation count (over an ascending grid) at which the toy
 * RELIABLY recovers `instance` under `noiseP` — i.e. all `trials` independent
 * seeds recover. Deterministic. Returns null if no grid point reaches reliability.
 * This reports the TOY's own scaling, which is NOT the paper's relation counts.
 */
export function relationsToConverge(
  instance: ToyInstance,
  noiseP: number,
  seed: number,
  opts: { grid?: number[]; trials?: number; tiers?: number } = {},
): ConvergenceProbe {
  const grid = opts.grid ?? [500, 1000, 1500, 2000, 3000, 4000, 5000];
  const trials = opts.trials ?? 5;
  const tiers = opts.tiers ?? DEFAULT_TIERS;
  const rng = makeRng(seed);
  for (const count of grid) {
    let allRecovered = true;
    for (let t = 0; t < trials; t++) {
      const relSeed = rng.int(1, 2_000_000_000);
      const climbSeed = rng.int(1, 2_000_000_000);
      const relations = makeRelations(instance, count, noiseP, relSeed);
      const res = hillClimb(relations, {
        n: instance.n,
        q: instance.q,
        bound: TOY_BOUND,
        tiers,
        seed: climbSeed,
      });
      if (!recovers(res, instance)) {
        allRecovered = false;
        break;
      }
    }
    if (allRecovered) return { relations: count, grid, trials };
  }
  return { relations: null, grid, trials };
}

// ---------------------------------------------------------------------------
// F. Repeated-trial statistics — bridges the single deterministic toy run to the
//    paper's statistical "10/10 keys recovered" methodology. Each trial draws a
//    fresh toy instance (a different secret) and a fresh relation set + start, so
//    the success rate reflects the toy's behaviour across keys, not one lucky run.
//    Pure and deterministic for a fixed seed.
// ---------------------------------------------------------------------------

export interface TrialsResult {
  /** Number of independent trials run. */
  trials: number;
  /** How many recovered the exact toy subkey. */
  successes: number;
  /** successes / trials, in [0, 1]. */
  successRate: number;
  /** Relation count and noise the trials were run at (echoed back). */
  relations: number;
  noiseP: number;
  /** Accepted-move counts (trajectory length − 1) for the RECOVERED trials only,
   *  i.e. the "steps to the key" distribution. Length === successes. */
  steps: number[];
  /** Total iterations (candidate evaluations) per trial — all trials, in order. */
  iterations: number[];
}

/**
 * Run `trials` independent toy recoveries at a fixed relation count and noise level,
 * each with its own seeded instance / relations / hill-climb start, and report the
 * success rate and the steps-to-recovery distribution. Deterministic for a fixed
 * `seed`. This is the toy's OWN statistic (badged illustrative in the UI) — it is
 * the methodological mirror of the paper's "all of ten keys recovered" criterion,
 * NOT a paper number.
 */
export function runTrials(
  relations: number,
  noiseP: number,
  opts: { trials?: number; seed: number; tiers?: number },
): TrialsResult {
  const trials = opts.trials ?? 20;
  const tiers = opts.tiers ?? DEFAULT_TIERS;
  requireInt('relations', relations);
  requireInt('trials', trials);
  requireInt('seed', opts.seed);
  if (relations < 0) throw new Error(`relations must be >= 0 (got ${relations})`);
  if (trials < 1) throw new Error(`trials must be >= 1 (got ${trials})`);
  if (!(noiseP >= 0 && noiseP <= 1)) throw new Error(`noiseP must be in [0, 1] (got ${noiseP})`);

  const rng = makeRng(opts.seed);
  let successes = 0;
  const steps: number[] = [];
  const iterations: number[] = [];
  for (let t = 0; t < trials; t++) {
    const instanceSeed = rng.int(1, 2_000_000_000);
    const relSeed = rng.int(1, 2_000_000_000);
    const climbSeed = rng.int(1, 2_000_000_000);
    const instance = makeToyInstance(instanceSeed);
    const rels = makeRelations(instance, relations, noiseP, relSeed);
    const res = hillClimb(rels, {
      n: instance.n,
      q: instance.q,
      bound: TOY_BOUND,
      tiers,
      seed: climbSeed,
    });
    iterations.push(res.iterations);
    if (recovers(res, instance)) {
      successes++;
      steps.push(res.trajectory.length - 1);
    }
  }
  return {
    trials,
    successes,
    successRate: successes / trials,
    relations,
    noiseP,
    steps,
    iterations,
  };
}
