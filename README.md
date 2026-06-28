# crypto-lab-broken-trust

## What It Is

> Leak **one bit** of ML-DSA's per-signature masking randomness and the secret
> subkey becomes the **bottom of a hill you can roll down** — no lattice
> reduction. This demo lets you *watch* a toy version descend, next to the
> real-scale numbers from IACR ePrint 2026/472. It runs **no attack** on real
> ML-DSA.

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

> ℹ️ **Provenance.** The paper figures are transcribed from the **full text**
> (Tables 1–4) into [`src/paperData.ts`](src/paperData.ts) and pinned by tests — the
> exact per-set, per-leakage-index relation counts (Table 2 → the 5,000–35,000 band),
> the 37.0/42.8/68.5× reductions (Table 3), and the noisy-setting results (Table 4).
> The IACR PDF is Cloudflare-gated and is **not redistributed in this repo**; see
> `PAPER-NOTES.md` for the full transcription and `BUILD-NOTES.md` for the details.

### What you can explore

- **Guided tour** that walks the three-act story (Independence → Leakage → Optimization)
  and drives the demo for you — auto-offered on first visit, or `?tour=1`.
- **Live descent visualizer** — relation-count, noise, and seed sliders, play/step/reset,
  shaded tier bands, a **coefficient lock-in** animation, and an optional alternate-run overlay.
- **Interactive score-landscape heatmap** — *click a cell (or press “New start”) to start the
  climb anywhere*, hover for the exact score, with a colorblind-safe **viridis** scale + legend
  and the descent path drawn as a rolling particle.
- **Relation microscope** (one leaked relation as a concrete object) and a **no-leakage vs.
  leakage** contrast.
- **Run-N-trials** — success rate + a steps-to-recover histogram (the toy's own mirror of the
  paper's 10/10 methodology).
- **Paper-scale replay tabs** and **visualized results** — a log-scale reduction bar chart and a
  Table 2 heatmap grid — plus an **Implications & Defenses** section and an explicit
  **toy ↔ paper mapping**.
- **Deep-linkable state** with a **Copy link** button, dark/light theme, keyboard + screen-reader
  support, colorblind-safe palettes, and `prefers-reduced-motion` support throughout.

## When to Use It

- To build intuition for **why one leaked masking bit is catastrophic** even though
  rejection sampling hides the key in the clean case.
- To *see* the core idea — **the secret sits at the global minimum of a score you
  can evaluate without the key** — as a descending curve, not just prose.
- As a teaching aid for **local optimization / hill-climbing cryptanalysis** and for
  the distinction between a demo's qualitative dynamics and a paper's quantitative
  scale.
- Do NOT treat it as a security assessment or attack tool: it assesses no real system, recovers **no** real key, and is a teaching demo, not production code.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-broken-trust](https://systemslibrarian.github.io/crypto-lab-broken-trust/)**

First-time visitors are offered a short **guided tour** (or start it anytime from the
TL;DR, or via `?tour=1`). State is deep-linkable via the query string, e.g.
`?seed=1&rels=4000&noise=0` reproduces a clean descent; raise `noise` past the toy's
ceiling to watch it stall. The **Copy link** button grabs the URL for the current state.

## What Can Go Wrong

- Leaking even a single bit of the per-signature masking randomness — for example through a side channel — turns each signature into an informative relation on a secret subkey, and the rejection-sampling independence that protects ML-DSA in the clean case no longer holds.
- Because a candidate subkey can be scored using only the leaked relations (zero at the true key, no lattice reduction required), any implementation that leaks must assume the secret sits at a findable global minimum.
- The recovery tolerates substantial noise on the leaked bits (the cited paper still succeeds at ~45% noise), so an implementation that is only "mostly" constant-time or partially leaky is not safe.
- Mistaking the toy engine's qualitative dynamics for real-scale cost: the in-browser run recovers a dimension-8 key the demo generated itself, not a real ML-DSA key, and the paper's relation counts and reduction factors are the load-bearing numbers.

## Real-World Usage

- ML-DSA (FIPS 204) is the primary NIST post-quantum digital signature standard, intended for code signing, firmware updates, certificates, and protocol authentication.
- It is being integrated into TLS, PKI, and software-supply-chain trust as a post-quantum replacement for (or hybrid alongside) classical signatures like Ed25519 and RSA.
- The masking-randomness side-channel concern this demo illustrates is exactly why constant-time, leakage-resistant implementations are emphasized for deployed ML-DSA and lattice signatures generally.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-broken-trust
cd crypto-lab-broken-trust
npm install
npm run dev
```

## Related Demos
- [crypto-lab-dilithium-seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/) — the ML-DSA / FIPS 204 signature scheme this demo attacks, shown in normal operation.
- [crypto-lab-dilithium-reject](https://systemslibrarian.github.io/crypto-lab-dilithium-reject/) — ML-DSA rejection sampling, the very defense whose leakage this demo exploits.
- [crypto-lab-lattice-fault](https://systemslibrarian.github.io/crypto-lab-lattice-fault/) — fault injection against ML-KEM/ML-DSA, a sibling lattice-cryptanalysis demo.
- [crypto-lab-lwe-hints](https://systemslibrarian.github.io/crypto-lab-lwe-hints/) — recovering lattice secrets from partial hints, the same "scarce-leakage" theme.
- [crypto-lab-syndrome-drain](https://systemslibrarian.github.io/crypto-lab-syndrome-drain/) — another post-quantum cryptanalysis demo in the suite's attacks family.

## Build & Test

```bash
npm test        # run the pinned toy invariants + paper-transcription guards
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

*One of 60+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
