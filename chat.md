# Gold Standard Teaching Demo Notes

A gold-standard version would make one thing impossible to miss:

**ML-DSA is not "broken"; the implementation's masking secrecy is the load-bearing wall. Once one masking bit leaks per signature, the attacker gets a key-free score whose minimum is the subkey, and local optimization can descend it.**

This repo is already strong because it has the right bones: a deterministic toy engine in `src/model.ts`, paper-vs-toy separation in `src/paperData.ts`, provenance notes in `PAPER-NOTES.md`, and an honest live UI in `index.html`. To make it the gold standard, focus on these upgrades.

## 1. Add A "No Leakage vs Leakage" First Moment

Right now the demo explains rejection sampling and then shows descent. The best teaching move would be a side-by-side opening interaction:

- **No leaked bit:** candidate scores are flat/useless; nothing points toward the key.
- **One leaked bit per signature:** relations accumulate; the score landscape forms; descent starts working.

That contrast would teach the central lesson before any learner sees charts or paper numbers.

## 2. Add A Relation Microscope

Let users click one relation and see:

```text
public a
public threshold tau
candidate dot product
true toy dot product
predicted bit
observed leaked bit
violated? yes/no
```

This would turn "informative relation" from a phrase into an object. The learner should be able to say: "Oh, this is just one yes/no constraint, and thousands of them carve out the key."

## 3. Show The Score Landscape, Not Only The Descent Curve

The descent chart is good, but it shows the optimizer's path, not why the path exists. For dimension 8, project the landscape onto two coordinates around the true key:

- heatmap of score values
- true key marker
- starting guess marker
- optimizer path overlaid

That would visually prove "the key is at the bottom of a hill." This is probably the single most powerful visual upgrade.

## 4. Make The Three-Act Story Explicit

The page has the content, but a gold-standard teaching demo should feel like a guided lab:

1. **Independence:** rejection sampling makes signatures statistically silent.
2. **Leakage:** one bit converts silence into relations.
3. **Optimization:** relations define a score; local search finds the key.

The current layout is informative, but the learner can still experience it as "lots of sections." Make the app flow through those three acts, with the live engine as the centerpiece of Act 3.

## 5. Add "Try To Break The Claim" Controls

Gold-standard demos invite skepticism. Add toggles like:

- fewer relations
- higher noise
- random/non-ternary relation vectors
- disabled tiers / single-tier climb
- random score instead of relation score
- wrong candidate bound

Then show what fails and why. This would teach the conditions under which the result works, not just the happy path.

## 6. Upgrade Provenance To Publication-Grade

The biggest credibility gap is already named in `BUILD-NOTES.md`: the PDF was not committed and the exact per-parameter-set data has not been re-verified. For gold standard, make provenance airtight:

- commit `2026-472.pdf` if redistribution is acceptable, or commit a checksum plus manual retrieval instructions if not
- replace abstract-only values with exact table references where available
- add per-parameter-set/per-leakage-bit rows once verified
- link every displayed paper number to the note that justifies it
- keep tests guarding all transcribed values

The demo is already honest about this. Gold standard means closing that loop.

## 7. Add A "Paper Scale Replay" Mode

The toy currently runs live and the paper numbers are static. A polished version could add a non-computational replay panel:

- ML-DSA-44 / -65 / -87 tabs
- relation counts from the paper
- leakage bit index, if available
- noise tolerance markers
- `paper-measured, replayed from data` badge

That would let the toy teach the mechanism and the paper replay teach the real scale.

## 8. Add A Tiny Assessment Layer

Not schoolish, just useful. At the end, ask three interactive checks:

- "What does the optimizer know?" Answer: relations, public params, candidate; not the key.
- "What breaks ML-DSA here?" Answer: leakage of masking randomness, not a mathematical break.
- "Why does noise not immediately kill the attack?" Answer: many relations average out flipped bits.

If users can answer those, the demo succeeded.

## 9. Add Shareable Teaching States

The query-string state is already a good start. Add named presets:

- `Clean descent`
- `Too few leaks`
- `Noisy but recoverable`
- `Past toy ceiling`
- `Paper contrast`

Each preset should be deep-linkable and framed as a lesson. That makes the demo usable in talks, classrooms, papers, and social posts.

## 10. Tighten The Main Claim Into One Sentence Everywhere

The sentence to make the north star:

> One leaked masking bit per signature turns ML-DSA's hidden subkey into the unique minimum of a score the attacker can evaluate without the key.

Everything in the demo should orbit that.

## Priority Order

1. No-leakage vs leakage contrast.
2. Score landscape heatmap.
3. Relation microscope.
4. PDF/provenance closure.
5. Paper-scale replay.
6. Failure-mode presets.
7. Assessment prompts.

That combination would make it genuinely gold standard: visually memorable, mathematically honest, adversary-model clear, reproducible, and hard to misinterpret.
