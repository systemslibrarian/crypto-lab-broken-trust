/**
 * paperData.ts — the paper's REAL-scale results, transcribed and cited.
 *
 * Source of truth (full text transcribed; see PAPER-NOTES.md):
 *   Carsten Schubert (TU Berlin), Niklas Julius Müller (FU Berlin),
 *   Jean-Pierre Seifert (TU Berlin), Marian Margraf (FU Berlin),
 *   "Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage and
 *    Local Optimization", IACR ePrint 2026/472 (published 2026-03-06).
 *   https://eprint.iacr.org/2026/472
 *
 * NOTHING here is computed by the toy engine in model.ts. These are the published,
 * measured numbers the toy is *compared against*. Every field carries a citation.
 * The numbers come from the paper's tables (provided in full), not just the abstract:
 *   - Table 1: ML-DSA parameter sets.
 *   - Table 2: exact minimum informative-relation counts (exact / non-noisy setting),
 *              per parameter set and leakage index j ∈ {6,7,8,9}.
 *   - Table 3: reduction factors vs Damm et al. [5] in the high-leakage regime.
 *   - Table 4: noisy setting (p = 0.45), ML-DSA-44 and -87, j ∈ {6,7,8} (preliminary).
 */

/** Where a paper number comes from — drives the honesty badge in the UI. */
export type PaperProvenance =
  | 'paper-table' // transcribed from a numbered table in the paper
  | 'paper-text'; // stated in the paper's prose/abstract

export interface CitedRange {
  min: number;
  max: number;
  cite: string;
  provenance: PaperProvenance;
}

export interface CitedValue {
  value: number;
  cite: string;
  provenance: PaperProvenance;
}

export interface PriorWork {
  authors: string;
  contribution: string;
  cite: string;
}

export interface PaperMeta {
  title: string;
  authors: string[];
  eprint: string;
  url: string;
  published: string;
}

export const PAPER: PaperMeta = {
  title:
    'Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage and Local Optimization',
  authors: [
    'Carsten Schubert (TU Berlin)',
    'Niklas Julius Müller (FU Berlin)',
    'Jean-Pierre Seifert (TU Berlin)',
    'Marian Margraf (FU Berlin)',
  ],
  eprint: '2026/472',
  url: 'https://eprint.iacr.org/2026/472',
  published: '2026-03-06',
};

/** Leakage bit indices the exact-setting evaluation covers (Table 2). */
export const LEAKAGE_INDICES = [6, 7, 8, 9] as const;
export type LeakageIndex = (typeof LEAKAGE_INDICES)[number];

export interface MlDsaSet {
  label: string;
  nistLevel: number;
  /** (k, l) dimensions of the public matrix A (Table 1). */
  k: number;
  l: number;
  /** Secret coefficient bound η (Table 1). */
  eta: number;
  /** Number of ±1 entries in the challenge c (Table 1). */
  tau: number;
  /** Masking range exponent: γ1 = 2^gamma1Exp (Table 1). */
  gamma1Exp: number;
  /** Norm bound β = τ·η (Table 1). */
  beta: number;
  /** Table 2: minimum informative relations for 10/10 key recovery, by leakage index j. */
  relationsByIndex: Record<LeakageIndex, number>;
  /** Table 3 high-leakage-regime comparison vs Damm et al. [5], if reported for this set. */
  highLeakage?: { jAtLeast: number; dammRelations: number; ourRelations: number; factor: number };
  /** Table 4: noisy (p = 0.45) minimum informative relations by j (only 44 & 87 so far). */
  noisyByIndex?: Partial<Record<LeakageIndex, number>>;
  cite: string;
}

/**
 * The three NIST ML-DSA parameter sets (Table 1) with the per-set, per-leakage-index
 * results (Tables 2–4). n = 256 and q = 8 380 417 for all three.
 */
export const ML_DSA_SETS: MlDsaSet[] = [
  {
    label: 'ML-DSA-44',
    nistLevel: 2,
    k: 4,
    l: 4,
    eta: 2,
    tau: 39,
    gamma1Exp: 17,
    beta: 78,
    relationsByIndex: { 6: 6_000, 7: 11_500, 8: 13_500, 9: 14_500 },
    highLeakage: { jAtLeast: 8, dammRelations: 500_000, ourRelations: 13_500, factor: 37.0 },
    noisyByIndex: { 6: 2_000_000, 7: 4_000_000, 8: 5_000_000 },
    cite: 'Tables 1–4 (ML-DSA-44)',
  },
  {
    label: 'ML-DSA-65',
    nistLevel: 3,
    k: 6,
    l: 5,
    eta: 4,
    tau: 49,
    gamma1Exp: 19,
    beta: 196,
    relationsByIndex: { 6: 5_500, 7: 11_500, 8: 22_500, 9: 35_000 },
    highLeakage: { jAtLeast: 9, dammRelations: 2_400_000, ourRelations: 35_000, factor: 68.5 },
    noisyByIndex: {}, // noisy setting not yet evaluated for ML-DSA-65 (paper §6.2, future work)
    cite: 'Tables 1–3 (ML-DSA-65); noisy setting pending (paper §6.2)',
  },
  {
    label: 'ML-DSA-87',
    nistLevel: 5,
    k: 8,
    l: 7,
    eta: 2,
    tau: 60,
    gamma1Exp: 19,
    beta: 120,
    relationsByIndex: { 6: 5_000, 7: 9_500, 8: 17_500, 9: 17_500 },
    highLeakage: { jAtLeast: 8, dammRelations: 750_000, ourRelations: 17_500, factor: 42.8 },
    noisyByIndex: { 6: 2_000_000, 7: 4_000_000, 8: 6_500_000 },
    cite: 'Tables 1–4 (ML-DSA-87)',
  },
];

/**
 * Exact-leakage recovery band — the headline figure. From Table 2: the minimum is
 * 5,000 (ML-DSA-87, j=6) and the maximum is 35,000 (ML-DSA-65, j=9), "across all
 * parameter sets and leakage bit indices the attack is applicable for."
 */
export const RELATIONS_TO_RECOVER: CitedRange = {
  min: 5_000,
  max: 35_000,
  cite: 'Table 2 (min 5,000 = ML-DSA-87 j=6; max 35,000 = ML-DSA-65 j=9); Abstract.',
  provenance: 'paper-table',
};

/**
 * Reduction over the previous state of the art (Damm et al. [5]) in the high-leakage
 * regime. Table 3: ML-DSA-44 ≥37.0×, ML-DSA-87 42.8×, ML-DSA-65 68.5×. The abstract
 * rounds this to "37–68×".
 */
export const REDUCTION_FACTOR: CitedRange = {
  min: 37.0,
  max: 68.5,
  cite: 'Table 3 (ML-DSA-44 ≥37.0×, ML-DSA-87 42.8×, ML-DSA-65 68.5×); Abstract "37–68×".',
  provenance: 'paper-table',
};

/**
 * Noise tolerance: in the noisy-leakage model the leaked bit is flipped i.i.d. with
 * probability p, and recovery remains feasible at p = 0.45 (exceeding the p = 0.43
 * maximum tested by Damm et al.). NOTE: the noisy results are preliminary — only
 * ML-DSA-44 and -87 at j ∈ {6,7,8}, and they require 2–6.5 MILLION relations.
 */
export const NOISE_TOLERANCE_MAX_P: CitedValue = {
  value: 0.45,
  cite: 'Abstract & §6.2 / Table 4 — "feasible even at noise rates as high as 45%" (Damm et al. tested ≤ 0.43).',
  provenance: 'paper-table',
};

/** Noisy-setting relation cost range (Table 4, p = 0.45): ~2M to ~6.5M relations. */
export const NOISY_RELATIONS: CitedRange = {
  min: 2_000_000,
  max: 6_500_000,
  cite: 'Table 4 (p = 0.45): 2,000,000 (j=6) to 6,500,000 (ML-DSA-87 j=8).',
  provenance: 'paper-table',
};

/**
 * The premise this attack line rests on (paper §1, §2.2): recovery becomes possible
 * once the attacker learns even ONE bit of the per-signature masking randomness y.
 */
export const PRIOR_WORK: PriorWork[] = [
  {
    authors: 'Liu et al. [4]',
    contribution:
      'Showed that access to a single leaked bit of the masking randomness y per signature suffices, in principle, to mount key recovery against lattice Fiat-Shamir signatures.',
    cite: 'Y. Liu, Y. Zhou, S. Sun, T. Wang, R. Zhang, J. Ming, IEEE TIFS vol. 16, pp. 1868–1879, 2021.',
  },
  {
    authors: 'Damm et al. [5]',
    contribution:
      'Turned it into a practical regression-based attack across all three ML-DSA sets and many leakage indices — but data-hungry: 500,000–2,400,000 informative relations. This paper replaces the regression with hill-climbing.',
    cite: 'S. Damm, N. Kraus, A. May, J. Nowakowski, J. Thietke, "One Bit to Rule Them All", PKC 2025, pp. 284–316. (Noisy model: ePrint 2025/820 [6].)',
  },
];

/** ML-DSA scheme facts used by the mechanism explainer (Table 1; §2.1). */
export const SCHEME = {
  n: 256,
  q: 8_380_417,
  cite: 'FIPS 204 / Table 1 (n = 256, q = 8,380,417 for all three sets).',
};
