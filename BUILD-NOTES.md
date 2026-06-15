# BUILD-NOTES — crypto-lab-broken-trust

**Source:** Schubert, Müller, Seifert, Margraf, *"Descent into Broken Trust:
Uncovering ML-DSA Subkeys with Scarce Leakage and Local Optimization"*, IACR
ePrint **2026/472** (published 2026-03-06). <https://eprint.iacr.org/2026/472>

`npm test` → **41 tests green**. `npm run build` → clean; `dist/` emits with base
`/crypto-lab-broken-trust/` (asset URLs verified: `/crypto-lab-broken-trust/assets/…`).

---

## Phase 1 — visualization & intuition upgrades

Model (pure, deterministic, tested — see `model.test.ts`):
- `HillClimbConfig.start?`: optional explicit initial candidate (rounded/clamped to
  the search box) so the UI can let users **click the landscape to set a start**.
- `runTrials(relations, noiseP, {trials, seed})`: pure repeated-trial statistics
  (success rate + steps-to-recover distribution) — the toy's own mirror of the
  paper's 10/10 methodology. 10 new tests (41 total).

UI (`main.ts` / `index.html` / `styles.css`):
- **Score landscape** is now the literal "rolling downhill" view: a tier-colored,
  fading **descent path with a moving particle**, **click-to-set-start**, **hover
  for the exact score**, a **colorblind-safe viridis** scale, and a **legend**
  marking the true-key minimum. Labeled honestly as a 2-D slice/projection of the
  8-D landscape.
- **Descent chart**: shaded, labeled **tier bands** (coarse → fine) and an
  off-by-default **alternate-runs overlay** (different random starts) to show spread.
- **Run-N-trials** card: success rate + steps histogram at the current settings,
  framed as the toy-scale mirror of the paper's 10/10 criterion (badged `toy`).
- **Coefficient lock-in pulse** (green flash as a coordinate hits its true value;
  respects reduced-motion) and a **tier stepper** (Tier 1 coarse → 2 → 3 fine).

All new toy numbers remain badged `toy · illustrative`; zero new runtime deps.

## Phase 2 — educational scaffolding & progressive disclosure

UI/copy only (no model changes; still 41 tests):
- **Guided tour** (7 steps, Independence → Leakage → Optimization) that highlights +
  scrolls to each section and drives the Clean-descent preset/play at the
  optimization step. Launch button in the TL;DR; first-visit nudge gated on
  `localStorage['tour-seen']`; `?tour=1` auto-starts; Esc/arrow-key navigation,
  focus management, `role="dialog"`.
- **Physical analogy** ("marble in a bumpy bowl") in the mechanism, explicitly
  labeled an analogy, not the math.
- **Contextual help** `(?)` dots on the live-readout terms (relation, noise p, tier,
  score) opening accessible popovers (click-outside / Esc to close).
- **Predict widget**: a "will the score reach 0?" Yes/No bar above the play controls
  that reveals correctness against `result.converged` and then plays; resets on any
  settings change.

## Phase 3 — stronger paper fidelity & context

UI/copy + data-viz only (sourced entirely from the already-pinned `paperData.ts`;
no model changes; 41 tests):
- **Paper results, visualized**: a log-scale **reduction bar chart** (Damm et al.
  500k–2.4M vs this attack 5k–35k, per set, with the 37.0/42.8/68.5× factors) and a
  **Table 2 heatmap grid** (sets × leakage index j=6–9) with exact counts and the
  global min/max ringed. Redrawn on theme toggle.
- **Implications & Defenses** (progressively disclosed): practical threat (high-volume
  long-lived keys; subkey → perfect hints → full key; ML-DSA-87 most exposed for
  subkeys), defense-in-depth (protect randomness bits; masking necessary-but-not-
  sufficient per Qiao et al.; shielding; key rotation), and what it does NOT change
  (Module-LWE / FIPS 204 intact; not a fault attack). Cites §7.
- **Explicit toy ↔ paper mapping** (collapsible) in the honesty bridge: dimension,
  relation shape, score, optimizer, success metric, relations-to-recover, noise
  ceiling — faithful-in-shape rows vs different-in-scale rows, badged per column.

---

## Provenance — figures verified against the FULL paper text

The full paper text (Tables 1–4, abstract, intro) was transcribed into
`src/paperData.ts`. The IACR PDF is Cloudflare-gated (`WebFetch` → HTTP 403;
`curl` → the "Just a moment…" challenge HTML), so it is **not redistributed in this
repo** — and it does not need to be: the numbers below are the exact table values,
pinned by tests. No abstract-only guesswork remains; no per-set values are invented.

## Transcribed paper numbers (with citations) — `src/paperData.ts`

| Quantity | Value | Citation |
|---|---|---|
| Relations to recover (exact setting) | **5,000 – 35,000** (min ML-DSA-87 j=6; max ML-DSA-65 j=9) | **Table 2** |
| Per-set × per-index relation counts | full 3×4 grid (j ∈ {6,7,8,9}) | **Table 2** |
| Reduction vs Damm et al. [5] | **37.0× / 42.8× / 68.5×** (44 / 87 / 65) → span 37–68× | **Table 3** |
| Noise tolerance (bit flipped i.i.d. w.p. p) | up to **45%** | Abstract, **Table 4** |
| Noisy-setting relation cost | **2,000,000 – 6,500,000** (p = 0.45) | **Table 4** |
| Scheme params (n, q, k, ℓ, η, τ, γ₁, β=τ·η) | per set | **Table 1** |
| Premise (prior work) | one leaked bit of masking randomness per signature | §1, §2.2 — **Liu et al. [4]** (IEEE TIFS 2021), **Damm et al. [5]** (PKC 2025; noisy [6] = ePrint 2025/820) |

Pinned by **transcription-guard tests** that fail loudly if any cell is mistyped: the
5k–35k band is re-derived as the min/max of the Table-2 grid; the 37.0/42.8/68.5×
factors are checked against `Damm/ours` (truncated to one decimal) and their span;
β = τ·η is checked per set; noisy data is asserted to exist only for ML-DSA-44 & -87.

### Caveats transcribed faithfully (not gaps in this repo)

- **Noisy results are preliminary** (paper §6.2): ML-DSA-44 and -87 only, j ∈ {6,7,8};
  ML-DSA-65 and other noise levels are the authors' future work. Surfaced in the replay
  panel and Known Gaps.
- **The toy leak is a one-sided threshold** stand-in for the paper's two-sided interval
  `|⟨c,x⟩ − z̃| ≤ β`. Stated in the mechanism note and Known Gaps.

---

## The toy engine's OWN measured numbers — `src/model.ts` (NOT the paper's)

These are produced live by the dimension-8 toy and must never be read as the
paper's scale. They are deliberately small and the toy's ceiling is its own.

| Toy quantity | Measured value | How |
|---|---|---|
| Toy dimension / coeffs | n = 8, coeffs ∈ [−2, 2], search box [−3, 3], q = 257 (flavor) | constants in `model.ts` |
| Refinement tiers | 3 (coarse → fine) | `DEFAULT_TIERS` |
| `score(trueKey, …)` noiseless | **0 exactly** — the unique global minimum | pinned test |
| Relations to converge, **noiseless** | **≈ 1,500** (5-trial reliable; every default seed converges by 4,000) | `relationsToConverge`, empirical sweep |
| Default descent | seed 1, 4,000 relations, p = 0 → converges in ~16 accepted steps | empirical |
| Noise behaviour @ ~6,000 relations | reliable at p ≈ 0.1–0.2; ~0.63 success at p = 0.3; stalls (≈0) by p ≥ 0.4 | empirical sweep (6 trials/point) |
| **Toy noise ceiling** | **≈ 20–30%** (its own; the noise explorer marks it live) | derived from the recovery curve |

**The toy ceiling (~20–30%) is intentionally below the paper's measured ~45%.**
The toy is tiny and single-start; the paper's optimizer runs at real ML-DSA scale
where far more relations average out noise. The UI states this explicitly and
badges the two scales differently (`toy · illustrative` vs `paper-measured`).

---

## Faithfulness of the toy (shape, not scale)

- **One leaked bit → one relation.** The toy relation is a public ternary vector
  `a ∈ {−1,0,+1}⁸` plus a public threshold `τ`; the leaked bit is `⟨a, s⟩ ≥ τ` —
  one affine halfspace, the stand-in for "one leaked masking bit + public data."
- **Key-free score, zero at the truth.** `score` counts violated relations using
  only the relations (never the secret); it is 0 exactly at the true key noiseless
  and grows with distance — a smooth, descendable hill. (A large-coefficient leak
  would give a noise-like, undescendable landscape — see the comment in `model.ts`
  explaining why ternary `a` is essential.)
- **Multi-tier hill-climbing.** Coordinate steps, coarse magnitudes first then
  finer, greedily accepting score reductions; deterministic per seed; the recorded
  trajectory is monotone non-increasing (pinned).
- **Count-based noisy score.** Under noise the score is the count variant the paper
  uses; the true key no longer scores 0 but the minimum stays near it until the
  toy's ceiling.

## Honesty / scope (also in the in-app Known Gaps panel)

- Toy miniature, not the paper's full optimizer; its numbers are its own.
- Paper numbers transcribed, **not** reproduced in-browser.
- Models recovery **given** leakage, **not** how the leakage is obtained.
- A **leakage + local-optimization** result, **not** a fault attack; **not** an
  attack on real ML-DSA.

## Purity / determinism

`src/model.ts` has no `Date`, no network, no ambient `Math.random` — randomness is
only the seeded mulberry32 PRNG (pinned by a source-scanning test). Same seed ⇒
identical instance, relations, and descent trajectory.

## Gold-standard teaching upgrades (from `chat.md`)

Added on top of the base demo, all reusing the pure `model.ts` (no new model
code, tests still 27 green):

- **North-star sentence** surfaced in the TL;DR: *"One leaked masking bit per
  signature turns ML-DSA's hidden subkey into the unique minimum of a score the
  attacker can evaluate without the key."*
- **Score-landscape heatmap** — sweeps any two secret coordinates (others fixed at
  the true key), colours each by violation score, and marks the true key (the
  minimum), the start guess, and the live candidate. Visually proves "the key is at
  the bottom of a hill."
- **Relation microscope** — shows one relation as a concrete object (public `a`,
  `τ`, ⟨a,candidate⟩, ⟨a,true⟩, predicted vs observed bit, satisfied/violated).
  "Another relation →" jumps to the next one the current candidate violates.
- **No-leakage vs leakage contrast** — same key + candidates scored with 0 relations
  (all flat at 0 → key invisible) vs the current relations (true key is the unique
  minimum).
- **Named, deep-linkable teaching presets** — Clean descent / Too few leaks / Noisy
  but recoverable / Past toy ceiling (outcomes verified under the live seeding).
- **Paper-scale replay tabs** — ML-DSA-44/65/87, each replaying the paper's measured
  band (badged `paper-measured · band`; exact per-set counts still pending the PDF).
- **Three-question assessment** — what the optimizer knows / what actually breaks
  ML-DSA / why noise doesn't kill it.

Provenance closure (`chat.md` item 4) remains blocked by the Cloudflare PDF gate —
still requires Paul to commit `2026-472.pdf` manually.

## House style / config

Vite + TS, no runtime deps; `base: '/crypto-lab-broken-trust/'`; dark default with
anti-flash script + localStorage theme toggle; progressive-disclosure UI; CI +
Pages deploy workflows; scripture footer verbatim.
