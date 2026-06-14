# PAPER-NOTES.md

Every paper number this demo shows, transcribed from the full text with table/section
citations. Source of truth:

> Carsten Schubert (TU Berlin), Niklas Julius Müller (FU Berlin),
> Jean-Pierre Seifert (TU Berlin), Marian Margraf (FU Berlin),
> **"Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage and
> Local Optimization"**, IACR ePrint **2026/472** (published 2026-03-06).
> <https://eprint.iacr.org/2026/472>

> **PDF provenance.** The IACR PDF is served behind a Cloudflare interstitial and is
> not machine-fetchable at build time, so it is **not redistributed in this repo**.
> The figures below are transcribed from the **full paper text** (Tables 1–4 and the
> abstract/intro), not just the abstract. The PDF binary is not required for the demo;
> these notes + the pinned tests are the in-repo record.

## What the paper does (Abstract / §1, §3, §4)

ML-DSA (FIPS 204; formerly CRYSTALS-Dilithium) uses **rejection sampling** so released
signatures are statistically independent of the secret key. Prior work — **Liu et al.
[4]** and **Damm et al. [5]** — showed this collapses once an attacker learns **one bit
of the per-signature masking randomness `y`**: each leaked bit + the public `(c, z)`
yields an **informative relation** on a secret subkey `x` (a coefficient polynomial of
`s1`). Damm et al. solve it by **linear regression**, needing **500,000–2,400,000**
informative relations.

This paper replaces regression with **local optimization**:
1. A **verification routine** (§3, Algorithm 1; Theorem 3.1) that scores a candidate
   subkey using *only* the informative relations — no other secret component, no lattice
   reduction. A candidate satisfies all relations iff it equals the true subkey (prob → 1).
2. A **multi-tier hill-climbing optimizer** (§4, Algorithm 4 + §4.3 strategies: multiple
   sweeps, adaptive block size, lateral moves, frequency-based diversification,
   perturbation-based restarts). Scoring is **excess-based** (Algorithm 3) in the exact
   setting and **count-based** (Algorithm 2) under noise (§5.3).

## Table 1 — ML-DSA parameter sets (§2.1)

`n = 256` and `q = 8,380,417` for all three.

| Set | NIST level | (k, ℓ) | η | τ | γ₁ | β = τ·η |
|---|---|---|---|---|---|---|
| ML-DSA-44 | 2 | (4, 4) | 2 | 39 | 2¹⁷ | 78 |
| ML-DSA-65 | 3 | (6, 5) | 4 | 49 | 2¹⁹ | 196 |
| ML-DSA-87 | 5 | (8, 7) | 2 | 60 | 2¹⁹ | 120 |

## Table 2 — exact setting: min informative relations for 10/10 recovery

Seed 42, T = 100,000 iterations, excess-based scoring, all optimizations enabled.

| leakage index j | ML-DSA-44 | ML-DSA-65 | ML-DSA-87 |
|---|---|---|---|
| 6 | 6,000 | 5,500 | **5,000** ← global min |
| 7 | 11,500 | 11,500 | 9,500 |
| 8 | 13,500 | 22,500 | 17,500 |
| 9 | 14,500 | **35,000** ← global max | 17,500 |

→ **The "5,000–35,000" headline band = min/max of this table.** (Min 5,000 = ML-DSA-87,
j=6; max 35,000 = ML-DSA-65, j=9.) At j=6 every signature is informative, so signature
counts equal relation counts there: ~5,000 / 5,500 / 6,000 signatures (§Conclusion).

## Table 3 — reduction vs Damm et al. [5] (high-leakage regime)

| | ML-DSA-44 (j ≥ 8) | ML-DSA-65 (j ≥ 9) | ML-DSA-87 (j ≥ 8) |
|---|---|---|---|
| Damm et al. [5] | 500,000 | 2,400,000 | 750,000 |
| This attack | 13,500 | 35,000 | 17,500 |
| **Reduction factor** | **≥ 37.0×** | **68.5×** | **42.8×** |

→ **The "37–68×" headline = span of these factors** (min 37.0, max 68.5). Factors are
`Damm / ours` truncated to one decimal (e.g. 2,400,000/35,000 = 68.57 → 68.5).

## Table 4 — noisy setting (p = 0.45), PRELIMINARY

Noise model (Def. 5.1): leaked bit flipped i.i.d. with probability p. p = 0.45 exceeds
the p = 0.43 maximum tested by Damm et al. **Preliminary:** only ML-DSA-44 and -87, at
j ∈ {6,7,8}; ML-DSA-65 and other noise levels are future work (§6.2). 4/5-key success.

| leakage index j | ML-DSA-44 | ML-DSA-87 |
|---|---|---|
| 6 | 2,000,000 | 2,000,000 |
| 7 | 4,000,000 † | 4,000,000 |
| 8 | 5,000,000 | 6,500,000 † |

→ Noisy recovery costs **2–6.5 million** relations — ~2 orders of magnitude more than
the exact setting. († = 4/5 rather than 5/5 keys.) "Survives 45% noise" is real but costly.

## Prior work (the single-leaked-bit premise)

- **Liu et al. [4]:** Y. Liu, Y. Zhou, S. Sun, T. Wang, R. Zhang, J. Ming, *"On the
  Security of Lattice-Based Fiat-Shamir Signatures in the Presence of Randomness
  Leakage"*, IEEE TIFS, vol. 16, pp. 1868–1879, 2021. — one leaked bit of `y` per
  signature suffices in principle.
- **Damm et al. [5]:** S. Damm, N. Kraus, A. May, J. Nowakowski, J. Thietke, *"One Bit to
  Rule Them All — Imperfect Randomness Harms Lattice Signatures"*, PKC 2025, pp. 284–316.
  — practical regression attack; data-hungry. Noisy model: ePrint **2025/820** [6].

## The toy engine is NOT in this file

`src/model.ts` is an **illustrative toy** at dimension 8 with a one-sided threshold leak
(`⟨a,s⟩ ≥ τ`) standing in for the paper's two-sided interval relation
`|⟨c,x⟩ − z̃| ≤ β`. Its relation counts (≈1,500 to converge noiseless) and noise ceiling
(~20–30%) are the **toy's own**, never the paper's, and the UI badges the two distinctly.

## Verify it yourself (toy side)

```js
import { makeToyInstance, makeRelations, hillClimb, score } from './src/model';
const inst = makeToyInstance(1);
const rels = makeRelations(inst, 4000, 0, 113);
score(inst.secret, rels);                        // 0 — zero exactly at the true key
const res = hillClimb(rels, { n: 8, q: 257, bound: 3, seed: 8 });
res.converged && res.best;                        // true; === inst.secret (recovered)
```
