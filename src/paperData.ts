/**
 * paperData.ts — the paper's REAL-scale results, transcribed and cited.
 *
 * Source of truth:
 *   Carsten Schubert, Niklas Julius Müller, Jean-Pierre Seifert, Marian Margraf,
 *   "Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage and
 *    Local Optimization", IACR ePrint 2026/472 (published 2026-03-06).
 *   https://eprint.iacr.org/2026/472
 *
 * NOTHING here is computed by the toy engine in model.ts. These are the published,
 * measured numbers the toy is *compared against* — the quantitative anchor for the
 * qualitative dynamics the live demo reproduces. Every field carries a citation.
 *
 * PROVENANCE NOTE (read BUILD-NOTES.md): the IACR PDF is served behind Cloudflare
 * and returned HTTP 403 to the build tooling, so it could not be auto-fetched. The
 * figures below were transcribed from the paper's ABSTRACT (retrieved independently
 * and matching the build brief). The exact per-parameter-set relation counts inside
 * the 5,000–35,000 band require the committed `2026-472.pdf` to verify — they are
 * NOT fabricated here; the demo shows the verified BAND, not invented per-row values.
 */

/** Where a paper number comes from — drives the honesty badge in the UI. */
export type PaperProvenance =
  | 'paper-abstract' // transcribed from the abstract (verified)
  | 'paper-pending'; // stated in the paper; exact value needs the committed PDF

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
  authors: ['Carsten Schubert', 'Niklas Julius Müller', 'Jean-Pierre Seifert', 'Marian Margraf'],
  eprint: '2026/472',
  url: 'https://eprint.iacr.org/2026/472',
  published: '2026-03-06',
};

/**
 * Exact-leakage recovery: the paper recovers ML-DSA subkeys from "as few as 5,000
 * to 35,000 informative relations across all parameter sets and leakage bit
 * indices." This is the verified BAND (the headline of the measured result).
 */
export const RELATIONS_TO_RECOVER: CitedRange = {
  min: 5_000,
  max: 35_000,
  cite: 'Abstract — "as few as 5,000 to 35,000 informative relations across all parameter sets and leakage bit indices."',
  provenance: 'paper-abstract',
};

/**
 * Reduction over the previous state of the art: a factor of 37–68×, i.e. the
 * attack needs 37–68× fewer relations than prior work.
 */
export const REDUCTION_FACTOR: CitedRange = {
  min: 37,
  max: 68,
  cite: 'Abstract — "a reduction by a factor of 37–68× over the previous state of the art."',
  provenance: 'paper-abstract',
};

/**
 * Noise tolerance: in the noisy-leakage model the leaked bit is flipped i.i.d.
 * with error probability p, and key recovery "remains feasible even at noise rates
 * as high as 45%." This is the paper's measured ceiling — the toy's own ceiling is
 * separate (and lower); see model.ts / the Known Gaps panel.
 */
export const NOISE_TOLERANCE_MAX_P: CitedValue = {
  value: 0.45,
  cite: 'Abstract — "key recovery remains feasible even at noise rates as high as 45%."',
  provenance: 'paper-abstract',
};

/**
 * The premise this attack line rests on (the paper's intro, attributing prior work):
 * recovery becomes possible once the attacker learns even ONE bit of the
 * per-signature masking randomness.
 */
export const PRIOR_WORK: PriorWork[] = [
  {
    authors: 'Liu et al.',
    contribution:
      'Showed that leaking a single bit of the per-signature masking randomness already yields exploitable relations on the ML-DSA secret.',
    cite: 'Introduction (prior-work attribution); exact bibliographic key in the committed PDF.',
  },
  {
    authors: 'Damm et al.',
    contribution:
      'Established the single-leaked-bit-per-signature setting this paper optimizes, framing each leaked bit as an informative relation on the subkey.',
    cite: 'Introduction (prior-work attribution); exact bibliographic key in the committed PDF.',
  },
];

/**
 * ML-DSA parameter sets (FIPS 204 — the standard, NOT this paper). Included only to
 * name the regimes across which the paper's 5,000–35,000 band holds; the per-set
 * dimensions (k, l) and security level are public standard facts. The relation band
 * is the paper's aggregate across these sets and across leakage bit indices.
 */
export interface MlDsaSet {
  label: string;
  nistLevel: number;
  /** (k, l) dimensions of the public matrix / secret from FIPS 204. */
  k: number;
  l: number;
  cite: string;
}

export const ML_DSA_SETS: MlDsaSet[] = [
  { label: 'ML-DSA-44', nistLevel: 2, k: 4, l: 4, cite: 'FIPS 204, Table (parameter sets)' },
  { label: 'ML-DSA-65', nistLevel: 3, k: 6, l: 5, cite: 'FIPS 204, Table (parameter sets)' },
  { label: 'ML-DSA-87', nistLevel: 5, k: 8, l: 7, cite: 'FIPS 204, Table (parameter sets)' },
];
