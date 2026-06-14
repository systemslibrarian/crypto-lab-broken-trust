# crypto-lab-broken-trust

[![CI](https://github.com/systemslibrarian/crypto-lab-broken-trust/actions/workflows/ci.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-broken-trust/actions/workflows/ci.yml)
[![Deploy](https://github.com/systemslibrarian/crypto-lab-broken-trust/actions/workflows/deploy.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-broken-trust/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f)](https://systemslibrarian.github.io/crypto-lab-broken-trust/)

> Leak **one bit** of ML-DSA's per-signature masking randomness and the secret
> subkey becomes the **bottom of a hill you can roll down** — no lattice
> reduction. This demo lets you *watch* a toy version descend, next to the
> real-scale numbers from IACR ePrint 2026/472. It runs **no attack** on real
> ML-DSA.

## What It Is

An **educational reconstruction** of Carsten Schubert, Niklas Julius Müller,
Jean-Pierre Seifert, and Marian Margraf, *"Descent into Broken Trust: Uncovering
ML-DSA Subkeys with Scarce Leakage and Local Optimization"*
([IACR ePrint 2026/472](https://eprint.iacr.org/2026/472)).

The primitive is **ML-DSA / CRYSTALS-Dilithium** (FIPS 204), the primary NIST
post-quantum signature standard. ML-DSA uses **rejection sampling** so released
signatures are statistically independent of the secret key — that independence is
the defense. The attack line (Liu et al., Damm et al.) shows the defense collapses
once an attacker learns **even one bit of the per-signature masking randomness**:
each leaked bit becomes an **informative relation** on a secret subkey. The paper
then (1) builds a **verification routine** that scores a candidate subkey using
*only* those relations — zero exactly at the true key, no lattice reduction — and
(2) descends that score with a **multi-tier hill-climbing optimizer**. It recovers
subkeys from **5,000–35,000 relations** (a **37–68× reduction** over prior work)
and still succeeds at **~45% leaked-bit noise**.

This repo is a **hybrid**:

- A **live, in-browser toy engine** (`src/model.ts`) — dimension-8, integer
  coefficients — that you can actually watch descend: the violation score falling
  tier by tier to zero, with relation-count and noise sliders. It recovers a toy
  key **the demo generated itself**, purely to make the *dynamics* visible.
- A **paper-data overlay** (`src/paperData.ts`) that replays the paper's measured
  real-scale results so the toy is shown to be a faithful miniature, not a cartoon.

It is **leakage-assisted subkey recovery via local optimization** — a
**leakage + optimization** result, **not a fault-injection attack**, and **not** an
attack tool. No real ML-DSA key, no real signatures, no captured side channel. The
honesty bridge is explicit throughout: every **toy · illustrative** number is
badged distinctly from every **paper-measured** number.

> ⚠️ The IACR PDF is served behind Cloudflare and could not be machine-fetched
> during the build, so `2026-472.pdf` is **not yet committed** — the paper figures
> were transcribed from the abstract. Commit the real PDF and re-verify against
> `PAPER-NOTES.md`. Details in `BUILD-NOTES.md`.

## When to Use It

- To build intuition for **why one leaked masking bit is catastrophic** even though
  rejection sampling hides the key in the clean case.
- To *see* the core idea — **the secret sits at the global minimum of a score you
  can evaluate without the key** — as a descending curve, not just prose.
- As a teaching aid for **local optimization / hill-climbing cryptanalysis** and for
  the distinction between a demo's qualitative dynamics and a paper's quantitative
  scale.

It does **not** assess any real system's security and recovers **no** real key.

## Live Demo

👉 **<https://systemslibrarian.github.io/crypto-lab-broken-trust/>**

State is deep-linkable via the query string, e.g.
`?seed=1&rels=4000&noise=0` reproduces a clean descent; raise `noise` past the
toy's ceiling to watch it stall.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-broken-trust.git
cd crypto-lab-broken-trust
npm install
npm test        # run the pinned toy invariants + paper-transcription guards
npm run dev     # local dev server
npm run build   # production build into dist/
npm run preview # preview the production build
```

Requires Node 20+. No runtime dependencies.

## Part of the Crypto-Lab Suite

This is one of the **crypto-lab** demos — small, auditable, single-result
educational tools in a shared house style (Vite + TypeScript, a pure deterministic
`src/model.ts`, pinned tests, progressive-disclosure UI, dark default, honesty
badges). It is a sibling of `crypto-lab-lwe-hints`, `crypto-lab-syndrome-drain`,
and others in the suite.

---

*"Whether you eat or drink, or whatever you do, do all to the glory of God." — 1 Corinthians 10:31*
