import { expect, test, type Page } from '@playwright/test';

/**
 * Claims gate — asserts what the PAGE says against what the page itself computed.
 *
 * The a11y spec proves the document is reachable; this one proves it is honest.
 * Nothing here hardcodes a verdict that the demo is supposed to reach on its own:
 * every expectation is either derived from another rendered surface (the candidate
 * cells, the relation microscope, the contrast bars, the replay tables) or is a
 * value the page printed in a second place and must agree with.
 *
 * The load-bearing checks are the CROSS-PATH ones — the same quantity computed two
 * ways and required to match:
 *
 *   readout status  ↔  the verify snippet's `res.converged` / `res.best`
 *   readout score   ↔  the candidate note's "N relations violated"
 *   candidate cells ↔  the note's "k / 8 correct" and "L∞ distance d"
 *   contrast bars   ↔  the landscape heatmap cell under the true key
 *   microscope dot  ↔  the rendered a-vector · the rendered candidate cells
 *   replay tables   ↔  the sticky headline band, the overlay and the figure table
 */

const CLEAN = './?seed=1&rels=4000&noise=0';
const SCARCE = './?seed=1&rels=600&noise=0'; // too few leaks — descent stalls short
const NOISY_OK = './?seed=1&rels=6000&noise=10'; // score never hits 0, key still found
const PAST_CEILING = './?seed=1&rels=4000&noise=45'; // past the toy's noise ceiling

/** "1,803" / "+1" / "−2" (U+2212) → number. */
const num = (s: string): number => Number(s.replace(/[,\s]/g, '').replace(/[−–—]/g, '-'));

interface Snapshot {
  status: string;
  score: string;
  tier: string;
  rels: string;
  noise: string;
  seed: string;
  candNote: string;
  cand: number[];
  truth: number[];
  matchCells: number;
  missCells: number;
  verify: string;
  microValues: string[];
  microVerdict: string;
  microVerdictClass: string;
  landscapeCaption: string;
  contrastLeak: Array<{ name: string; value: number }>;
  contrastLeakNote: string;
  contrastNone: Array<{ name: string; value: number }>;
  contrastNoneNote: string;
  playStatus: string;
  activeTier: string;
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const t = (id: string) => document.getElementById(id)?.textContent?.trim() ?? '';
    const cells = (sel: string) =>
      Array.from(document.querySelectorAll(sel)).map((e) =>
        Number((e.textContent ?? '').replace(/[−–—]/g, '-').replace('+', '')),
      );
    const bars = (id: string) =>
      Array.from(document.querySelectorAll(`#${id} .cbar-row`)).map((r) => ({
        name: r.querySelector('.cbar-name')?.textContent?.trim() ?? '',
        value: Number((r.querySelector('.cbar-val')?.textContent ?? '').replace(/,/g, '')),
      }));
    return {
      status: t('ro-status'),
      score: t('ro-score'),
      tier: t('ro-tier'),
      rels: t('ro-rels'),
      noise: t('ro-noise'),
      seed: t('ro-seed'),
      candNote: t('cand-note'),
      cand: cells('#cand-cells .cand-cell'),
      truth: cells('#true-cells .cand-cell'),
      matchCells: document.querySelectorAll('#cand-cells .cand-cell.match').length,
      missCells: document.querySelectorAll('#cand-cells .cand-cell.miss').length,
      verify: t('verify-block'),
      microValues: Array.from(document.querySelectorAll('#micro-grid .mv')).map(
        (e) => e.textContent?.trim() ?? '',
      ),
      microVerdict: t('micro-verdict'),
      microVerdictClass: document.getElementById('micro-verdict')?.className ?? '',
      landscapeCaption: t('landscape-caption'),
      contrastLeak: bars('contrast-leak'),
      contrastLeakNote: t('contrast-leak-note'),
      contrastNone: bars('contrast-none'),
      contrastNoneNote: t('contrast-none-note'),
      playStatus: t('play-status'),
      activeTier: document.querySelector('#tier-stepper .tier-chip.active')?.textContent ?? '',
    };
  });
}

interface CandNote {
  correct: number;
  total: number;
  linf: number;
  violated: number;
  step: number;
  lastStep: number;
}

function parseCandNote(s: string): CandNote {
  const m = s.match(
    /^([\d,]+) \/ ([\d,]+) coordinates correct · L∞ distance ([\d,]+) · ([\d,]+) relations violated \(step ([\d,]+) of ([\d,]+)\)\.$/,
  );
  expect(m, `candidate note did not have the documented shape: ${s}`).not.toBeNull();
  const g = m as RegExpMatchArray;
  return {
    correct: num(g[1]),
    total: num(g[2]),
    linf: num(g[3]),
    violated: num(g[4]),
    step: num(g[5]),
    lastStep: num(g[6]),
  };
}

/** Everything the candidate exhibit claims, checked against the cells it drew. */
function assertCandidateExhibitConsistent(s: Snapshot): CandNote {
  const note = parseCandNote(s.candNote);
  expect(s.cand.length).toBe(s.truth.length);
  expect(note.total).toBe(s.truth.length);
  const correct = s.cand.filter((v, i) => v === s.truth[i]).length;
  const linf = Math.max(...s.cand.map((v, i) => Math.abs(v - s.truth[i])));
  expect(note.correct, 'note "k / n correct" vs the cells actually drawn').toBe(correct);
  expect(note.linf, 'note L∞ vs the cells actually drawn').toBe(linf);
  expect(s.matchCells, 'green "match" cells vs the cells actually drawn').toBe(correct);
  expect(s.missCells, 'red "miss" cells vs the cells actually drawn').toBe(
    s.truth.length - correct,
  );
  expect(note.violated, 'note "N relations violated" vs the headline score').toBe(num(s.score));
  expect(note.step).toBeLessThanOrEqual(note.lastStep);
  return note;
}

/** The verify snippet re-states the run's outcome; it must match the readout. */
function assertVerifySnippetAgreesWithReadout(s: Snapshot): void {
  const conv = s.verify.match(/res\.converged;\s+\/\/ (true|false) \(score reached 0\?\)/);
  expect(conv, `verify snippet has no res.converged line:\n${s.verify}`).not.toBeNull();
  const converged = (conv as RegExpMatchArray)[1] === 'true';
  const best = s.verify.match(/res\.best;\s+\/\/ (===|!==) inst\.secret\s+\((not recovered|recovered)\)/);
  expect(best, `verify snippet has no res.best line:\n${s.verify}`).not.toBeNull();
  const recovered = (best as RegExpMatchArray)[1] === '===';
  expect((best as RegExpMatchArray)[2] === 'recovered').toBe(recovered);

  // converged ⇔ the headline score is 0
  expect(converged, 'snippet res.converged vs the headline score').toBe(num(s.score) === 0);
  // recovered ⇔ the candidate cells equal the true-key cells
  const exact = s.cand.every((v, i) => v === s.truth[i]);
  expect(recovered, 'snippet res.best vs the rendered candidate cells').toBe(exact);
  // and the three-way verdict must be the one implied by those two facts
  const expected = converged && recovered ? 'recovered ✓' : recovered ? 'recovered (noisy)' : 'stalled';
  expect(s.status, 'headline verdict vs the snippet the page printed').toBe(expected);
}

/** The microscope's arithmetic, recomputed from the vectors it rendered. */
function assertMicroscopeConsistent(s: Snapshot): { violated: boolean; observed: number } {
  expect(s.microValues.length).toBe(6);
  // the vector/scalar text uses U+2212 for negatives, and two of the rows carry a
  // trailing parenthetical, so take the leading token of each.
  const aVec = (s.microValues[0].replace(/[−–—]/g, '-').match(/-?\d+/g) ?? []).map(Number);
  expect(aVec.length, `a-vector did not parse: ${s.microValues[0]}`).toBe(s.truth.length);
  const tau = num(s.microValues[1]);
  const candDot = num(s.microValues[2]);
  const trueDot = num(s.microValues[3].split(' ')[0]);
  const predicted = num(s.microValues[4]);
  const observed = num(s.microValues[5].split(' ')[0]);

  const dot = (v: number[]) => aVec.reduce((acc, ai, i) => acc + ai * v[i], 0);
  expect(candDot, '⟨a, candidate⟩ vs a · the rendered candidate cells').toBe(dot(s.cand));
  expect(trueDot, '⟨a, true key⟩ vs a · the rendered true-key cells').toBe(dot(s.truth));
  expect(predicted, 'predicted bit vs ⟨a, candidate⟩ ≥ τ').toBe(candDot >= tau ? 1 : 0);
  expect([0, 1]).toContain(observed);

  const violated = predicted !== observed;
  if (violated) {
    expect(s.microVerdictClass).toContain('bad');
    expect(s.microVerdict).toContain('✗ Violated');
    expect(s.microVerdict).toContain('adds 1 to the score');
  } else {
    expect(s.microVerdictClass).toContain('ok');
    expect(s.microVerdict).toContain('✓ Satisfied');
    expect(s.microVerdict).toContain('adds 0 to the score');
  }
  return { violated, observed };
}

/** The no-leak / leak contrast note must describe the bars drawn above it. */
function assertContrastConsistent(s: Snapshot): void {
  expect(s.contrastNone.length).toBe(s.contrastLeak.length);
  expect(s.contrastNone.every((b) => b.value === 0)).toBe(true);
  expect(s.contrastNoneNote).toContain('Every candidate scores 0');
  expect(s.contrastLeak[0].name).toBe('true key');

  const trueScore = s.contrastLeak[0].value;
  const wrong = s.contrastLeak.slice(1).map((b) => b.value);
  const bestWrong = Math.min(...wrong);
  if (trueScore < bestWrong) {
    expect(s.contrastLeakNote, 'key IS the strict minimum — note must say so').toMatch(
      /every wrong guess scores higher/,
    );
    expect(s.contrastLeakNote).toContain(`best wrong guess ${bestWrong.toLocaleString('en-US')}`);
    expect(s.contrastLeakNote).not.toContain('no longer marks the key');
  } else {
    // Past the toy's noise ceiling the key stops winning — the page must admit it.
    expect(s.contrastLeakNote, 'key is NOT the minimum — note must not claim it is').toContain(
      'The minimum no longer marks the key.',
    );
    expect(s.contrastLeakNote).toContain(`${trueScore.toLocaleString('en-US')}`);
    expect(s.contrastLeakNote).toContain(`${bestWrong.toLocaleString('en-US')}`);
  }
}

/** Hover the heatmap cell that sits exactly on the true key and read its score. */
async function hoverTrueKeyCell(page: Page): Promise<{ i: number; j: number; score: number }> {
  return page.evaluate(() => {
    const c = document.getElementById('landscape-chart') as HTMLCanvasElement;
    const truth = Array.from(document.querySelectorAll('#true-cells .cand-cell')).map((e) =>
      Number((e.textContent ?? '').replace(/[−–—]/g, '-').replace('+', '')),
    );
    const ai = Number((document.getElementById('axis-i') as HTMLSelectElement).value);
    const aj = Number((document.getElementById('axis-j') as HTMLSelectElement).value);
    const BOUND = 3;
    const padL = 48,
      padR = 86,
      padT = 20,
      padB = 44;
    const n = 2 * BOUND + 1;
    const cw = (c.width - padL - padR) / n;
    const ch = (c.height - padT - padB) / n;
    const px = padL + (truth[ai] + BOUND) * cw + cw / 2;
    const py = padT + (n - 1 - (truth[aj] + BOUND)) * ch + ch / 2;
    const rect = c.getBoundingClientRect();
    c.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: rect.left + px * (rect.width / c.width),
        clientY: rect.top + py * (rect.height / c.height),
        bubbles: true,
      }),
    );
    const tip = document.getElementById('landscape-tip') as HTMLElement;
    const m = (tip.textContent ?? '').match(/^\((-?\d+), (-?\d+)\) → ([\d,]+) violations$/);
    if (tip.hidden || !m) throw new Error(`landscape tooltip did not render: ${tip.textContent}`);
    return { i: Number(m[1]), j: Number(m[2]), score: Number(m[3].replace(/,/g, '')) };
  });
}

// ---------------------------------------------------------------------------
// 1. The successful run: every surface tells the same story.
// ---------------------------------------------------------------------------
test('clean descent recovers the key and every surface agrees', async ({ page }) => {
  await page.goto(CLEAN);
  const s = await snap(page);

  // deep-linked settings are the ones being reported on
  expect(s.seed).toBe('1');
  expect(s.rels).toBe('4,000');
  expect(s.noise).toBe('0%');

  // headline verdict — checked against the page's own computation, not a literal
  const note = assertCandidateExhibitConsistent(s);
  expect(note.correct).toBe(note.total); // all 8 coordinates locked in
  expect(num(s.score)).toBe(0); // the score really reached the bottom
  expect(s.status).toBe('recovered ✓');
  assertVerifySnippetAgreesWithReadout(s);

  // "score 0 = the true key" is the whole thesis: at 0 noise the true key must be
  // the strict minimum of the score, and the contrast panel must show that.
  assertContrastConsistent(s);
  expect(s.contrastLeak[0].value).toBe(0);
  expect(Math.min(...s.contrastLeak.slice(1).map((b) => b.value))).toBeGreaterThan(0);

  // tier readout is inside the advertised coarse→fine ladder and matches the stepper
  const [tierNow, tierTotal] = s.tier.split('/').map((x) => num(x));
  expect(tierTotal).toBe(3);
  expect(tierNow).toBeGreaterThanOrEqual(1);
  expect(tierNow).toBeLessThanOrEqual(tierTotal);
  expect(s.activeTier).toContain(`Tier ${tierNow}`);
});

// ---------------------------------------------------------------------------
// 2. Cross-path: the heatmap cell under the true key, the contrast bar for the
//    true key and the verify snippet's score(inst.secret, rels) are one number.
// ---------------------------------------------------------------------------
for (const [label, url] of [
  ['clean', CLEAN],
  ['noisy', NOISY_OK],
  ['past the toy ceiling', PAST_CEILING],
] as const) {
  test(`landscape, contrast and snippet report the same true-key score (${label})`, async ({
    page,
  }) => {
    await page.goto(url);
    const s = await snap(page);
    const cell = await hoverTrueKeyCell(page);

    // the hovered cell is the true key's own coordinates
    expect(cell.i).toBe(s.truth[0]);
    expect(cell.j).toBe(s.truth[1]);

    // …and its score is the score the contrast panel drew for the true key
    expect(cell.score, 'heatmap cell at the key vs the contrast bar for the key').toBe(
      s.contrastLeak[0].value,
    );

    // …and the score the verify snippet quotes for score(inst.secret, rels)
    const m = s.verify.match(/score\(inst\.secret, rels\);\s+\/\/ ([\d,]+) at the true key/);
    expect(m, `verify snippet has no true-key score line:\n${s.verify}`).not.toBeNull();
    expect(num((m as RegExpMatchArray)[1]), 'snippet true-key score vs the heatmap cell').toBe(
      cell.score,
    );

    // the caption's rendered range must contain the cell the user just hovered,
    // and its "◯ true key" label must be honest about whether the key is the min
    const r = s.landscapeCaption.match(/range ([\d,]+)–([\d,]+) violations/);
    expect(r, `caption has no range: ${s.landscapeCaption}`).not.toBeNull();
    const lo = num((r as RegExpMatchArray)[1]);
    const hi = num((r as RegExpMatchArray)[2]);
    expect(cell.score).toBeGreaterThanOrEqual(lo);
    expect(cell.score).toBeLessThanOrEqual(hi);
    if (cell.score === lo) {
      expect(s.landscapeCaption).toContain('◯ true key (minimum)');
    } else {
      expect(s.landscapeCaption).toContain("no longer this slice's minimum");
      expect(s.landscapeCaption).toContain(`◯ true key (${cell.score.toLocaleString('en-US')}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Failure path A — too few leaks: the descent stalls, and the page says why.
// ---------------------------------------------------------------------------
test('scarce leaks stall the descent, and the page explains why', async ({ page }) => {
  await page.goto(SCARCE);
  const s = await snap(page);
  expect(s.rels).toBe('600');

  const note = assertCandidateExhibitConsistent(s);
  expect(s.status).toBe('stalled');
  expect(num(s.score)).toBeGreaterThan(0); // never reached the bottom
  expect(note.correct).toBeLessThan(note.total); // and did not land on the key
  expect(note.linf).toBeGreaterThan(0);
  assertVerifySnippetAgreesWithReadout(s);
  expect(s.verify).toContain('!== inst.secret  (not recovered)');

  // the "why": predicting recovery here is wrong, and the page explains the cause
  await page.locator('.predict-btn[data-guess="yes"]').click();
  const fb = page.locator('#predict-fb');
  await expect(fb).toHaveClass(/incorrect/);
  await expect(fb).toContainText('actually no');
  await expect(fb).toContainText('too few relations to pin the key');

  // …and the run's outcome is echoed on the play status line once it settles
  await expect(page.locator('#play-status')).toHaveText('stalled', { timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// 4. Failure path B — past the toy's noise ceiling.
// ---------------------------------------------------------------------------
test('past the noise ceiling the key is lost, and the exhibits admit it', async ({ page }) => {
  await page.goto(PAST_CEILING);
  const s = await snap(page);
  expect(s.noise).toBe('45%');

  const note = assertCandidateExhibitConsistent(s);
  expect(s.status).toBe('stalled');
  expect(note.correct).toBeLessThan(note.total);
  expect(num(s.score)).toBeGreaterThan(0);
  assertVerifySnippetAgreesWithReadout(s);

  // REGRESSION: the contrast note used to claim "the true key scores lowest …
  // wrong guesses score higher" whenever noise was on, even when a wrong guess
  // scored lower than the key (1,837 vs 1,839 at p = 0.45).
  assertContrastConsistent(s);

  await page.locator('.predict-btn[data-guess="yes"]').click();
  const fb = page.locator('#predict-fb');
  await expect(fb).toHaveClass(/incorrect/);
  await expect(fb).toContainText('under noise the score');
  await expect(page.locator('#play-status')).toHaveText('stalled', { timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// 5. Failure path C — noise keeps the score above 0, but the key IS recovered.
//    All three outcome surfaces must agree (they did not: the play status line
//    branched on `converged` alone and announced "stalled" over a recovery).
// ---------------------------------------------------------------------------
test('a noisy-but-successful run is never reported as stalled', async ({ page }) => {
  await page.goto(NOISY_OK);
  const s = await snap(page);

  const note = assertCandidateExhibitConsistent(s);
  expect(note.correct).toBe(note.total); // the exact subkey was recovered
  expect(num(s.score)).toBeGreaterThan(0); // yet the score never hit 0
  expect(s.status).toBe('recovered (noisy)');
  assertVerifySnippetAgreesWithReadout(s);
  assertContrastConsistent(s);

  await page.locator('#play-btn').click();
  const play = page.locator('#play-status');
  await expect(play).toHaveText('recovered (noisy)', { timeout: 20_000 });
  await expect(page.locator('#ro-status')).toHaveText('recovered (noisy)');
  // the toast only fires on a real recovery, so it must not contradict the line
  await expect(page.locator('#recovered-toast')).toHaveText('✓ Key recovered');
});

// ---------------------------------------------------------------------------
// 6. The descent really descends: stepping through never increases the score.
// ---------------------------------------------------------------------------
test('stepping through the trajectory is monotone non-increasing down to 0', async ({ page }) => {
  await page.goto(CLEAN);
  const settled = await snap(page);
  const last = parseCandNote(settled.candNote).lastStep;
  expect(last).toBeGreaterThan(1);

  await page.locator('#reset-btn').click();
  const scores: number[] = [];
  for (let k = 0; k <= last; k++) {
    const s = await snap(page);
    const note = parseCandNote(s.candNote);
    expect(note.step, 'step counter tracks the playhead').toBe(k);
    expect(note.violated).toBe(num(s.score));
    scores.push(num(s.score));
    if (k < last) await page.locator('#step-btn').click();
  }
  for (let k = 1; k < scores.length; k++) {
    expect(scores[k], `score rose between step ${k - 1} and ${k}`).toBeLessThanOrEqual(
      scores[k - 1],
    );
  }
  expect(scores[0]).toBeGreaterThan(0); // the initial guess is a bad one
  expect(scores[scores.length - 1]).toBe(0); // and the descent ends at the key
  expect(scores[scores.length - 1]).toBe(num(settled.score));
});

// ---------------------------------------------------------------------------
// 7. The relation microscope is arithmetically self-consistent, and "another
//    relation" really finds a violated one while the candidate is still wrong.
// ---------------------------------------------------------------------------
test('the relation microscope agrees with its own vectors', async ({ page }) => {
  await page.goto(CLEAN);
  const clean = await snap(page);
  const first = assertMicroscopeConsistent(clean);
  // A converged clean run violates nothing, so the shown relation is satisfied.
  expect(first.violated).toBe(false);
  // With no noise the leaked bit is honest: it is exactly ⟨a, true key⟩ ≥ τ.
  const aVec = (clean.microValues[0].replace(/[−–—]/g, '-').match(/-?\d+/g) ?? []).map(Number);
  const tau = num(clean.microValues[1]);
  const trueDot = aVec.reduce((acc, ai, i) => acc + ai * clean.truth[i], 0);
  expect(first.observed).toBe(trueDot >= tau ? 1 : 0);

  // A stalled run still violates relations, and the microscope can show one.
  await page.goto(SCARCE);
  await page.locator('#micro-next').click();
  const stalled = await snap(page);
  const shown = assertMicroscopeConsistent(stalled);
  expect(shown.violated, 'a stalled run must have a violated relation to show').toBe(true);
  expect(stalled.microVerdict).toContain('wrong side of this relation');
  await expect(page.locator('#micro-which')).toHaveText(/relation #\d+ of 600/);
});

// ---------------------------------------------------------------------------
// 8. Click-to-start: the heatmap really seeds the climb where you clicked, and
//    from that corner the clean run still rolls all the way down.
// ---------------------------------------------------------------------------
test('clicking a heatmap cell starts the climb there and still recovers', async ({ page }) => {
  await page.goto(CLEAN);
  const before = await snap(page);
  expect(before.status).toBe('recovered ✓');

  await page.evaluate(() => {
    const c = document.getElementById('landscape-chart') as HTMLCanvasElement;
    const padL = 48,
      padR = 86,
      padT = 20,
      padB = 44;
    const n = 7;
    const cw = (c.width - padL - padR) / n;
    const ch = (c.height - padT - padB) / n;
    // bottom-left cell = (-3, -3), the far corner of the search box
    const px = padL + cw / 2;
    const py = padT + (n - 1) * ch + ch / 2;
    const rect = c.getBoundingClientRect();
    c.dispatchEvent(
      new MouseEvent('click', {
        clientX: rect.left + px * (rect.width / c.width),
        clientY: rect.top + py * (rect.height / c.height),
        bubbles: true,
      }),
    );
  });

  await expect(page.locator('#ro-status')).toHaveText('recovered ✓', { timeout: 20_000 });
  const after = await snap(page);
  assertCandidateExhibitConsistent(after);
  assertVerifySnippetAgreesWithReadout(after);

  // rewind to step 0 and confirm the start really is the cell that was clicked
  await page.locator('#reset-btn').click();
  const start = await snap(page);
  expect(parseCandNote(start.candNote).step).toBe(0);
  expect(start.cand[0]).toBe(-3);
  expect(start.cand[1]).toBe(-3);
});

// ---------------------------------------------------------------------------
// 9. Run-N-trials: the success rate, the percentage and the caption must agree.
// ---------------------------------------------------------------------------
for (const [label, url, expectAnySuccess] of [
  ['clean', CLEAN, true],
  ['past the toy ceiling', PAST_CEILING, false],
] as const) {
  test(`trials panel is internally consistent (${label})`, async ({ page }) => {
    await page.goto(url);
    await page.selectOption('#trials-n', '25');
    await page.locator('#trials-run').click();
    await expect(page.locator('#trials-out')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#trials-status')).toHaveText('', { timeout: 30_000 });

    const out = await page.evaluate(() => ({
      num: document.getElementById('trials-rate-num')?.textContent?.trim() ?? '',
      label: document.getElementById('trials-rate-label')?.textContent?.trim() ?? '',
      cap: document.getElementById('trials-cap')?.textContent?.trim() ?? '',
      selected: (document.getElementById('trials-n') as HTMLSelectElement).value,
      rels: document.getElementById('ro-rels')?.textContent?.trim() ?? '',
      noise: document.getElementById('ro-noise')?.textContent?.trim() ?? '',
    }));

    const m = out.num.match(/^(\d+)\/(\d+)$/);
    expect(m, `success counter did not parse: ${out.num}`).not.toBeNull();
    const successes = Number((m as RegExpMatchArray)[1]);
    const trials = Number((m as RegExpMatchArray)[2]);

    // parts vs whole: the trials run is the number the selector asked for
    expect(trials).toBe(Number(out.selected));
    expect(successes).toBeLessThanOrEqual(trials);
    // the rendered percentage is this run's own numerator/denominator
    expect(out.label).toContain(`(${Math.round((successes / trials) * 100)}%)`);
    // …at the settings the readout is showing
    expect(out.label).toContain(`at ${out.rels} relations`);
    expect(out.label).toContain(`${out.noise.replace('%', '')}% noise`);

    if (expectAnySuccess) {
      expect(successes).toBeGreaterThan(0);
      expect(out.cap).toContain(`across the ${successes} successful trials`);
      expect(out.cap).toMatch(/median ≈ \d+/);
    } else {
      expect(successes).toBe(0);
      expect(out.cap).toContain('No trials recovered the key');
    }
  });
}

// ---------------------------------------------------------------------------
// 10. The paper overlay: the headline band, the overlay, the figure table and
//     the Table 2 grid caption must all be derived from the replay tables.
// ---------------------------------------------------------------------------
test('paper-scale figures agree across every surface that prints them', async ({ page }) => {
  await page.goto(CLEAN);

  const tabs = page.locator('#replay-tabs button');
  const tabCount = await tabs.count();
  expect(tabCount).toBe(3);

  interface Row {
    set: string;
    byIndex: Record<number, number>;
    factor: number | null;
    damm: number | null;
    ours: number | null;
  }
  const rows: Row[] = [];
  for (let i = 0; i < tabCount; i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    rows.push(
      await page.evaluate(() => {
        const panel = document.getElementById('replay-panel') as HTMLElement;
        const heads = Array.from(panel.querySelectorAll('thead th')).map(
          (e) => e.textContent?.trim() ?? '',
        );
        const cells = Array.from(panel.querySelectorAll('tbody td')).map(
          (e) => e.textContent?.trim() ?? '',
        );
        const byIndex: Record<number, number> = {};
        heads.slice(1).forEach((h, k) => {
          byIndex[Number(h.replace('j=', ''))] = Number(cells[k + 1].replace(/,/g, ''));
        });
        const set = (panel.querySelector('dd')?.textContent ?? '').split(' ·')[0].trim();
        const red = (panel.textContent ?? '').match(
          /([\d,]+) → ([\d,]+) relations = ([\d.]+)× fewer/,
        );
        return {
          set,
          byIndex,
          damm: red ? Number(red[1].replace(/,/g, '')) : null,
          ours: red ? Number(red[2].replace(/,/g, '')) : null,
          factor: red ? Number(red[3]) : null,
        };
      }),
    );
  }

  // every reduction factor is the arithmetic of the two counts printed beside it
  const factors: number[] = [];
  for (const r of rows) {
    expect(r.damm, `${r.set} has no reduction line`).not.toBeNull();
    const computed = (r.damm as number) / (r.ours as number);
    expect(
      Math.abs((r.factor as number) - computed),
      `${r.set}: "${r.factor}× fewer" vs ${r.damm}/${r.ours} = ${computed.toFixed(2)}`,
    ).toBeLessThan(0.1);
    factors.push(r.factor as number);
  }

  // the sticky headline band is the min/max of those factors
  await expect(page.locator('#sh-reduction')).toHaveText(
    `${Math.floor(Math.min(...factors))}–${Math.floor(Math.max(...factors))}× fewer`,
  );
  await expect(page.locator('#ov-paper-reduction')).toHaveText(
    `${Math.floor(Math.min(...factors))}–${Math.floor(Math.max(...factors))}× fewer`,
  );

  // …and the relation band is the min/max of every Table 2 cell across all sets
  const all = rows.flatMap((r) => Object.entries(r.byIndex).map(([j, v]) => ({ set: r.set, j: Number(j), v })));
  expect(all.length).toBe(12);
  const lo = all.reduce((a, b) => (b.v < a.v ? b : a));
  const hi = all.reduce((a, b) => (b.v > a.v ? b : a));
  await expect(page.locator('#ov-paper-rels')).toHaveText(
    `${lo.v.toLocaleString('en-US')}–${hi.v.toLocaleString('en-US')}`,
  );
  await expect(page.locator('#sh-relations')).toHaveText(
    `${Math.round(lo.v / 1000)}k–${Math.round(hi.v / 1000)}k`,
  );
  await expect(page.locator('#figure-table')).toContainText(
    `${lo.v.toLocaleString('en-US')}–${hi.v.toLocaleString('en-US')}`,
  );

  // the Table 2 grid caption names which cell is the min and which is the max —
  // it must name the ones the tables actually hold
  const cap = (await page.locator('#paper-grid-cap').textContent()) ?? '';
  expect(cap).toContain(`global minimum (${lo.v.toLocaleString('en-US')}, ${lo.set} j=${lo.j})`);
  expect(cap).toContain(`global maximum (${hi.v.toLocaleString('en-US')}, ${hi.set} j=${hi.j})`);
});

// ---------------------------------------------------------------------------
// 11. The toy's measured noise ceiling is one number, printed in two places.
// ---------------------------------------------------------------------------
test('the toy noise ceiling in the chart caption matches the overlay', async ({ page }) => {
  await page.goto(CLEAN);
  const cap = (await page.locator('#noise-caption').textContent()) ?? '';
  const m = cap.match(/ceiling sits near (\d+)% here/);
  expect(m, `noise caption did not name a ceiling: ${cap}`).not.toBeNull();
  const ceiling = Number((m as RegExpMatchArray)[1]);
  await expect(page.locator('#ov-toy-noise')).toHaveText(`≈ ${ceiling}% (this toy's own)`);
  // the toy's own ceiling is badged as the toy's, and below the paper's 45%
  expect(ceiling).toBeGreaterThan(0);
  expect(ceiling).toBeLessThan(45);
  expect(cap).toContain("paper's measured tolerance is ~45%");
  await expect(page.locator('#sh-noise')).toHaveText('45%');

  // and the toy's own relation count is badged as the toy's, not the paper's
  await expect(page.locator('#ov-toy-rels')).toHaveText(/\(this toy's own\)|> grid max/);
});

// ---------------------------------------------------------------------------
// 12. Every teaching preset reaches the state its own tooltip promises.
// ---------------------------------------------------------------------------
test('each teaching preset lands in a self-consistent state', async ({ page }) => {
  await page.goto(CLEAN);
  const presets = page.locator('#teaching-presets button');
  const count = await presets.count();
  expect(count).toBe(4);

  for (let i = 0; i < count; i++) {
    const label = (await presets.nth(i).textContent())?.trim() ?? '';
    await presets.nth(i).click();
    // the preset drives a full run; wait for the playhead to settle
    await expect(page.locator('#play-status')).toHaveText(/recovered ✓|recovered \(noisy\)|stalled/, {
      timeout: 20_000,
    });
    const s = await snap(page);
    assertCandidateExhibitConsistent(s);
    assertVerifySnippetAgreesWithReadout(s);
    assertContrastConsistent(s);
    expect(s.playStatus, `${label}: play status vs the readout verdict`).toBe(s.status);
    await expect(presets.nth(i)).toHaveClass(/active/);
  }
});
