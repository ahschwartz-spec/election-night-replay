/**
 * The vote-share chart in the race panel (docs/decisions/frontend-design.md, 2026-10-23 and
 * 2026-10-27): each candidate's projected two-party share over the night.
 *
 *   x axis      clock time (Eastern), from the state's first poll close
 *   lines       both candidates solid, in party colors (user, 2026-10-27)
 *   shading     each line's 90% range (narrows as votes are counted)
 *   hover       (milestone dots) the time, both shares, the range, % in and the share counted so far (the
 *               counted share used to be a dotted line; moved into the hover text, 2026-10-27)
 *   small dots  milestones: polls only, VoteCast entered, 25/50/75/85/90/95% of expected vote in
 *
 * Mouse over a dot (or any point on the left line) for the details. Hand-drawn SVG: no chart
 * library and nothing from the internet. Every number in the hover text and end labels comes
 * ready-made from the server; this file only turns shares and times into positions.
 */

import { easternTime, escapeHtml, partyClass } from './util.js';

const WIDTH = 720;
const HEIGHT = 230;
const PAD = { left: 44, right: 110, top: 12, bottom: 26 };
const HOUR = 3600 * 1000;
// Room between the plot's left edge and the first moment, so a dot there isn't half cut off by
// the edge (user, 2026-10-28: the polls-only dots were).
const INSET = 10;

export function chartHtml(chart) {
  if (!chart || !chart.points.length) return '';
  const times = chart.points.map((p) => Date.parse(p.time));
  const start = Date.parse(chart.start);
  // At least three hours wide (the hour before poll close, when the polls-only point sits, plus
  // two after), so the first few points don't fill the whole width.
  const end = Math.max(Math.max(...times) + 0.25 * HOUR, start + 3 * HOUR);
  const x = (t) =>
    PAD.left + INSET + ((t - start) / (end - start)) * (WIDTH - PAD.left - PAD.right - INSET);

  // y range (user, 2026-10-28): until half the expected vote is in, everything drawn fits: the
  // projections AND their shaded ranges. From the first point at 50% in onward, the axis zooms
  // to the projected lines alone (all of them, early ones included), so the lines are never cut
  // off but the early, wide ranges can be. Plus 50%, a little room, and a minimum height (4
  // points before the zoom, 2 after). Anything outside is clipped at the chart's edges.
  const zoomed = chart.points.some((p) => (p.fraction ?? 0) >= 0.5);
  const values = [0.5];
  for (const p of chart.points) {
    values.push(p.left, 1 - p.left);
    if (!zoomed) values.push(p.left + p.band, p.left - p.band, 1 - p.left + p.band, 1 - p.left - p.band);
  }
  let low = Math.min(...values) - 0.005;
  let high = Math.max(...values) + 0.005;
  const tallest = zoomed ? 0.02 : 0.04;
  if (high - low < tallest) {
    const middle = (high + low) / 2;
    low = middle - tallest / 2;
    high = middle + tallest / 2;
  }
  low = Math.max(0, low);
  high = Math.min(1, high);
  const y = (share) => PAD.top + ((high - share) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);

  const left = partyClass(chart.left_party);
  const right = partyClass(chart.right_party);
  const pts = chart.points.map((p, i) => ({ ...p, t: times[i] }));

  return `<figure class="vote-chart">
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
      aria-label="Projected two-party vote share over the night for ${escapeHtml(chart.left_name)} and ${escapeHtml(chart.right_name)}">
      <defs><clipPath id="plot-area"><rect x="${PAD.left}" y="${PAD.top}"
        width="${WIDTH - PAD.left - PAD.right}" height="${HEIGHT - PAD.top - PAD.bottom}" /></clipPath></defs>
      ${grid(low, high, y, start, end, x)}
      <g clip-path="url(#plot-area)">
      ${band(pts, (p) => p.left, x, y, left)}
      ${band(pts, (p) => 1 - p.left, x, y, right)}
      ${line(pts, (p) => p.left, x, y, `${left} projected`)}
      ${line(pts, (p) => 1 - p.left, x, y, `${right} projected`)}
      </g>
      ${markers(chart.markers, x, y)}
      ${endLabels(chart, pts[pts.length - 1], x, y, left, right)}
    </svg>
    <div class="chart-hover" hidden></div>
    ${chart.filling ? '<div class="chart-filling">Catching up: filling in the chart from saved data…</div>' : ''}
    <figcaption class="muted">Shading = 90% range. Dots = milestones: hover over one for details,
      including the share counted so far. From 50% in, the scale zooms to the lines.</figcaption>
  </figure>`;
}

/** Horizontal lines at round percentages (50% stronger), and the hours along the bottom. */
function grid(low, high, y, start, end, x) {
  const span = (high - low) * 100;
  const step = [1, 2, 5, 10, 20].find((s) => span / s <= 6) ?? 25;
  const lines = [];
  for (let pct = Math.ceil((low * 100) / step) * step; pct <= high * 100; pct += step) {
    const yy = y(pct / 100).toFixed(1);
    const cls = pct === 50 ? 'grid fifty' : 'grid';
    lines.push(`<line class="${cls}" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${yy}" y2="${yy}" />
      <text class="axis" x="${PAD.left - 6}" y="${yy}" dy="4" text-anchor="end">${pct}%</text>`);
  }
  // A tick on every hour; every other hour when the night is long.
  const firstHour = Math.ceil(start / HOUR) * HOUR;
  const every = (end - start) / HOUR > 7 ? 2 : 1;
  for (let t = firstHour; t <= end; t += every * HOUR) {
    const xx = x(t).toFixed(1);
    const label = easternTime(new Date(t)).replace(':00', '');
    lines.push(`<text class="axis" x="${xx}" y="${HEIGHT - 8}" text-anchor="middle">${label}</text>`);
  }
  return lines.join('');
}

/** A line through the points that have a value (gaps where a value is missing). */
function line(pts, value, x, y, cls) {
  const segments = [];
  let current = [];
  for (const p of pts) {
    const v = value(p);
    if (v === null || v === undefined) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(`${x(p.t).toFixed(1)},${y(v).toFixed(1)}`);
    }
  }
  if (current.length) segments.push(current);
  // A lone moment (e.g. only polls so far) has no line to draw, so it gets a small dot instead.
  return segments
    .map((s) => {
      if (s.length > 1) return `<polyline class="series ${cls}" points="${s.join(' ')}" />`;
      const [cx, cy] = s[0].split(',');
      return `<circle class="lone ${cls}" cx="${cx}" cy="${cy}" r="3" />`;
    })
    .join('');
}

/** The shaded 90% range around one candidate's line. */
function band(pts, value, x, y, cls) {
  const upper = pts.map((p) => `${x(p.t).toFixed(1)},${y(value(p) + p.band).toFixed(1)}`);
  const lower = pts.map((p) => `${x(p.t).toFixed(1)},${y(value(p) - p.band).toFixed(1)}`);
  if (pts.length === 1) return ''; // a band needs a width; one moment is shown by its dot
  // The band's edges are drawn as thin lines too, so the moment the two candidates' ranges stop
  // overlapping (the model becoming sure of the order) is easy to see (user, 2026-10-28).
  return `<polygon class="band ${cls}" points="${[...upper, ...[...lower].reverse()].join(' ')}" />
    <polyline class="band-edge ${cls}" points="${upper.join(' ')}" />
    <polyline class="band-edge ${cls}" points="${lower.join(' ')}" />`;
}

/** Hover text carried on a target as data attributes (shown by attachChartHover). */
function hoverData(hover) {
  return `data-heading="${escapeHtml(hover.heading)}" data-projected="${escapeHtml(hover.projected)}"
    data-counted="${escapeHtml(hover.counted ?? '')}"`;
}

/** Milestone dots, small and gray, on the left line. */
function markers(list, x, y) {
  return list
    .map(
      (m) => `<circle class="marker" cx="${x(Date.parse(m.time)).toFixed(1)}" cy="${y(m.left).toFixed(1)}" r="3.5"
        ${hoverData(m.hover)} />`,
    )
    .join('');
}

/**
 * The hover box: a small panel near the pointer with a bold heading, then the projected and
 * counted lines (the browser's built-in hover text can't do bold or line breaks). Call once after
 * the chart's HTML is on the page.
 */
export function attachChartHover(root) {
  const figure = root.querySelector('.vote-chart');
  if (!figure) return;
  const box = figure.querySelector('.chart-hover');
  figure.querySelectorAll('[data-heading]').forEach((target) => {
    target.addEventListener('mouseenter', () => {
      const { heading, projected, counted } = target.dataset;
      box.innerHTML = `<b>${escapeHtml(heading)}</b><div>${escapeHtml(projected)}</div>${
        counted ? `<div>${escapeHtml(counted)}</div>` : ''
      }`;
      box.hidden = false;
      const spot = target.getBoundingClientRect();
      const frame = figure.getBoundingClientRect();
      const left = Math.min(spot.left - frame.left + 12, frame.width - box.offsetWidth - 4);
      box.style.left = `${Math.max(0, left)}px`;
      box.style.top = `${spot.top - frame.top + 14}px`;
    });
    target.addEventListener('mouseleave', () => {
      box.hidden = true;
    });
  });
}

/** "Brown 50.5%" / "Husted 49.5%" just past the right end of each line, nudged apart if close. */
function endLabels(chart, last, x, y, left, right) {
  const xx = (x(last.t) + 8).toFixed(1);
  let yLeft = y(last.left);
  let yRight = y(1 - last.left);
  if (Math.abs(yLeft - yRight) < 14) {
    const nudge = (14 - Math.abs(yLeft - yRight)) / 2;
    if (yLeft < yRight) {
      yLeft -= nudge;
      yRight += nudge;
    } else {
      yLeft += nudge;
      yRight -= nudge;
    }
  }
  return `<text class="end ${left}" x="${xx}" y="${yLeft.toFixed(1)}" dy="4">${escapeHtml(chart.end_left_label)}</text>
    <text class="end ${right}" x="${xx}" y="${yRight.toFixed(1)}" dy="4">${escapeHtml(chart.end_right_label)}</text>`;
}
