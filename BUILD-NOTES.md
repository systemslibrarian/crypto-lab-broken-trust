# BUILD-NOTES — crypto-lab-broken-trust

**Source:** Schubert, Müller, Seifert, Margraf, *"Descent into Broken Trust:
Uncovering ML-DSA Subkeys with Scarce Leakage and Local Optimization"*, IACR
ePrint **2026/472** (published 2026-03-06). <https://eprint.iacr.org/2026/472>

`npm test` → **27 tests green**. `npm run build` → clean; `dist/` emits with base
`/crypto-lab-broken-trust/` (asset URLs verified: `/crypto-lab-broken-trust/assets/…`).

---

## ⚠️ Action required from Paul — commit the PDF, re-verify the table

The IACR PDF is served behind a **Cloudflare interstitial**. Every automated fetch
during the build hit it:

- `WebFetch https://eprint.iacr.org/2026/472(.pdf)` → **HTTP 403**.
- `curl` with a desktop browser User-Agent → returned the **"Just a moment…"
  challenge HTML**, not a PDF (verified with `file`; deleted, not committed —
  committing a fake PDF would be dishonest).

So **`2026-472.pdf` is NOT in the repo.** Please download it in a browser and
commit it as `2026-472.pdf`, then re-verify the per-parameter-set table against
`PAPER-NOTES.md`. The paper figures below were transcribed from the **abstract**
(two independent web retrievals agreeing, and matching the build brief). **If the
PDF disagrees with any figure, the PDF wins** — update `src/paperData.ts` (the
tests will then flag the change loudly).

---

## Transcribed paper numbers (with citations) — `src/paperData.ts`

| Quantity | Value | Citation | Provenance |
|---|---|---|---|
| Informative relations to recover a subkey | **5,000 – 35,000** | Abstract ("across all parameter sets and leakage bit indices") | abstract |
| Reduction over previous state of the art | **37× – 68×** | Abstract | abstract |
| Noise tolerance (leaked bit flipped i.i.d. w.p. p) | up to **~45%** | Abstract | abstract |
| Premise (prior work) | one leaked bit of masking randomness per signature | §Intro — **Liu et al.**, **Damm et al.** | abstract / intro |
| Parameter sets named | ML-DSA-44 / -65 / -87 | FIPS 204 (context only; band is the paper's aggregate) | standard |

These are pinned by **transcription-guard tests** that fail loudly if mistyped:
relation counts must equal 5,000 / 35,000; reduction must equal 37 / 68; noise
must be ≤ 0.45 (and ≈ 0.45). Authors and prior-work attribution are asserted too.

### Not transcribed (needs the PDF)

- Exact **per-parameter-set** relation counts within the 5k–35k band, and
  per-leakage-bit-index numbers. The demo shows only the verified **band** — no
  invented per-row values.
- Exact **bibliographic keys** for Liu et al. / Damm et al.

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
