/**
 * The page's main loop: fetch the bundle from server.py, draw the three parts, repeat.
 *
 * The page asks the LOCAL server every `refresh_seconds` (config/dashboard.toml) and whenever
 * Refresh is clicked. It never contacts any outside site; fetch.py does that, politely, on its
 * own schedule.
 *
 * Remembered in this browser only (localStorage): which race is open and the county trait
 * picked in the county table's last column, so a reload keeps them.
 */

import { fetchCensus, fetchState, OfflineError } from './api.js';
import { censusSort, DEFAULT_SORT, nextSort } from './countySort.js';
import { openCallForm } from './callForm.js';
import { openEntryForm, showRaceMismatch } from './entryForm.js';
import { openVoteCastForm } from './votecastForm.js';
import { renderPracticeBanner } from './practice.js';
import { renderRaceList } from './raceList.js';
import { renderRacePanel } from './racePanel.js';
import { renderTopBar } from './topBar.js';
import { isStatic, renderReplayBar, replayCensus, replayState, startReplay } from './replay.js';

const view = {
  state: null, // the last bundle received
  selected: readStored('selectedRace'),
  // Every race opens on the default order (the left candidate's biggest gains first; user,
  // 2026-10-27). The county trait picked in the table's last column is remembered.
  countySort: DEFAULT_SORT,
  censusKey: readStored('censusField', null),
  census: {}, // state -> its census data, fetched once per state ('loading' while in flight)
  activeClosing: null, // a poll-close time clicked in the timeline, or null
  timer: null,
};

let drawn = 0; // static replay: only the newest request draws (a slider drag asks many times)

async function refresh() {
  if (isStatic) {
    const ticket = ++drawn;
    const state = await replayState();
    if (ticket !== drawn) return;
    view.state = state;
    draw();
    return;
  }
  const offline = document.getElementById('offline-banner');
  try {
    view.state = await fetchState();
    offline.hidden = true;
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    offline.textContent = error.message;
    offline.hidden = false;
  }
  if (view.state) draw();
  schedule();
}

function schedule() {
  clearTimeout(view.timer);
  const seconds = view.state?.refresh_seconds ?? 30;
  view.timer = setTimeout(refresh, seconds * 1000);
}

function draw() {
  const state = view.state;
  if (!state.races[view.selected]) view.selected = defaultRace(state);

  const banner = document.getElementById('replay-banner');
  banner.hidden = !state.replay;
  if (isStatic) renderReplayBar(banner);
  else if (state.replay) {
    if (state.practice) renderPracticeBanner(banner, state.practice, refresh);
    else banner.textContent = `REPLAY: recorded data from "${state.replay.label}". Not live results.`;
  }
  document.title = state.replay ? 'REPLAY · Election night' : 'Election night';

  const closing = state.timeline.find((c) => c.time === view.activeClosing);
  renderTopBar(document.getElementById('top-bar'), state, {
    activeClosing: view.activeClosing,
    onClosingClick: (time) => {
      view.activeClosing = view.activeClosing === time ? null : time;
      draw();
    },
    onRefresh: isStatic ? null : refresh, // static replay: nothing to refresh
    now: isStatic ? new Date(state.moment) : new Date(),
  });
  renderRaceList(document.getElementById('race-list'), state, {
    selected: view.selected,
    highlightStates: new Set(closing ? closing.states : []),
    onSelect: (contestId) => {
      if (contestId !== view.selected) view.countySort = DEFAULT_SORT; // opens on the default
      view.selected = contestId;
      store('selectedRace', contestId);
      draw();
    },
  });
  const race = state.races[view.selected];
  const census = race ? censusFor(race.state) : null;
  const censusField = census?.fields.find((f) => f.key === view.censusKey) ?? null;
  renderRacePanel(document.getElementById('race-panel'), race, {
    sort: view.countySort.key === 'census' && !censusField ? DEFAULT_SORT : view.countySort,
    census,
    censusField,
    onSort: (key) => {
      view.countySort = nextSort(view.countySort, key);
      draw();
    },
    onCensusField: (key) => {
      view.censusKey = key || null;
      store('censusField', view.censusKey);
      const field = census?.fields.find((f) => f.key === key);
      if (field) view.countySort = censusSort(field);
      else if (view.countySort.key === 'census') view.countySort = DEFAULT_SORT;
      draw();
    },
    // The form gets its own panel, which this redraw never touches (see entryForm.js).
    // The static replay has no forms: nothing to type into or save.
    ...(isStatic ? {} : formHandlers()),
  });
  // An open form stays on its own race; warn beside its boxes if you're now viewing another.
  if (!isStatic) showRaceMismatch(document.getElementById('entry-panel'), viewedRace());
}

/** The race panel's form buttons (live dashboard only). */
function formHandlers() {
  return {
    onEnterResults: (contestId) => {
      openEntryForm(document.getElementById('entry-panel'), contestId, {
        onSaved: refresh,
        viewing: viewedRace,
      });
    },
    onCall: (contestId) => {
      openCallForm(document.getElementById('entry-panel'), () => view.state.races[contestId], {
        onSaved: refresh,
        viewing: viewedRace,
      });
    },
    onEnterVoteCast: (contestId) => {
      openVoteCastForm(document.getElementById('entry-panel'), contestId, {
        onSaved: refresh,
        viewing: viewedRace,
      });
    },
  };
}

/** A state's county census data, or null while it's being fetched (then the page redraws).
 *  It never changes during the night, so each state is fetched once. */
function censusFor(state) {
  const cached = view.census[state];
  if (cached && cached !== 'loading') return cached;
  if (!cached) {
    view.census[state] = 'loading';
    (isStatic ? replayCensus(state) : fetchCensus(state))
      .then((data) => {
        view.census[state] = data;
        draw();
      })
      .catch(() => {
        delete view.census[state]; // try again on the next redraw
      });
  }
  return null;
}

/** The race open in the race panel, as {id, label}. */
function viewedRace() {
  const race = view.state?.races[view.selected];
  return race ? { id: race.contest_id, label: race.label } : null;
}

/** First race with votes, in list order; otherwise the first race listed. */
function defaultRace(state) {
  const cells = state.rows.flatMap((row) => [row.senate, row.governor]).filter(Boolean);
  return (cells.find((c) => c.status === 'counting') ?? cells[0])?.contest_id ?? null;
}

/** A remembered choice from this browser, or `fallback` if there isn't one (or it's unreadable). */
function readStored(name, fallback = null) {
  try {
    const text = localStorage.getItem(name);
    return text === null ? fallback : JSON.parse(text);
  } catch {
    return fallback; // storage blocked or garbled: start from the default
  }
}

function store(name, value) {
  try {
    localStorage.setItem(name, JSON.stringify(value));
  } catch {
    // storage blocked: the choice simply isn't remembered across reloads
  }
}

if (isStatic) startReplay(refresh).then(refresh);
else refresh();
