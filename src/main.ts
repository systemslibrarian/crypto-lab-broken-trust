/**
 * main.ts — DOM glue for crypto-lab-broken-trust.
 *
 * No model math lives here: the toy engine is entirely in ./model.ts (pure,
 * deterministic, testable) and the paper's numbers are in ./paperData.ts
 * (transcribed, cited). This file only reads controls, runs the engine, and draws.
 *
 * The demo KNOWS the toy secret (it generated it) so it can show how close the
 * candidate is — but the hill-climb itself never receives the secret.
 */
import './styles.css';
import {
  makeRng,
  makeToyInstance,
  makeRelations,
  hillClimb,
  recovers,
  relationsToConverge,
  runTrials,
  score,
  predictedBit,
  TOY_N,
  TOY_Q,
  TOY_ETA,
  TOY_BOUND,
  DEFAULT_TIERS,
  type ToyInstance,
  type HillClimbResult,
  type Relation,
} from './model';
import {
  RELATIONS_TO_RECOVER,
  REDUCTION_FACTOR,
  NOISE_TOLERANCE_MAX_P,
  NOISY_RELATIONS,
  PRIOR_WORK,
  ML_DSA_SETS,
  LEAKAGE_INDICES,
} from './paperData';

// ---------------------------------------------------------------------------
// Theme toggle (Part A) — self-contained, writes localStorage['theme'].
// ---------------------------------------------------------------------------
function setupThemeToggle(): void {
  const btn = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  if (!btn) return;
  const apply = (theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme);
    const goingTo = theme === 'dark' ? 'light' : 'dark';
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', `Switch to ${goingTo} theme`);
  };
  const current =
    (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
  apply(current);
  btn.addEventListener('click', () => {
    const now =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', now);
    } catch {
      /* ignore storage failures */
    }
    apply(now);
    drawDescent();
    drawNoise();
    drawPaperBars();
    drawPaperGrid();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
const signed = (x: number) => (x >= 0 ? `+${x}` : `−${Math.abs(x)}`);
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Deterministic per-seed sub-seeds for relations and the climb start.
const relSeedFor = (seed: number) => (seed * 100 + 13) >>> 0;
const climbSeedFor = (seed: number) => (seed * 7 + 1) >>> 0;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let seed = 1;
let relCount = 4000;
let noiseP = 0; // 0..0.5
let instance: ToyInstance = makeToyInstance(seed);
let relations: Relation[] = [];
// When the user clicks the landscape to set a starting point, we pin an explicit
// start vector here; null means "use the seeded random guess". Cleared on any
// slider change so the deterministic seeded run returns.
let userStart: number[] | null = null;
let result: HillClimbResult = runEngine();
let cursor = 0; // index into result.trajectory
let microIdx = 0; // selected relation in the microscope
let axisI = 0; // landscape x coordinate
let axisJ = 1; // landscape y coordinate

function runEngine(): HillClimbResult {
  relations = makeRelations(instance, relCount, noiseP, relSeedFor(seed));
  return hillClimb(relations, {
    n: instance.n,
    q: instance.q,
    bound: TOY_BOUND,
    tiers: DEFAULT_TIERS,
    seed: climbSeedFor(seed),
    ...(userStart ? { start: userStart } : {}),
  });
}

const dotProduct = (a: number[], v: number[]) => a.reduce((s, ai, i) => s + ai * v[i], 0);
const candidateAt = () => result.trajectory[cursor].candidate;

// A few alternate descents (different seeded starts, same relations) so the single
// deterministic run can be seen against natural variation. Off by default.
let showAltRuns = false;
let altRuns: HillClimbResult[] = [];
function computeAltRuns(): void {
  altRuns = [];
  for (let k = 1; k <= 4; k++) {
    altRuns.push(
      hillClimb(relations, {
        n: instance.n,
        q: instance.q,
        bound: TOY_BOUND,
        tiers: DEFAULT_TIERS,
        seed: (climbSeedFor(seed) + k * 7919) >>> 0,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// URL state (?seed=&rels=&noise=) — deep-linkable
// ---------------------------------------------------------------------------
function readUrlState(): void {
  const p = new URLSearchParams(location.search);
  const s = Number(p.get('seed'));
  const r = Number(p.get('rels'));
  const np = Number(p.get('noise')); // integer percent 0..50
  if (Number.isInteger(s) && s >= 1 && s <= 200) seed = s;
  if (Number.isInteger(r) && r >= 200 && r <= 8000) relCount = Math.round(r / 200) * 200;
  if (Number.isFinite(np) && np >= 0 && np <= 50) noiseP = np / 100;
}

function writeUrlState(): void {
  const p = new URLSearchParams();
  p.set('seed', String(seed));
  p.set('rels', String(relCount));
  p.set('noise', String(Math.round(noiseP * 100)));
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

// ---------------------------------------------------------------------------
// Recompute the engine and reset the playhead
// ---------------------------------------------------------------------------
function recompute(cursorTo: 'start' | 'end'): void {
  instance = makeToyInstance(seed);
  result = runEngine();
  cursor = cursorTo === 'end' ? result.trajectory.length - 1 : 0;
}

// ---------------------------------------------------------------------------
// Render: controls + readout
// ---------------------------------------------------------------------------
function syncControls(): void {
  el<HTMLInputElement>('rels-slider').value = String(relCount);
  el<HTMLInputElement>('noise-slider').value = String(Math.round(noiseP * 100));
  el<HTMLInputElement>('seed-slider').value = String(seed);
  el('rels-out').textContent = fmt(relCount);
  el('noise-out').textContent = `${Math.round(noiseP * 100)}%`;
  el('seed-out').textContent = String(seed);
}

function renderReadout(): void {
  const pt = result.trajectory[cursor];
  const atEnd = cursor === result.trajectory.length - 1;
  el('ro-seed').textContent = String(seed);
  el('ro-rels').textContent = fmt(relCount);
  el('ro-noise').textContent = `${Math.round(noiseP * 100)}%`;
  el('ro-tier').textContent = `${pt.tier + 1} / ${result.tiers}`;

  const scoreEl = el('ro-score');
  scoreEl.textContent = fmt(pt.score);
  scoreEl.className = 'stat-value big';

  const statusEl = el('ro-status');
  if (!atEnd) {
    statusEl.textContent = 'descending…';
    statusEl.className = 'stat-value';
  } else if (result.converged && recovers(result, instance)) {
    statusEl.textContent = 'recovered ✓';
    statusEl.className = 'stat-value converged';
    scoreEl.classList.add('converged');
  } else if (recovers(result, instance)) {
    statusEl.textContent = 'recovered (noisy)';
    statusEl.className = 'stat-value converged';
  } else {
    statusEl.textContent = 'stalled';
    statusEl.className = 'stat-value stalled';
    scoreEl.classList.add('stalled');
  }
}

// ---------------------------------------------------------------------------
// Render: candidate vs true toy key
// ---------------------------------------------------------------------------
// Candidate/true cells are built ONCE and updated in place (not innerHTML-rebuilt
// every frame) so a "lock-in" pulse can animate when a coordinate first matches.
let trueCells: HTMLSpanElement[] = [];
let candCells: HTMLSpanElement[] = [];
let prevMatch: boolean[] = [];

function buildCandidateCells(): void {
  const trueBox = el('true-cells');
  const candBox = el('cand-cells');
  trueBox.innerHTML = '';
  candBox.innerHTML = '';
  trueCells = [];
  candCells = [];
  prevMatch = [];
  for (let i = 0; i < instance.secret.length; i++) {
    const t = document.createElement('span');
    t.className = 'cand-cell true-cell';
    t.textContent = signed(instance.secret[i]);
    trueBox.appendChild(t);
    trueCells.push(t);
    const c = document.createElement('span');
    c.className = 'cand-cell';
    candBox.appendChild(c);
    candCells.push(c);
    prevMatch.push(false);
  }
}

function renderCandidate(): void {
  const truth = instance.secret;
  const cand = result.trajectory[cursor].candidate;
  if (candCells.length !== truth.length) buildCandidateCells();

  let correct = 0;
  let linf = 0;
  for (let i = 0; i < truth.length; i++) {
    const ok = cand[i] === truth[i];
    if (ok) correct++;
    linf = Math.max(linf, Math.abs(cand[i] - truth[i]));
    const cell = candCells[i];
    cell.textContent = signed(cand[i]);
    cell.classList.toggle('match', ok);
    cell.classList.toggle('miss', !ok);
    // Pulse the cell the moment a coordinate locks onto its true value.
    if (ok && !prevMatch[i] && !prefersReducedMotion()) {
      cell.classList.remove('lock');
      void cell.offsetWidth; // reflow so the animation restarts
      cell.classList.add('lock');
    }
    prevMatch[i] = ok;
  }

  const pt = result.trajectory[cursor];
  el('cand-note').textContent =
    `${correct} / ${TOY_N} coordinates correct · L∞ distance ${linf} · ` +
    `${fmt(pt.score)} relations violated (step ${pt.step} of ${result.trajectory.length - 1}).`;
}

// ---------------------------------------------------------------------------
// Render: descent chart (score vs step)
// ---------------------------------------------------------------------------
function drawDescent(): void {
  const canvas = el<HTMLCanvasElement>('descent-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  const traj = result.trajectory;
  const lastStep = Math.max(1, traj.length - 1);
  const altInit = showAltRuns ? altRuns.map((r) => r.trajectory[0].score) : [];
  const yMax = Math.max(1, traj[0].score, ...altInit) * 1.05;

  const xPix = (i: number) => padL + (i / lastStep) * plotW;
  const yPix = (s: number) => padT + plotH - (s / yMax) * plotH;

  const text = cssVar('--text');
  const muted = cssVar('--text-muted');
  const border = cssVar('--border');
  const accent = cssVar('--accent');
  const ok = cssVar('--ok');

  // axes
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // y ticks
  ctx.fillStyle = muted;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const yv = (yMax / 4) * i;
    const y = yPix(yv);
    ctx.fillText(fmt(yv), padL - 8, y + 4);
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(16, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.fillText('score (relations violated)', 0, 0);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.fillText('optimization step (accepted moves)', padL + plotW / 2, H - 8);

  // tier bands (background) — coarse → fine refinement phases. Tier is
  // non-decreasing along the trajectory, so each tier occupies a contiguous span.
  const tierWord = (t: number, total: number) =>
    t === 0 ? 'coarse' : t === total - 1 ? 'fine' : 'refine';
  ctx.font = '11px sans-serif';
  let bandStart = 0;
  for (let i = 1; i <= traj.length; i++) {
    const ended = i === traj.length || traj[i].tier !== traj[bandStart].tier;
    if (ended) {
      const tier = traj[bandStart].tier;
      const x0 = xPix(bandStart);
      const x1 = xPix(i === traj.length ? lastStep : i);
      ctx.fillStyle = tierColor(tier);
      ctx.globalAlpha = 0.09;
      ctx.fillRect(x0, padT, Math.max(1, x1 - x0), plotH);
      ctx.globalAlpha = 1;
      // boundary line + label
      if (bandStart > 0) {
        ctx.strokeStyle = muted;
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x0, padT);
        ctx.lineTo(x0, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      const cxMid = (x0 + x1) / 2;
      ctx.fillText(`Tier ${tier + 1} · ${tierWord(tier, result.tiers)}`, cxMid, padT + 12);
      bandStart = i;
    }
  }

  // generic curve drawer over an arbitrary trajectory (normalized to its own length)
  const drawTraj = (
    t: Array<{ score: number }>,
    upto: number,
    color: string,
    width: number,
    alpha: number,
  ) => {
    if (t.length < 2) return;
    const last = Math.max(1, t.length - 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      const x = padL + (i / last) * plotW;
      const y = yPix(t[i].score);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // alternate runs (faded), behind the main curve
  if (showAltRuns) {
    for (const r of altRuns) {
      drawTraj(r.trajectory, r.trajectory.length - 1, muted, 1.5, 0.35);
    }
  }

  drawTraj(traj, traj.length - 1, border, 2, 0.5); // full main path, faint
  drawTraj(traj, cursor, accent, 2.5, 1); // descended-so-far, bright

  // playhead dot
  const hx = xPix(cursor);
  const hy = yPix(traj[cursor].score);
  ctx.fillStyle = traj[cursor].score === 0 ? ok : accent;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // zero line label when converged
  if (result.converged) {
    ctx.fillStyle = ok;
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillText('score 0 = true key', padL + 6, yPix(0) - 6);
  }
}

// ---------------------------------------------------------------------------
// Noise explorer — toy recovery rate vs p (computed live)
// ---------------------------------------------------------------------------
interface NoisePoint { p: number; rate: number; }
let noiseCurve: NoisePoint[] = [];
let toyCeiling = 0;

function computeNoiseCurve(): void {
  const TRIALS = 6;
  const count = Math.min(relCount, 6000); // bound the cost
  const pts: NoisePoint[] = [];
  for (let pp = 0; pp <= 50; pp += 5) {
    const p = pp / 100;
    let rec = 0;
    for (let t = 0; t < TRIALS; t++) {
      const inst = makeToyInstance(seed + t * 17);
      const rels = makeRelations(inst, count, p, relSeedFor(seed + t * 17));
      const res = hillClimb(rels, {
        n: inst.n,
        q: inst.q,
        bound: TOY_BOUND,
        tiers: DEFAULT_TIERS,
        seed: climbSeedFor(seed + t * 31),
      });
      if (recovers(res, inst)) rec++;
    }
    pts.push({ p, rate: rec / TRIALS });
  }
  noiseCurve = pts;
  // Toy ceiling: the largest p whose recovery rate is still >= 0.5.
  toyCeiling = 0;
  for (const pt of pts) if (pt.rate >= 0.5) toyCeiling = pt.p;
}

function drawNoise(): void {
  const canvas = el<HTMLCanvasElement>('noise-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx || noiseCurve.length === 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 56;
  const padR = 20;
  const padT = 20;
  const padB = 46;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  const xPix = (p: number) => padL + (p / 0.5) * plotW;
  const yPix = (r: number) => padT + plotH - r * plotH;

  const muted = cssVar('--text-muted');
  const border = cssVar('--border');
  const accentToy = cssVar('--accent-toy');
  const accentPaper = cssVar('--accent-paper');
  const text = cssVar('--text');

  // axes
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const r = i / 4;
    const y = yPix(r);
    ctx.fillText(`${Math.round(r * 100)}%`, padL - 8, y + 4);
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  for (let pp = 0; pp <= 50; pp += 10) {
    const x = xPix(pp / 100);
    ctx.fillStyle = muted;
    ctx.fillText(`${pp}%`, x, padT + plotH + 18);
  }
  ctx.fillText('leak-bit noise p', padL + plotW / 2, H - 8);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = muted;
  ctx.fillText('toy recovery rate', 0, 0);
  ctx.restore();

  // paper 45% marker
  const drawMarker = (p: number, color: string, label: string, labelY: number) => {
    const x = xPix(p);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.textAlign = x > padL + plotW * 0.7 ? 'right' : 'left';
    ctx.fillText(label, x + (x > padL + plotW * 0.7 ? -6 : 6), labelY);
  };
  drawMarker(NOISE_TOLERANCE_MAX_P.value, accentPaper, 'paper ~45%', padT + 14);
  if (toyCeiling > 0) drawMarker(toyCeiling, accentToy, `toy ceiling ~${Math.round(toyCeiling * 100)}%`, padT + 30);

  // curve
  ctx.strokeStyle = accentToy;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  noiseCurve.forEach((pt, i) => {
    const x = xPix(pt.p);
    const y = yPix(pt.rate);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = accentToy;
  for (const pt of noiseCurve) {
    ctx.beginPath();
    ctx.arc(xPix(pt.p), yPix(pt.rate), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // legend
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillText(`● toy recovery (${Math.min(relCount, 6000).toLocaleString()} relations, 6 trials/point)`, padL + 8, padT + plotH - 8);

  el('noise-caption').textContent =
    `Toy recovery rate vs leak-bit noise p, at ${Math.min(relCount, 6000).toLocaleString()} relations ` +
    `(6 trials per point). The toy's own ceiling sits near ${Math.round(toyCeiling * 100)}% here; the ` +
    `paper's measured tolerance is ~45% — a different scale, not a contradiction.`;
}

// ---------------------------------------------------------------------------
// Overlay + sources + verify (static-ish, depends on current seed for toy side)
// ---------------------------------------------------------------------------
function renderOverlayToySide(): void {
  el('ov-toy-dim').textContent = `toy vector, n = ${TOY_N}, coeffs in [−${TOY_ETA}, ${TOY_ETA}]`;
  const probe = relationsToConverge(instance, 0, 11);
  el('ov-toy-rels').textContent =
    probe.relations !== null ? `≈ ${fmt(probe.relations)} (this toy's own)` : '> grid max';
  el('ov-toy-noise').textContent = `≈ ${Math.round(toyCeiling * 100)}% (this toy's own)`;
}

function renderSources(): void {
  const rows: Array<[string, string, string, string]> = [
    [
      'Informative relations to recover',
      `${fmt(RELATIONS_TO_RECOVER.min)}–${fmt(RELATIONS_TO_RECOVER.max)}`,
      RELATIONS_TO_RECOVER.provenance,
      RELATIONS_TO_RECOVER.cite,
    ],
    [
      'Reduction over prior state of the art',
      `${Math.floor(REDUCTION_FACTOR.min)}–${Math.floor(REDUCTION_FACTOR.max)}×`,
      REDUCTION_FACTOR.provenance,
      REDUCTION_FACTOR.cite,
    ],
    [
      'Noise tolerance (bit-flip p)',
      `up to ~${Math.round(NOISE_TOLERANCE_MAX_P.value * 100)}%`,
      NOISE_TOLERANCE_MAX_P.provenance,
      NOISE_TOLERANCE_MAX_P.cite,
    ],
    ...PRIOR_WORK.map(
      (w) => ['Premise (prior work)', w.authors, 'paper-intro', w.contribution] as [string, string, string, string],
    ),
    [
      'Parameter sets spanned',
      ML_DSA_SETS.map((s) => s.label).join(', '),
      'FIPS 204',
      'Standard ML-DSA parameter sets (named for context; band is the paper\'s aggregate).',
    ],
  ];
  const tbody = document.querySelector('#figure-table tbody') as HTMLTableSectionElement;
  tbody.innerHTML = rows
    .map(([fig, val, prov, cite]) => {
      const badge = prov.startsWith('paper')
        ? `<span class="badge badge-paper">${prov}</span>`
        : `<span class="badge">${prov}</span>`;
      return `<tr><td>${fig}</td><td><strong>${val}</strong></td><td>${badge}</td><td class="muted">${cite}</td></tr>`;
    })
    .join('');

  el('toy-params').innerHTML = [
    `dimension n = <code>${TOY_N}</code> (real ML-DSA s₁/s₂ blocks are 256-wide)`,
    `coefficient bound η = <code>${TOY_ETA}</code>; search box [−${TOY_BOUND}, ${TOY_BOUND}]`,
    `coefficient modulus q = <code>${TOY_Q}</code> (flavor; the toy leak is a threshold comparison)`,
    `refinement tiers = <code>${DEFAULT_TIERS}</code> (coarse → fine)`,
    `relation = public ternary <code>a ∈ {−1,0,+1}⁸</code> + public threshold <code>τ</code>; leaked bit = <code>⟨a,s⟩ ≥ τ</code>`,
  ]
    .map((s) => `<li>${s}</li>`)
    .join('');

  el('verify-block').textContent =
    `import { makeToyInstance, makeRelations, hillClimb, score } from './src/model';\n\n` +
    `const inst = makeToyInstance(${seed});            // a toy subkey the demo generated\n` +
    `const rels = makeRelations(inst, ${relCount}, ${noiseP}, ${relSeedFor(seed)});\n` +
    `score(inst.secret, rels);                 // 0 exactly at the true key (noiseless)\n` +
    `const res = hillClimb(rels, { n: ${TOY_N}, q: ${TOY_Q}, bound: ${TOY_BOUND}, seed: ${climbSeedFor(seed)} });\n` +
    `res.converged;                            // descended to score 0\n` +
    `res.best;                                 // === inst.secret  (recovered)\n\n` +
    `// Paper (ePrint 2026/472), transcribed in paperData.ts — NOT computed here:\n` +
    `//   relations to recover : ${fmt(RELATIONS_TO_RECOVER.min)}–${fmt(RELATIONS_TO_RECOVER.max)}  (Table 2)\n` +
    `//   reduction vs prior   : ${Math.floor(REDUCTION_FACTOR.min)}–${Math.floor(REDUCTION_FACTOR.max)}×  (Table 3: 37.0 / 42.8 / 68.5)\n` +
    `//   noise tolerance      : up to ~${Math.round(NOISE_TOLERANCE_MAX_P.value * 100)}%  (Table 4, ${fmt(NOISY_RELATIONS.min)}–${fmt(NOISY_RELATIONS.max)} relations)`;
}

function renderStickyHeadline(): void {
  const redDisp = `${Math.floor(REDUCTION_FACTOR.min)}–${Math.floor(REDUCTION_FACTOR.max)}× fewer`;
  el('sh-relations').textContent = `${Math.round(RELATIONS_TO_RECOVER.min / 1000)}k–${Math.round(RELATIONS_TO_RECOVER.max / 1000)}k`;
  el('sh-reduction').textContent = redDisp;
  el('sh-noise').textContent = `${Math.round(NOISE_TOLERANCE_MAX_P.value * 100)}%`;
  el('ov-paper-rels').textContent = `${fmt(RELATIONS_TO_RECOVER.min)}–${fmt(RELATIONS_TO_RECOVER.max)}`;
  el('ov-paper-reduction').textContent = redDisp;
  el('ov-paper-noise').textContent = `feasible up to ~${Math.round(NOISE_TOLERANCE_MAX_P.value * 100)}% bit-flip p`;
}

// ---------------------------------------------------------------------------
// Teaching presets — named, deep-linkable lesson states
// ---------------------------------------------------------------------------
interface Preset { label: string; seed: number; rels: number; noise: number; note: string; }
const PRESETS: Preset[] = [
  { label: 'Clean descent', seed: 1, rels: 4000, noise: 0, note: 'Enough noiseless leaks: the score rolls all the way to 0 and the key is recovered.' },
  { label: 'Too few leaks', seed: 1, rels: 600, noise: 0, note: 'Scarce leaks: the descent stalls just short of 0 — not enough constraints to pin the key.' },
  { label: 'Noisy but recoverable', seed: 1, rels: 6000, noise: 0.1, note: 'Score never reaches 0 under noise, yet many relations still recover the exact key.' },
  { label: 'Past toy ceiling', seed: 1, rels: 4000, noise: 0.45, note: 'Beyond the toy\'s noise ceiling: the descent stalls high and the key is lost.' },
];

function presetMatches(p: Preset): boolean {
  return p.seed === seed && p.rels === relCount && Math.abs(p.noise - noiseP) < 1e-9;
}

function buildTeachingPresets(): void {
  const box = el('teaching-presets');
  box.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.textContent = p.label;
    b.title = p.note;
    b.addEventListener('click', () => {
      stopPlaying();
      userStart = null;
      seed = p.seed;
      relCount = p.rels;
      noiseP = p.noise;
      recompute('start');
      onEngineChanged();
      renderAll();
      el('play-status').textContent = p.note;
      play();
      writeUrlState();
    });
    box.appendChild(b);
  }
}

function markActivePreset(): void {
  const buttons = Array.from(el('teaching-presets').children) as HTMLButtonElement[];
  buttons.forEach((b, i) => b.classList.toggle('active', presetMatches(PRESETS[i])));
}

// ---------------------------------------------------------------------------
// Relation microscope — one relation as a concrete object
// ---------------------------------------------------------------------------
function renderMicroscope(): void {
  if (relations.length === 0) return;
  if (microIdx >= relations.length) microIdx = 0;
  const r = relations[microIdx];
  const cand = candidateAt();
  const candDot = dotProduct(r.a, cand);
  const trueDot = dotProduct(r.a, instance.secret);
  const predicted = predictedBit(cand, r.a, r.tau);
  const violated = predicted !== r.bit;

  el('micro-which').textContent = `relation #${microIdx + 1} of ${fmt(relations.length)}`;
  el('micro-grid').innerHTML = [
    ['public vector a', `<code>[${r.a.map((x) => signed(x)).join(', ')}]</code>`],
    ['public threshold τ', `<code>${signed(r.tau)}</code>`],
    ['⟨a, candidate⟩', `<code>${signed(candDot)}</code>`],
    ['⟨a, true key⟩', `<code>${signed(trueDot)}</code> <span class="muted">(known only because the demo made the key)</span>`],
    ['predicted bit (candidate ≥ τ?)', `<code>${predicted}</code>`],
    ['observed leaked bit', `<code>${r.bit}</code>${noiseP > 0 ? ' <span class="muted">(may be noise-flipped)</span>' : ''}`],
  ]
    .map(([k, v]) => `<span class="mk">${k}</span><span class="mv">${v}</span>`)
    .join('');

  const verdict = el('micro-verdict');
  if (violated) {
    verdict.className = 'micro-verdict bad';
    verdict.textContent = '✗ Violated — this candidate is on the wrong side of this relation. It adds 1 to the score.';
  } else {
    verdict.className = 'micro-verdict ok';
    verdict.textContent = '✓ Satisfied — this candidate agrees with this leaked bit. It adds 0 to the score.';
  }
}

function setupMicroscope(): void {
  el<HTMLButtonElement>('micro-next').addEventListener('click', () => {
    if (relations.length === 0) return;
    const cand = candidateAt();
    // Prefer the next relation this candidate VIOLATES (more instructive); else just advance.
    let found = -1;
    for (let k = 1; k <= relations.length; k++) {
      const idx = (microIdx + k) % relations.length;
      const r = relations[idx];
      if (predictedBit(cand, r.a, r.tau) !== r.bit) { found = idx; break; }
    }
    microIdx = found >= 0 ? found : (microIdx + 1) % relations.length;
    renderMicroscope();
  });
}

// ---------------------------------------------------------------------------
// Score landscape — heatmap over two coordinates around the true key
// ---------------------------------------------------------------------------
let landscapeGrid: number[][] = []; // [jIndex][iIndex] -> score
let landscapeMin = 0;
let landscapeMax = 1;
const coordValues = Array.from({ length: 2 * TOY_BOUND + 1 }, (_, k) => k - TOY_BOUND); // [-B..B]

function computeLandscape(): void {
  const base = instance.secret.slice(); // fix other coords at the TRUE key
  landscapeGrid = [];
  landscapeMin = Infinity;
  landscapeMax = -Infinity;
  for (const vj of coordValues) {
    const row: number[] = [];
    for (const vi of coordValues) {
      const c = base.slice();
      c[axisI] = vi;
      c[axisJ] = vj;
      const s = score(c, relations);
      row.push(s);
      if (s < landscapeMin) landscapeMin = s;
      if (s > landscapeMax) landscapeMax = s;
    }
    landscapeGrid.push(row);
  }
  if (landscapeMax === landscapeMin) landscapeMax = landscapeMin + 1;
}

function buildAxisSelectors(): void {
  const mk = (sel: HTMLSelectElement, current: number) => {
    sel.innerHTML = '';
    for (let i = 0; i < TOY_N; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `coord ${i}`;
      if (i === current) o.selected = true;
      sel.appendChild(o);
    }
  };
  const si = el<HTMLSelectElement>('axis-i');
  const sj = el<HTMLSelectElement>('axis-j');
  mk(si, axisI);
  mk(sj, axisJ);
  si.addEventListener('change', () => {
    axisI = Number(si.value);
    if (axisI === axisJ) { axisJ = (axisJ + 1) % TOY_N; mk(sj, axisJ); }
    computeLandscape();
    drawLandscape();
  });
  sj.addEventListener('change', () => {
    axisJ = Number(sj.value);
    if (axisI === axisJ) { axisI = (axisI + 1) % TOY_N; mk(si, axisI); }
    computeLandscape();
    drawLandscape();
  });
}

// Viridis-style ramp (colorblind-safe): t=0 (low score / the valley) = dark purple,
// t=1 (high score) = yellow. Replaces the old red→green scale.
const VIRIDIS: Array<[number, number, number]> = [
  [68, 1, 84], // #440154
  [59, 82, 139], // #3b528b
  [33, 145, 140], // #21918c
  [94, 201, 98], // #5ec962
  [253, 231, 37], // #fde725
];
function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x));
  const f = x - i;
  const a = VIRIDIS[i];
  const b = VIRIDIS[i + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Color for a trajectory segment ending in a given tier (tier 0 coarse → fine). */
function tierColor(tier: number): string {
  const vars = ['--accent-2', '--accent', '--accent-toy'];
  return cssVar(vars[Math.min(tier, vars.length - 1)]);
}

/** Plot geometry of the last landscape draw, for click/hover hit-testing. */
let landscapeGeo = { padL: 48, padT: 20, cw: 0, ch: 0, n: 0, plotW: 0, plotH: 0 };

function drawLandscape(): void {
  const canvas = el<HTMLCanvasElement>('landscape-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx || landscapeGrid.length === 0) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 48;
  const padR = 86; // room for the vertical legend
  const padT = 20;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  const n = coordValues.length;
  const cw = plotW / n;
  const ch = plotH / n;
  landscapeGeo = { padL, padT, cw, ch, n, plotW, plotH };
  // cell (i across, j up). j=0 at bottom.
  const cellX = (i: number) => padL + i * cw;
  const cellY = (j: number) => padT + (n - 1 - j) * ch;

  const text = cssVar('--text');
  const muted = cssVar('--text-muted');

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = landscapeGrid[j][i];
      const t = (s - landscapeMin) / (landscapeMax - landscapeMin);
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(cellX(i), cellY(j), cw - 1, ch - 1);
    }
  }

  // axis ticks
  ctx.fillStyle = muted;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) ctx.fillText(String(coordValues[i]), cellX(i) + cw / 2, padT + plotH + 16);
  ctx.textAlign = 'right';
  for (let j = 0; j < n; j++) ctx.fillText(String(coordValues[j]), padL - 6, cellY(j) + ch / 2 + 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.fillText(`coord ${axisI}`, padL + plotW / 2, H - 6);
  ctx.save();
  ctx.translate(12, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`coord ${axisJ}`, 0, 0);
  ctx.restore();

  const idxOf = (v: number) => v + TOY_BOUND;
  const markCenter = (vi: number, vj: number) =>
    [cellX(idxOf(vi)) + cw / 2, cellY(idxOf(vj)) + ch / 2] as const;

  // --- the rolling-downhill trajectory, projected onto these two coords ---
  const traj = result.trajectory;
  if (cursor > 0) {
    for (let k = 1; k <= cursor; k++) {
      const [x0, y0] = markCenter(traj[k - 1].candidate[axisI], traj[k - 1].candidate[axisJ]);
      const [x1, y1] = markCenter(traj[k].candidate[axisI], traj[k].candidate[axisJ]);
      const age = k / cursor; // 0 oldest .. 1 newest
      ctx.strokeStyle = tierColor(traj[k].tier);
      ctx.globalAlpha = 0.25 + 0.6 * age;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // true key (the bowl's bottom)
  const [tx, ty] = markCenter(instance.secret[axisI], instance.secret[axisJ]);
  ctx.strokeStyle = cssVar('--accent-paper');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tx, ty, Math.min(cw, ch) * 0.32, 0, Math.PI * 2);
  ctx.stroke();

  // start guess (projected)
  const start = traj[0].candidate;
  const [sx, sy] = markCenter(start[axisI], start[axisJ]);
  ctx.fillStyle = cssVar('--text-muted');
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fill();

  // current candidate = the rolling particle
  const cand = candidateAt();
  const [cx, cy] = markCenter(cand[axisI], cand[axisJ]);
  const atKey = cand[axisI] === instance.secret[axisI] && cand[axisJ] === instance.secret[axisJ];
  ctx.fillStyle = atKey ? cssVar('--ok') : cssVar('--accent');
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- legend (vertical viridis gradient) ---
  const lgX = W - padR + 22;
  const lgW = 14;
  const lgTop = padT;
  const lgH = plotH;
  const steps = 40;
  for (let s = 0; s < steps; s++) {
    const t = 1 - s / (steps - 1); // top = max (t=1), bottom = min (t=0)
    ctx.fillStyle = heatColor(t);
    ctx.fillRect(lgX, lgTop + (s / steps) * lgH, lgW, lgH / steps + 1);
  }
  ctx.strokeStyle = cssVar('--border');
  ctx.lineWidth = 1;
  ctx.strokeRect(lgX, lgTop, lgW, lgH);
  ctx.fillStyle = muted;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${fmt(landscapeMax)}`, lgX + lgW + 4, lgTop + 8);
  ctx.fillText('score', lgX + lgW + 4, lgTop + lgH / 2);
  ctx.fillText(`${fmt(landscapeMin)}`, lgX + lgW + 4, lgTop + lgH);
  // mark the true-key minimum on the legend
  ctx.fillStyle = cssVar('--accent-paper');
  ctx.fillText('◀ key', lgX + lgW + 4, lgTop + lgH - 12);

  el('landscape-caption').textContent =
    `Score over coords ${axisI} and ${axisJ} (others fixed at the true key) — a 2-D slice of the ` +
    `8-D landscape. Dark = low score (the valley), yellow = high. ◯ true key (minimum), ` +
    `● rolling candidate, • start. The line is the descent path projected onto these two axes. ` +
    `Click a cell to start the climb there; range ${fmt(landscapeMin)}–${fmt(landscapeMax)} violations.`;
}

/** Map a pointer event to a landscape cell {i, j}, or null if outside the grid. */
function landscapeCellFromEvent(e: MouseEvent): { i: number; j: number } | null {
  const canvas = el<HTMLCanvasElement>('landscape-chart');
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const { padL, padT, cw, ch, n, plotW, plotH } = landscapeGeo;
  if (cw === 0 || px < padL || px > padL + plotW || py < padT || py > padT + plotH) return null;
  const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / cw)));
  const j = Math.max(0, Math.min(n - 1, n - 1 - Math.floor((py - padT) / ch)));
  return { i, j };
}

// Keyboard-friendly alternative to clicking the heatmap: start the climb from a
// fresh seeded point. Deterministic per (seed, counter), no ambient randomness.
let randStartCounter = 0;
function climbFromRandomStart(): void {
  stopPlaying();
  const rng = makeRng((seed * 100003 + randStartCounter++ * 911 + 7) >>> 0);
  userStart = Array.from({ length: instance.n }, () => rng.int(-TOY_BOUND, TOY_BOUND));
  recompute('start');
  onEngineChanged();
  renderAll();
  play();
  writeUrlState();
}

function setupLandscapeInteraction(): void {
  const canvas = el<HTMLCanvasElement>('landscape-chart');
  canvas.style.cursor = 'crosshair';
  const tip = el('landscape-tip');
  el<HTMLButtonElement>('rand-start').addEventListener('click', climbFromRandomStart);

  // Click a cell → start the climb there (overrides the seeded start) and play.
  canvas.addEventListener('click', (e) => {
    const cell = landscapeCellFromEvent(e);
    if (!cell) return;
    stopPlaying();
    const vi = coordValues[cell.i];
    const vj = coordValues[cell.j];
    const base = (userStart ?? result.trajectory[0].candidate).slice();
    base[axisI] = vi;
    base[axisJ] = vj;
    userStart = base;
    recompute('start');
    onEngineChanged();
    renderAll();
    play();
    writeUrlState();
  });

  // Hover → read the exact score at that cell.
  canvas.addEventListener('mousemove', (e) => {
    const cell = landscapeCellFromEvent(e);
    if (!cell || landscapeGrid.length === 0) {
      tip.hidden = true;
      return;
    }
    const s = landscapeGrid[cell.j][cell.i];
    tip.hidden = false;
    tip.textContent = `(${coordValues[cell.i]}, ${coordValues[cell.j]}) → ${fmt(s)} violations`;
    const wrap = canvas.parentElement as HTMLElement;
    const wrect = wrap.getBoundingClientRect();
    tip.style.left = `${e.clientX - wrect.left + 12}px`;
    tip.style.top = `${e.clientY - wrect.top + 12}px`;
  });
  canvas.addEventListener('mouseleave', () => {
    tip.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// No-leak vs leak contrast
// ---------------------------------------------------------------------------
function renderContrast(): void {
  // The true key plus 5 perturbations of increasing distance (nudge first k coords).
  const truth = instance.secret;
  const candidates: Array<{ name: string; vec: number[]; isTrue: boolean }> = [
    { name: 'true key', vec: truth.slice(), isTrue: true },
  ];
  for (let k = 1; k <= 5; k++) {
    const v = truth.slice();
    for (let i = 0; i < k; i++) v[i] = Math.min(TOY_BOUND, v[i] + 1);
    candidates.push({ name: `guess ${k}`, vec: v, isTrue: false });
  }

  const withLeak = candidates.map((c) => ({ ...c, s: score(c.vec, relations) }));
  const maxLeak = Math.max(1, ...withLeak.map((c) => c.s));

  const noneHtml = candidates
    .map(
      (c) =>
        `<div class="cbar-row"><span class="cbar-name">${c.name}</span>` +
        `<span class="cbar-track"><span class="cbar-fill zero" style="width:0%"></span></span>` +
        `<span class="cbar-val">0</span></div>`,
    )
    .join('');
  el('contrast-none').innerHTML = noneHtml;
  el('contrast-none-note').textContent =
    'Every candidate scores 0 — with no relations there is nothing to violate. The key is invisible.';

  el('contrast-leak').innerHTML = withLeak
    .map((c) => {
      const w = Math.round((c.s / maxLeak) * 100);
      const cls = c.isTrue ? 'true' : '';
      return (
        `<div class="cbar-row"><span class="cbar-name">${c.name}</span>` +
        `<span class="cbar-track"><span class="cbar-fill ${cls}" style="width:${w}%"></span></span>` +
        `<span class="cbar-val">${fmt(c.s)}</span></div>`
      );
    })
    .join('');
  const trueScore = withLeak[0].s;
  el('contrast-leak-note').textContent =
    noiseP > 0
      ? `The true key scores lowest (${fmt(trueScore)} — nonzero because of ${Math.round(noiseP * 100)}% noise), and wrong guesses score higher. The minimum still marks the key.`
      : `The true key scores 0 and every wrong guess scores higher. Leaks made the key the unique minimum.`;
}

// ---------------------------------------------------------------------------
// Run-N-trials — success rate + steps-to-recovery histogram
// ---------------------------------------------------------------------------
const trialsSeedFor = (s: number) => (s * 131 + 17) >>> 0;

function drawTrialsHist(steps: number[]): void {
  const canvas = el<HTMLCanvasElement>('trials-hist');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 40;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);
  const muted = cssVar('--text-muted');
  const accent = cssVar('--accent');
  const border = cssVar('--border');

  if (steps.length === 0) {
    ctx.fillStyle = muted;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('no successful recoveries at these settings', W / 2, H / 2);
    return;
  }

  const maxStep = Math.max(...steps);
  const bins = Math.min(20, Math.max(6, maxStep));
  const counts = new Array(bins).fill(0);
  for (const s of steps) {
    const b = Math.min(bins - 1, Math.floor((s / (maxStep + 1)) * bins));
    counts[b]++;
  }
  const maxCount = Math.max(...counts, 1);
  const bw = plotW / bins;

  // axes
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = accent;
  for (let b = 0; b < bins; b++) {
    const h = (counts[b] / maxCount) * plotH;
    ctx.fillRect(padL + b * bw + 1, padT + plotH - h, bw - 2, h);
  }

  ctx.fillStyle = muted;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('0', padL, padT + plotH + 16);
  ctx.fillText(`${maxStep}`, padL + plotW, padT + plotH + 16);
  ctx.fillText('steps to recover the key →', padL + plotW / 2, H - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${maxCount}`, padL - 6, padT + 10);
}

function runTrialsPanel(): void {
  const n = Number(el<HTMLSelectElement>('trials-n').value) || 25;
  const status = el('trials-status');
  status.textContent = `running ${n} trials…`;
  el<HTMLButtonElement>('trials-run').disabled = true;
  // Defer so the "running…" status paints before the synchronous compute.
  window.setTimeout(() => {
    const r = runTrials(relCount, noiseP, { trials: n, seed: trialsSeedFor(seed) });
    el('trials-out').hidden = false;
    const pct = Math.round(r.successRate * 100);
    el('trials-rate-num').textContent = `${r.successes}/${r.trials}`;
    el('trials-rate-label').innerHTML =
      `keys recovered (<strong>${pct}%</strong>) at ${fmt(relCount)} relations, ` +
      `${Math.round(noiseP * 100)}% noise`;
    const med = r.steps.length
      ? [...r.steps].sort((a, b) => a - b)[Math.floor(r.steps.length / 2)]
      : 0;
    el('trials-cap').textContent =
      r.steps.length > 0
        ? `Steps-to-recover across the ${r.successes} successful trials (median ≈ ${med}). ` +
          `This is the toy's own success rate — the methodological mirror of the paper's 10/10 criterion, not a paper number.`
        : `No trials recovered the key at these settings — try more relations or less noise.`;
    drawTrialsHist(r.steps);
    status.textContent = '';
    el<HTMLButtonElement>('trials-run').disabled = false;
  }, 30);
}

function setupTrials(): void {
  el<HTMLButtonElement>('trials-run').addEventListener('click', runTrialsPanel);
}

// ---------------------------------------------------------------------------
// Paper-scale replay tabs
// ---------------------------------------------------------------------------
let replaySel = 0;
function buildReplay(): void {
  const tabs = el('replay-tabs');
  tabs.innerHTML = '';
  ML_DSA_SETS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'replay-tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === replaySel));
    b.textContent = s.label;
    b.addEventListener('click', () => {
      replaySel = i;
      renderReplay();
    });
    tabs.appendChild(b);
  });
  renderReplay();
}

function renderReplay(): void {
  const tabs = Array.from(el('replay-tabs').children) as HTMLButtonElement[];
  tabs.forEach((b, i) => b.setAttribute('aria-selected', String(i === replaySel)));
  const s = ML_DSA_SETS[replaySel];

  // Table 2 — exact minimum informative relations by leakage index j.
  const t2Head = LEAKAGE_INDICES.map((j) => `<th>j=${j}</th>`).join('');
  const t2Row = LEAKAGE_INDICES.map((j) => `<td>${fmt(s.relationsByIndex[j])}</td>`).join('');
  const exactTable =
    `<table class="replay-table"><caption>Exact setting — min informative relations (Table 2)</caption>` +
    `<thead><tr><th>leakage index</th>${t2Head}</tr></thead>` +
    `<tbody><tr><td>relations</td>${t2Row}</tr></tbody></table>`;

  // Table 3 — high-leakage reduction vs Damm et al. [5].
  const hl = s.highLeakage;
  const reductionLine = hl
    ? `<dt>Reduction vs Damm et al. [5] (j ≥ ${hl.jAtLeast})</dt>` +
      `<dd>${fmt(hl.dammRelations)} → ${fmt(hl.ourRelations)} relations = <strong>${hl.factor}× fewer</strong></dd>`
    : '';

  // Table 4 — noisy p = 0.45.
  const noisyKeys = Object.keys(s.noisyByIndex ?? {});
  const noisyLine = noisyKeys.length
    ? `<dt>Noisy setting (p = 0.45, Table 4)</dt><dd>` +
      noisyKeys.map((j) => `j=${j}: ${fmt((s.noisyByIndex as Record<string, number>)[j])}`).join(' · ') +
      ` relations</dd>`
    : `<dt>Noisy setting (p = 0.45)</dt><dd class="muted">not yet evaluated for ${s.label} — preliminary results cover ML-DSA-44 &amp; -87 only (paper §6.2)</dd>`;

  el('replay-panel').innerHTML =
    `<dl>` +
    `<dt>Parameter set</dt><dd>${s.label} · NIST level ${s.nistLevel} · (k, l) = (${s.k}, ${s.l}) · η = ${s.eta} · τ = ${s.tau} · β = τ·η = ${s.beta} · γ₁ = 2^${s.gamma1Exp} <span class="muted">[Table 1]</span></dd>` +
    reductionLine +
    noisyLine +
    `</dl>` +
    exactTable +
    `<p class="muted">${s.cite}. <span class="badge badge-paper">paper-measured</span> The 5,000–35,000 headline is the min/max across all sets and indices here (min ${fmt(RELATIONS_TO_RECOVER.min)} = ML-DSA-87 j=6; max ${fmt(RELATIONS_TO_RECOVER.max)} = ML-DSA-65 j=9). Noisy recovery costs ${fmt(NOISY_RELATIONS.min)}–${fmt(NOISY_RELATIONS.max)} relations.</p>`;
}

// ---------------------------------------------------------------------------
// Paper results, visualized — reduction bars (log scale) + Table 2 grid
// ---------------------------------------------------------------------------
function fmtCompact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1)}k`;
  return String(v);
}

function drawPaperBars(): void {
  const canvas = el<HTMLCanvasElement>('paper-bars');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 56;
  const padR = 16;
  const padT = 30;
  const padB = 68;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);
  const muted = cssVar('--text-muted');
  const border = cssVar('--border');
  const text = cssVar('--text');
  const cPrior = cssVar('--accent-2');
  const cOurs = cssVar('--accent');
  const logMin = 3; // 1,000
  const logMax = 6.5; // ~3.16M
  const bottom = padT + plotH;
  const yPix = (v: number) =>
    padT + plotH - ((Math.max(logMin, Math.log10(v)) - logMin) / (logMax - logMin)) * plotH;

  // log gridlines
  ctx.font = '11px sans-serif';
  for (let e = 3; e <= 6; e++) {
    const y = yPix(10 ** e);
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.fillText(fmtCompact(10 ** e), padL - 6, y + 4);
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, bottom);
  ctx.lineTo(padL + plotW, bottom);
  ctx.stroke();

  const sets = ML_DSA_SETS.filter((s) => s.highLeakage);
  const groupW = plotW / sets.length;
  const barW = groupW * 0.26;
  sets.forEach((s, gi) => {
    const hl = s.highLeakage!;
    const cx = padL + groupW * gi + groupW / 2;
    const x1 = cx - barW - 4;
    const x2 = cx + 4;
    ctx.fillStyle = cPrior;
    ctx.fillRect(x1, yPix(hl.dammRelations), barW, bottom - yPix(hl.dammRelations));
    ctx.fillStyle = cOurs;
    ctx.fillRect(x2, yPix(hl.ourRelations), barW, bottom - yPix(hl.ourRelations));
    ctx.fillStyle = muted;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmtCompact(hl.dammRelations), x1 + barW / 2, yPix(hl.dammRelations) - 4);
    ctx.fillText(fmtCompact(hl.ourRelations), x2 + barW / 2, yPix(hl.ourRelations) - 4);
    ctx.fillStyle = text;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${hl.factor}×`, cx, padT - 12);
    ctx.fillStyle = muted;
    ctx.font = '11px sans-serif';
    ctx.fillText(s.label, cx, bottom + 18);
    ctx.fillText(`j ≥ ${hl.jAtLeast}`, cx, bottom + 32);
  });

  // legend (bottom center)
  const lY = bottom + 52;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  const legX = padL + plotW / 2 - 110;
  ctx.fillStyle = cPrior;
  ctx.fillRect(legX, lY - 10, 12, 12);
  ctx.fillStyle = text;
  ctx.fillText('Damm et al. [5]', legX + 18, lY);
  ctx.fillStyle = cOurs;
  ctx.fillRect(legX + 130, lY - 10, 12, 12);
  ctx.fillStyle = text;
  ctx.fillText('This attack', legX + 148, lY);
}

function drawPaperGrid(): void {
  const canvas = el<HTMLCanvasElement>('paper-grid');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 92;
  const padR = 16;
  const padT = 28;
  const padB = 16;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);
  const muted = cssVar('--text-muted');
  const text = cssVar('--text');
  const sets = ML_DSA_SETS;
  const cols = LEAKAGE_INDICES;
  const cw = plotW / cols.length;
  const ch = plotH / sets.length;
  const all = sets.flatMap((s) => cols.map((j) => s.relationsByIndex[j]));
  const mn = Math.min(...all);
  const mx = Math.max(...all);

  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  cols.forEach((j, ci) => ctx.fillText(`j = ${j}`, padL + cw * ci + cw / 2, padT - 10));

  sets.forEach((s, ri) => {
    ctx.textAlign = 'right';
    ctx.fillStyle = text;
    ctx.font = '12px sans-serif';
    ctx.fillText(s.label, padL - 8, padT + ch * ri + ch / 2 + 4);
    cols.forEach((j, ci) => {
      const v = s.relationsByIndex[j];
      const t = (v - mn) / (mx - mn);
      const x = padL + cw * ci;
      const y = padT + ch * ri;
      ctx.fillStyle = heatColor(t);
      ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      if (v === mn || v === mx) {
        ctx.strokeStyle = v === mn ? cssVar('--ok') : cssVar('--accent-paper');
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
      }
      ctx.fillStyle = t > 0.6 ? '#1f2328' : '#e6edf3';
      ctx.textAlign = 'center';
      ctx.font = '12px sans-serif';
      ctx.fillText(fmtCompact(v), x + cw / 2, y + ch / 2 + 4);
    });
  });

  el('paper-grid-cap').textContent =
    'Table 2 — darker = fewer relations needed. Green ring = global minimum (5,000, ML-DSA-87 j=6); ' +
    'gold ring = global maximum (35,000, ML-DSA-65 j=9).';
}

// ---------------------------------------------------------------------------
// Assessment — three self-check questions
// ---------------------------------------------------------------------------
interface Quiz { q: string; options: Array<{ t: string; correct: boolean }>; why: string; }
const QUIZZES: Quiz[] = [
  {
    q: 'What does the optimizer actually know?',
    options: [
      { t: 'The leaked relations, the public params, and its current candidate — but not the key', correct: true },
      { t: 'The full secret key the whole time', correct: false },
      { t: 'Nothing — it brute-forces every possibility', correct: false },
    ],
    why: 'The verification score is computed from relations + public data only. That key-free score is what makes local search possible.',
  },
  {
    q: 'What actually "breaks" ML-DSA in this attack?',
    options: [
      { t: 'Side-channel leakage of the masking randomness — not a flaw in the math', correct: true },
      { t: 'A weakness in the underlying lattice problem', correct: false },
      { t: 'Fault injection / glitching the chip', correct: false },
    ],
    why: 'With no leakage there is no attack. The standard\'s math is intact; this is an implementation/leakage result, and it is not a fault attack.',
  },
  {
    q: 'Why does noise not immediately kill the attack?',
    options: [
      { t: 'Many relations jointly constrain the key, so flipped bits average out', correct: true },
      { t: 'An error-correcting code removes the noise first', correct: false },
      { t: 'The key is re-randomized between signatures', correct: false },
    ],
    why: 'Each flipped bit only nudges the count-based score; over thousands of relations the minimum stays near the true key — which is why the paper still works at 45%.',
  },
];

function setupAssessment(): void {
  const box = el('quiz');
  box.innerHTML = '';
  QUIZZES.forEach((quiz, qi) => {
    const block = document.createElement('div');
    block.className = 'quiz-block';
    block.innerHTML =
      `<p class="quiz-q">${qi + 1}. ${quiz.q}</p>` +
      `<div class="sc-options" role="group" aria-label="Answer choices"></div>` +
      `<div class="sc-feedback" aria-live="polite"></div>`;
    const opts = block.querySelector('.sc-options') as HTMLDivElement;
    const fb = block.querySelector('.sc-feedback') as HTMLDivElement;
    quiz.options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-opt';
      b.textContent = opt.t;
      b.addEventListener('click', () => {
        Array.from(opts.children).forEach((c) => c.classList.remove('correct', 'incorrect'));
        if (opt.correct) {
          b.classList.add('correct');
          fb.className = 'sc-feedback correct';
          fb.textContent = `Correct — ${quiz.why}`;
        } else {
          b.classList.add('incorrect');
          (Array.from(opts.children).find(
            (c) => quiz.options[Array.from(opts.children).indexOf(c)].correct,
          ) as HTMLElement | undefined)?.classList.add('correct');
          fb.className = 'sc-feedback incorrect';
          fb.textContent = `Not quite — ${quiz.why}`;
        }
      });
      opts.appendChild(b);
    });
    box.appendChild(block);
  });
}

// ---------------------------------------------------------------------------
// Engine-change hook — recompute the heavier engine-dependent panels once
// (NOT per animation frame).
// ---------------------------------------------------------------------------
function onEngineChanged(): void {
  microIdx = 0;
  buildCandidateCells(); // true values change with the instance; resets lock-pulse state
  computeLandscape();
  computeAltRuns();
  renderContrast();
  resetPredict(); // settings changed — the previous guess no longer applies
}

// ---------------------------------------------------------------------------
// Tier stepper — shows coarse → fine progress, highlighting the active tier
// ---------------------------------------------------------------------------
function tierWordFor(t: number, total: number): string {
  return t === 0 ? 'coarse' : t === total - 1 ? 'fine' : 'refine';
}

function buildTierStepper(): void {
  const box = el('tier-stepper');
  box.innerHTML = '';
  for (let t = 0; t < DEFAULT_TIERS; t++) {
    const chip = document.createElement('span');
    chip.className = 'tier-chip';
    chip.dataset.tier = String(t);
    chip.textContent = `Tier ${t + 1} · ${tierWordFor(t, DEFAULT_TIERS)}`;
    box.appendChild(chip);
    if (t < DEFAULT_TIERS - 1) {
      const arr = document.createElement('span');
      arr.className = 'tier-arrow';
      arr.setAttribute('aria-hidden', 'true');
      arr.textContent = '→';
      box.appendChild(arr);
    }
  }
}

function renderTierStepper(): void {
  const activeTier = result.trajectory[cursor].tier;
  const chips = Array.from(el('tier-stepper').querySelectorAll('.tier-chip')) as HTMLElement[];
  for (const c of chips) {
    const t = Number(c.dataset.tier);
    c.classList.toggle('active', t === activeTier);
    c.classList.toggle('done', t < activeTier);
  }
}

// ---------------------------------------------------------------------------
// Predict — turn passive watching into an active guess before playing
// ---------------------------------------------------------------------------
function predictWhy(willConverge: boolean): string {
  if (willConverge) {
    return 'enough clean relations pin the key — the score rolls all the way to 0 and the exact subkey is recovered. Watch it descend.';
  }
  return noiseP > 0
    ? 'under noise the score can’t reach exactly 0 (flipped bits always violate), though the key may still be recovered — watch where it settles.'
    : 'too few relations to pin the key here, so the descent stalls above 0. Add relations and try again.';
}

function resetPredict(): void {
  const fb = document.getElementById('predict-fb');
  if (fb) {
    fb.textContent = '';
    fb.className = 'predict-fb';
  }
  document.querySelectorAll('.predict-btn').forEach((x) => x.classList.remove('chosen'));
}

function setupPredict(): void {
  const fb = el('predict-fb');
  const btns = Array.from(document.querySelectorAll('.predict-btn')) as HTMLButtonElement[];
  for (const b of btns) {
    b.addEventListener('click', () => {
      const guess = b.dataset.guess === 'yes';
      const willConverge = result.converged; // the deterministic outcome of this run
      const correct = guess === willConverge;
      btns.forEach((x) => x.classList.toggle('chosen', x === b));
      fb.className = `predict-fb ${correct ? 'correct' : 'incorrect'}`;
      fb.innerHTML = correct
        ? `✓ Correct — ${predictWhy(willConverge)}`
        : `✗ Not quite — actually ${willConverge ? 'yes' : 'no'}: ${predictWhy(willConverge)}`;
      play();
    });
  }
}

// ---------------------------------------------------------------------------
// Contextual help — (?) dots toggle a small popover with an explanation
// ---------------------------------------------------------------------------
function setupHelp(): void {
  const dots = Array.from(document.querySelectorAll('.help-dot')) as HTMLButtonElement[];
  const closeAll = () => {
    for (const d of dots) {
      const pop = d.nextElementSibling as HTMLElement | null;
      if (pop) {
        pop.hidden = true;
        d.setAttribute('aria-expanded', 'false');
      }
    }
  };
  for (const d of dots) {
    const pop = d.nextElementSibling as HTMLElement | null;
    if (!pop) continue;
    d.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasOpen = !pop.hidden;
      closeAll();
      if (!wasOpen) {
        pop.hidden = false;
        d.setAttribute('aria-expanded', 'true');
      }
    });
  }
  document.addEventListener('click', () => closeAll());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
}

// ---------------------------------------------------------------------------
// Guided tour — Independence → Leakage → Optimization, driving the demo itself
// ---------------------------------------------------------------------------
interface TourStep { sel: string; title: string; body: string; before?: () => void }

function startCleanDescent(): void {
  // Click the first teaching preset ("Clean descent"): sets seed=1, 4000 relations,
  // 0 noise, and plays the descent.
  const first = el('teaching-presets').children[0] as HTMLButtonElement | undefined;
  first?.click();
}

const TOUR: TourStep[] = [
  {
    sel: '#tldr',
    title: 'Welcome',
    body: 'ML-DSA hides its key behind rejection sampling. Leak one bit of the per-signature randomness and recovery becomes "roll downhill". Six quick stops — leave anytime (Esc).',
  },
  {
    sel: '#mechanism',
    title: '1 · Independence',
    body: 'Normally every released signature is statistically independent of the secret key. That independence — from rejection sampling — is the whole defense.',
  },
  {
    sel: '#microscope',
    title: '2 · One leaked bit = one relation',
    body: 'Learn a single bit of the masking randomness and, with the public signature data, you get one yes/no constraint on the subkey. Here is exactly one such relation.',
  },
  {
    sel: '#landscape',
    title: '3 · The key is the bottom of a hill',
    body: 'Stack thousands of relations and the true key becomes the unique minimum of a score you can evaluate WITHOUT the key. Dark = low score (the valley). Click any cell to start a climb there.',
  },
  {
    sel: '#descent',
    title: '4 · Roll downhill',
    body: 'Multi-tier hill-climbing descends that score to the key — big coarse steps first, then fine settling. Watching a clean run now…',
    before: startCleanDescent,
  },
  {
    sel: '#noise-explorer',
    title: '5 · Noise',
    body: 'The attack tolerates flipped leak bits — to a point. The toy stalls past its own ceiling (~20–30%); the paper measured recovery up to 45%.',
  },
  {
    sel: '#overlay',
    title: '6 · Toy vs. paper',
    body: 'The toy shows the dynamics; the paper measured the real scale — 5,000–35,000 relations, 37–68× fewer than prior work. That is the honest bridge. Explore freely!',
  },
];
let tourIdx = -1;

function clearTourHighlight(): void {
  document.querySelectorAll('.tour-highlight').forEach((e) => e.classList.remove('tour-highlight'));
}
function showTourStep(): void {
  clearTourHighlight();
  const step = TOUR[tourIdx];
  try {
    step.before?.();
  } catch {
    /* a driving action failing must not break the tour */
  }
  const target = document.querySelector(step.sel) as HTMLElement | null;
  if (target) {
    target.classList.add('tour-highlight');
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
  el('tour').hidden = false;
  el('tour-step').textContent = `${tourIdx + 1} / ${TOUR.length}`;
  el('tour-title').textContent = step.title;
  el('tour-body').textContent = step.body;
  el<HTMLButtonElement>('tour-prev').disabled = tourIdx === 0;
  el('tour-next').textContent = tourIdx === TOUR.length - 1 ? 'Done ✓' : 'Next →';
  el<HTMLButtonElement>('tour-next').focus();
}
function startTour(): void {
  el('tour-nudge').hidden = true;
  tourIdx = 0;
  showTourStep();
}
function endTour(): void {
  clearTourHighlight();
  el('tour').hidden = true;
  tourIdx = -1;
  try {
    localStorage.setItem('tour-seen', '1');
  } catch {
    /* ignore */
  }
  el<HTMLButtonElement>('tour-start').focus();
}
function tourNext(): void {
  if (tourIdx >= TOUR.length - 1) endTour();
  else {
    tourIdx++;
    showTourStep();
  }
}
function tourPrev(): void {
  if (tourIdx > 0) {
    tourIdx--;
    showTourStep();
  }
}
function setupTour(): void {
  el<HTMLButtonElement>('tour-start').addEventListener('click', startTour);
  el<HTMLButtonElement>('tour-next').addEventListener('click', tourNext);
  el<HTMLButtonElement>('tour-prev').addEventListener('click', tourPrev);
  el<HTMLButtonElement>('tour-skip').addEventListener('click', endTour);
  el<HTMLButtonElement>('nudge-start').addEventListener('click', startTour);
  el<HTMLButtonElement>('nudge-dismiss').addEventListener('click', () => {
    el('tour-nudge').hidden = true;
    try {
      localStorage.setItem('tour-seen', '1');
    } catch {
      /* ignore */
    }
  });
  document.addEventListener('keydown', (e) => {
    if (tourIdx < 0) return;
    if (e.key === 'Escape') endTour();
    else if (e.key === 'ArrowRight') tourNext();
    else if (e.key === 'ArrowLeft') tourPrev();
  });
}
function maybeOfferTour(): void {
  if (new URLSearchParams(location.search).get('tour') === '1') {
    startTour();
    return;
  }
  let seen = false;
  try {
    seen = localStorage.getItem('tour-seen') === '1';
  } catch {
    /* ignore */
  }
  if (!seen) el('tour-nudge').hidden = false;
}

// ---------------------------------------------------------------------------
// Render orchestration
// ---------------------------------------------------------------------------
function renderLive(): void {
  syncControls();
  renderReadout();
  renderTierStepper();
  renderCandidate();
  drawDescent();
  renderMicroscope();
  drawLandscape();
  markActivePreset();
}

function renderAll(): void {
  renderLive();
  writeUrlState();
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
let playing = false;
function play(): void {
  const last = result.trajectory.length - 1;
  if (last <= 0) {
    cursor = 0;
    renderLive();
    return;
  }
  if (prefersReducedMotion()) {
    cursor = last;
    renderLive();
    el('play-status').textContent = 'done';
    return;
  }
  playing = true;
  cursor = 0;
  const btn = el<HTMLButtonElement>('play-btn');
  btn.disabled = true;
  el('play-status').textContent = 'descending…';
  const perStepMs = Math.max(80, Math.min(220, 2400 / last));
  let lastTs: number | null = null;
  let acc = 0;
  const frame = (ts: number) => {
    if (!playing) return;
    if (lastTs === null) lastTs = ts;
    acc += ts - lastTs;
    lastTs = ts;
    while (acc >= perStepMs && cursor < last) {
      cursor++;
      acc -= perStepMs;
    }
    renderLive();
    if (cursor < last) {
      requestAnimationFrame(frame);
    } else {
      playing = false;
      btn.disabled = false;
      el('play-status').textContent = result.converged ? 'recovered ✓' : 'stalled';
      if (recovers(result, instance)) flashRecovered();
    }
  };
  requestAnimationFrame(frame);
}

/** One-shot "key recovered" flourish over the descent chart (reduced-motion aware). */
function flashRecovered(): void {
  const toast = el('recovered-toast');
  toast.hidden = false;
  toast.classList.remove('show');
  void toast.offsetWidth; // restart the animation
  toast.classList.add('show');
  window.setTimeout(
    () => {
      toast.classList.remove('show');
      toast.hidden = true;
    },
    prefersReducedMotion() ? 1400 : 1700,
  );
}

// ---------------------------------------------------------------------------
// Copy shareable link — surfaces the deep-linkable URL state
// ---------------------------------------------------------------------------
function setupShare(): void {
  const btn = el<HTMLButtonElement>('share-btn');
  btn.addEventListener('click', async () => {
    writeUrlState(); // ensure the URL reflects the current seed/relations/noise
    const url = location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Fallback for non-secure contexts / older browsers.
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    btn.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C';
    window.setTimeout(() => {
      btn.textContent = '🔗 Copy link';
    }, 1600);
  });
}

function stopPlaying(): void {
  playing = false;
  el<HTMLButtonElement>('play-btn').disabled = false;
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function init(): void {
  setupThemeToggle();
  readUrlState();
  recompute('end');
  computeNoiseCurve();

  buildTeachingPresets();
  buildTierStepper();
  setupHelp();
  setupPredict();
  setupTour();
  setupShare();
  setupMicroscope();
  buildAxisSelectors();
  setupLandscapeInteraction();
  setupTrials();
  buildReplay();
  setupAssessment();

  onEngineChanged();
  renderStickyHeadline();
  renderSources();
  renderOverlayToySide();
  renderAll();
  drawNoise();
  drawPaperBars();
  drawPaperGrid();

  el<HTMLInputElement>('rels-slider').addEventListener('input', (e) => {
    stopPlaying();
    userStart = null;
    relCount = Number((e.target as HTMLInputElement).value);
    recompute('end');
    onEngineChanged();
    renderAll();
  });
  // recomputing the noise curve is heavier — do it on release, not every tick.
  el<HTMLInputElement>('rels-slider').addEventListener('change', () => {
    computeNoiseCurve();
    renderOverlayToySide();
    drawNoise();
  });

  el<HTMLInputElement>('noise-slider').addEventListener('input', (e) => {
    stopPlaying();
    userStart = null;
    noiseP = Number((e.target as HTMLInputElement).value) / 100;
    recompute('end');
    onEngineChanged();
    renderAll();
  });

  el<HTMLInputElement>('seed-slider').addEventListener('input', (e) => {
    stopPlaying();
    userStart = null;
    seed = Number((e.target as HTMLInputElement).value);
    recompute('end');
    onEngineChanged();
    renderAll();
  });
  el<HTMLInputElement>('seed-slider').addEventListener('change', () => {
    computeNoiseCurve();
    renderOverlayToySide();
    drawNoise();
  });

  el<HTMLButtonElement>('play-btn').addEventListener('click', () => {
    play();
    writeUrlState();
  });
  el<HTMLButtonElement>('step-btn').addEventListener('click', () => {
    stopPlaying();
    cursor = Math.min(cursor + 1, result.trajectory.length - 1);
    renderLive();
  });
  el<HTMLButtonElement>('reset-btn').addEventListener('click', () => {
    stopPlaying();
    cursor = 0;
    renderLive();
    el('play-status').textContent = '';
  });

  el<HTMLInputElement>('alt-toggle').addEventListener('change', (e) => {
    showAltRuns = (e.target as HTMLInputElement).checked;
    drawDescent();
  });

  maybeOfferTour();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
