/**
 * Static replay mode (the shareable portfolio page): the night played back from files, no server.
 *
 * tools/export_replay.py writes site/data/ (see its docstring). This module turns those files
 * back into the same bundle server.py would send for one moment, so every other script draws it
 * unchanged:
 *   - the moment's file (race list, top bar, each race's needle parts and which race file to use),
 *   - each race's steady part (fetched once per file and kept),
 *   - each race's whole-night chart, cut at the moment shown.
 * Two needles: "night" (as it ran on election night) and "revised" (today's needle).
 *
 * It also draws the replay bar: play/pause, step back/forward (also the ← and → keys), the
 * timeline slider, speed, and the needle switch. The page is only ever a replay; the bar says so.
 */

import { escapeHtml, easternTime } from './util.js';

const DATA = 'data';
const SPEEDS = [
  { label: '1 step / 2 s', ms: 2000 },
  { label: '1 step / s', ms: 1000 },
  { label: '4 steps / s', ms: 250 },
];

const replay = {
  index: null, // data/index.json
  position: 0, // which moment is shown
  setting: 'revised',
  playing: false,
  speed: 1,
  timer: null,
  raceFiles: new Map(), // race file name -> promise of its JSON
  charts: new Map(), // `${setting}/${race}` -> promise of its chart
  onChange: null,
};

export const isStatic = document.documentElement.dataset.mode === 'static';

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Couldn't load ${path} (${response.status}).`);
  return response.json();
}

function cached(map, key, path) {
  if (!map.has(key)) map.set(key, json(path));
  return map.get(key);
}

/** Load the list of moments and start on the last one (the night's end). */
export async function startReplay(onChange) {
  replay.index = await json(`${DATA}/index.json`);
  replay.position = replay.index.moments.length - 1;
  replay.onChange = onChange;
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, select, textarea')) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
}

/** The bundle for the moment and needle being shown, as server.py would have sent it. */
export async function replayState() {
  const moment = replay.index.moments[replay.position];
  const file = await json(`${DATA}/moments/${replay.setting}/${moment.file}.json`);
  const cutoff = Date.parse(moment.time);
  const races = {};
  await Promise.all(
    Object.entries(file.races).map(async ([raceId, parts]) => {
      const [steady, chart] = await Promise.all([
        cached(replay.raceFiles, parts.file, `${DATA}/races/${parts.file}.json`),
        cached(replay.charts, `${replay.setting}/${raceId}`,
          `${DATA}/charts/${replay.setting}/${raceId}.json`),
      ]);
      const { file: _unused, ...needleParts } = parts;
      races[raceId] = { ...steady, ...needleParts, chart: cutChart(chart, cutoff) };
    }),
  );
  return { ...file, races, moment: moment.time };
}

/** A state's county traits (they never change). */
export function replayCensus(state) {
  return json(`${DATA}/census/${state}.json`);
}

/** The whole-night chart as it stood at `cutoff` (ms): points and milestones up to then, and
 *  the line-end labels redone from the last point kept. */
function cutChart(chart, cutoff) {
  if (!chart) return null;
  const points = chart.points.filter((p) => Date.parse(p.time) <= cutoff);
  if (!points.length) return null;
  const last = points[points.length - 1].left;
  return {
    ...chart,
    points,
    markers: chart.markers.filter((m) => Date.parse(m.time) <= cutoff),
    filling: false,
    end_left_label: `${chart.left_name} ${(last * 100).toFixed(1)}%`,
    end_right_label: `${chart.right_name} ${((1 - last) * 100).toFixed(1)}%`,
  };
}

function step(by) {
  const last = replay.index.moments.length - 1;
  const next = Math.min(Math.max(replay.position + by, 0), last);
  if (next === replay.position) {
    pause();
    return;
  }
  replay.position = next;
  replay.onChange();
}

async function play() {
  if (replay.position === replay.index.moments.length - 1) replay.position = 0; // from the top
  replay.playing = true;
  await replay.onChange();
  tick();
}

/** The next step of playback, once the current moment has been drawn: a moment's files can
 *  take longer to load than a step lasts, and starting the next before the last is drawn would
 *  leave the screen never updating. */
function tick() {
  clearTimeout(replay.timer);
  if (!replay.playing) return;
  replay.timer = setTimeout(async () => {
    if (replay.position >= replay.index.moments.length - 1) {
      pause(); // the end of the night
      return;
    }
    replay.position += 1;
    await replay.onChange();
    tick();
  }, SPEEDS[replay.speed].ms);
}

function pause() {
  replay.playing = false;
  clearTimeout(replay.timer);
  replay.onChange();
}

/** Draw the replay bar into `element` (the replay banner, shown on every screen). Built once,
 *  then only its values change, so dragging the slider isn't interrupted by the redraws. */
export function renderReplayBar(element) {
  if (!element.querySelector('.replay-controls')) buildBar(element);
  const { moments } = replay.index;
  element.querySelector('input[type="range"]').value = replay.position;
  const moment = moments[replay.position];
  element.querySelector('.replay-time').textContent =
    moment.label ?? `${easternTime(new Date(moment.time))} ET`; // the last step: "Final count"
  element.querySelector('[data-act="play"]').textContent = replay.playing ? 'Pause' : 'Play';
}

function buildBar(element) {
  const { moments, settings, label } = replay.index;
  const options = Object.entries(settings)
    .map(([key, text]) => `<option value="${key}"${key === replay.setting ? ' selected' : ''}>${escapeHtml(text)}</option>`)
    .join('');
  const speeds = SPEEDS.map(
    (s, i) => `<option value="${i}"${i === replay.speed ? ' selected' : ''}>${s.label}</option>`,
  ).join('');
  element.innerHTML = `
    <span class="replay-title">REPLAY · ${escapeHtml(label)}. Not live results.</span>
    <span class="replay-controls">
      <button type="button" data-act="back" title="Back one step (←)">◀</button>
      <button type="button" data-act="play">Play</button>
      <button type="button" data-act="next" title="Forward one step (→)">▶</button>
      <input type="range" min="0" max="${moments.length - 1}" value="${replay.position}"
        aria-label="Moment of the night" />
      <strong class="replay-time"></strong>
      <select data-act="speed" aria-label="Playback speed">${speeds}</select>
      <label>Needle <select data-act="setting">${options}</select></label>
    </span>`;
  element.querySelector('[data-act="back"]').addEventListener('click', () => step(-1));
  element.querySelector('[data-act="next"]').addEventListener('click', () => step(1));
  element.querySelector('[data-act="play"]').addEventListener('click', () =>
    replay.playing ? pause() : play(),
  );
  element.querySelector('input[type="range"]').addEventListener('input', (event) => {
    replay.position = Number(event.target.value);
    replay.onChange();
  });
  element.querySelector('[data-act="speed"]').addEventListener('change', (event) => {
    replay.speed = Number(event.target.value);
    tick();
  });
  element.querySelector('[data-act="setting"]').addEventListener('change', (event) => {
    replay.setting = event.target.value;
    replay.onChange();
  });
}
