# PAPER-NOTES.md

Every paper number this demo shows, with its source. The source of truth is:

> Carsten Schubert, Niklas Julius Müller, Jean-Pierre Seifert, Marian Margraf,
> **"Descent into Broken Trust: Uncovering ML-DSA Subkeys with Scarce Leakage and
> Local Optimization"**, IACR ePrint **2026/472** (published 2026-03-06).
> <https://eprint.iacr.org/2026/472>

> ⚠️ **PDF provenance.** The IACR PDF is served behind a Cloudflare interstitial
> and returned **HTTP 403 / a "Just a moment…" challenge** to every automated
> fetch attempted during the build (`WebFetch`, `curl` with a browser UA). It
> therefore could **not** be machine-fetched or committed automatically. The
> figures below were transcribed from the paper's **abstract**, retrieved
> independently via web search (two retrievals agreeing, and matching the build
> brief). **Paul must commit the real `2026-472.pdf` manually** and re-verify the
> exact per-parameter-set table against these notes. See `BUILD-NOTES.md`.

## What the paper does (Abstract / §1)

ML-DSA (FIPS 204; formerly CRYSTALS-Dilithium) uses **rejection sampling** so that
released signatures are statistically independent of the secret key. Prior work
(**Liu et al.**, **Damm et al.**) showed that this independence collapses once an
attacker learns **even a single bit of the per-signature masking randomness**:
each leaked bit, paired with public signature/challenge data, yields an
**informative relation** constraining a secret subkey.

This paper contributes:

1. A **verification routine** that scores a *candidate* subkey using **only** the
   collected leakage relations — no other secret component, **no lattice
   reduction**. The score reaches **zero exactly at the true subkey**.
2. A **multi-tier hill-climbing optimizer** that iteratively tweaks the candidate
   to reduce that score, descending to the true key. In the noisy setting a
   **count-based** score variant is used.

## Transcribed figures (the overlay / tests guard these)

| Figure | Value | Source |
|---|---|---|
| Informative relations to recover a subkey | **5,000 – 35,000** (across all parameter sets and leakage bit indices) | Abstract |
| Reduction over previous state of the art | **37× – 68×** fewer relations | Abstract |
| Noise tolerance (leaked bit flipped i.i.d. with prob. p) | key recovery feasible up to **~45%** | Abstract |
| Premise (prior work) | recovery from **one leaked bit of masking randomness per signature** | §Introduction, attributing **Liu et al.** and **Damm et al.** |
| Parameter sets | ML-DSA-44 / -65 / -87 (NIST levels 2 / 3 / 5) | FIPS 204 (named for context; the 5k–35k band is the paper's aggregate) |

Exact abstract wording transcribed:

- *"recovers ML-DSA subkeys from as few as 5,000 to 35,000 informative relations
  across all parameter sets and leakage bit indices, constituting a reduction by a
  factor of 37–68× over the previous state of the art."*
- *"key recovery remains feasible even at noise rates as high as 45%."*

## What is NOT transcribed (needs the committed PDF)

- The **exact per-parameter-set relation counts** inside the 5,000–35,000 band, and
  per-leakage-bit-index numbers. The demo deliberately shows only the verified
  **band**, never invented per-row values.
- The exact **bibliographic keys** for Liu et al. / Damm et al. (attribution is
  transcribed from the intro; the numeric reference keys live in the PDF).

## The toy engine is NOT in this file

Everything in `src/model.ts` is an **illustrative toy** at dimension 8. Its
relation counts (≈1,500 to converge noiseless) and its noise ceiling are the
**toy's own** numbers, computed live in the browser — they are **never** the
paper's 5,000–35,000 or ~45%, and the UI badges them distinctly
(`toy · illustrative` vs `paper-measured`).

## Verify it yourself (toy side)

```js
import { makeToyInstance, makeRelations, hillClimb, score } from './src/model';

const inst = makeToyInstance(1);                 // a toy subkey the demo generated
const rels = makeRelations(inst, 4000, 0, 113);  // 4,000 noiseless relations
score(inst.secret, rels);                        // 0 — zero exactly at the true key
const res = hillClimb(rels, { n: 8, q: 257, bound: 3, seed: 8 });
res.converged;                                   // true — descended to score 0
res.best;                                        // === inst.secret (recovered)
```
