/**
 * The race panel: the race you clicked in the list.
 *
 * Top to bottom (docs/decisions/frontend-design.md): header, headline number, benchmark pace
 * lines, county sort buttons and table, then notes. Until the model is built, the headline is the
 * benchmark-implied margin ("if the uncounted counties follow suit"), and says so on screen.
 *
 * Every label ("D+3.2", "R 4.5", "D 16,400") arrives ready-made from the server (display.py);
 * this file only places them and picks colors.
 */

import { attachChartHover, chartHtml } from './chart.js';
import { sortCounties } from './countySort.js';
import { SOURCE_NAMES, colored, escapeHtml, partyClass } from './util.js';

// The table's columns: header text, the sort key it uses, and a tooltip.
const COLUMNS = [
  ['County', 'name', 'click to sort'],
  ['Vote In', 'pct_expected', 'counted two-party votes ÷ expected'],
  ['Actual Margin', 'margin', 'margin of the votes counted so far'],
  ['Target Margin', 'needs', 'breakeven for the votes counted so far (whole night, if none yet)'],
  ['Over/Under', 'over', 'actual minus target margin'],
  ['Net Votes', 'net_votes', 'net votes gained or lost vs breakeven'],
];

/**
 * Draw the race panel. `sort` is the county table's current order (see countySort.js);
 * `census` is the state's county census data (null while loading) and `censusField` the field
 * picked in the table's last column; `onCensusField(key)` is called when it changes.
 * `onSort(key)` is called when a header is
 * clicked.
 */
export function renderRacePanel(
  element,
  race,
  { sort, census, censusField, onSort, onCensusField, onEnterResults, onEnterVoteCast, onCall },
) {
  if (!race) {
    element.innerHTML = '<div class="message">Pick a race on the left.</div>';
    return;
  }
  const table = { sort, census, field: censusField };
  // No form buttons without handlers (the static replay has no forms).
  element.innerHTML = [header(race, Boolean(onCall)), body(race, table), notes(race)].join('');
  element.querySelectorAll('[data-sort]').forEach((target) => {
    target.addEventListener('click', () => onSort(target.dataset.sort));
  });
  attachChartHover(element);
  element.querySelector('.enter-call')?.addEventListener('click', () => onCall(race.contest_id));
  element.querySelector('.census-pick')?.addEventListener('change', (event) => {
    onCensusField(event.target.value);
  });
  element.querySelector('.enter-results')?.addEventListener('click', () => {
    onEnterResults(race.contest_id);
  });
  element.querySelector('.enter-votecast')?.addEventListener('click', () => {
    onEnterVoteCast(race.contest_id);
  });
}

function header(race, withForms = true) {
  const versus = `${colored(`${race.left.name} (${race.left.party})`, race.left.party)}
    vs ${colored(`${race.right.name} (${race.right.party})`, race.right.party)}`;
  const progress = [];
  if (race.pct_expected) progress.push(`~${escapeHtml(race.pct_expected)} of expected vote in`);
  if (race.fetched_at) progress.push(`data as of ${escapeHtml(race.fetched_at)}`);
  const source = race.source === 'hand' ? '<span class="tag hand">✎ typed by hand</span> ' : '';
  return `<div class="panel-head">
      <h1>${escapeHtml(race.label)}</h1>
      <span class="muted">${source}${progress.join(' · ')}</span>
    </div>
    <div class="panel-subhead">
      <span>${versus}</span>
      ${withForms ? `<span class="panel-actions">
        <button type="button" class="enter-votecast${race.votecast ? '' : ' due'}">${race.votecast ? 'VoteCast (locked)' : 'Enter VoteCast'}</button>
        <button type="button" class="enter-results">Enter results by hand</button>
        <button type="button" class="enter-call">Enter call</button>
      </span>` : ''}
    </div>
    ${dropLine(race)}
    ${race.votecast ? votecastLine(race.votecast) : ''}
    ${callsLine(race)}`;
}

/** Drop-folder races only: "Source · Save in drop\TX", a link to the official file and the
 *  folder to save it into (user, 2026-11-03). Opens in a new tab so the dashboard stays put. */
function dropLine(race) {
  const help = race.drop_help;
  if (!help) return '';
  const source = help.source
    ? `<a href="${escapeHtml(help.source)}" target="_blank" rel="noopener">Source</a> · `
    : '';
  return `<div class="drop-line">${source}Save in ${escapeHtml(help.folder)}</div>`;
}

/** "Called: NYT · Brown 9:42 PM · CNN · Brown 9:50 PM", only once a call is logged (calls are
 *  entered with the "Enter call" button; user, 2026-10-28). */
function callsLine(race) {
  const made = Object.entries(race.calls.networks).filter(([, call]) => call);
  if (!made.length) return '';
  const parts = made.map(
    ([network, call]) =>
      `${network} · ${colored(call.candidate, call.party)} <span class="muted">${escapeHtml(call.time)}</span>`,
  );
  return `<div class="calls-line"><span class="muted">Called:</span> ${parts.join(' &nbsp; ')}</div>`;
}

/** The frozen poll-close reading, e.g. "VoteCast (7:30 PM): R+7.2 as published,
 *  R+8.7 after the D+1.5 correction (the bias is read from config/needle.toml)". */
function votecastLine(reading) {
  const replaced = reading.replaced ? ` · replaced ${reading.replaced}× to fix a typo` : '';
  return `<div class="votecast-line">${escapeHtml(SOURCE_NAMES.votecast)} (${escapeHtml(reading.entered_at)}):
    ${colored(reading.raw_label, reading.raw_party)} as published,
    <b>${colored(reading.corrected_label, reading.corrected_party)}</b> after the
    ${escapeHtml(reading.bias_label)} correction${replaced}</div>`;
}

function body(race, tableView) {
  const table = race.counties.length ? countyTable(race, tableView) : '';
  const polls = race.prior_label
    ? `${SOURCE_NAMES.polls ? `${escapeHtml(SOURCE_NAMES.polls)}:` : 'Polls said'} ${colored(race.prior_label, race.prior_party)}`
    : '<span class="faint">no polling average entered</span>';
  if (race.status !== 'counting') {
    const close = race.first_close ? `<br>Polls first close ${escapeHtml(race.first_close)}.` : '';
    // Before any returns the needle is the polls (plus VoteCast once entered).
    const before = race.needle
      ? `<div class="headline">${needleHeadline(race.needle, 'Projected')}</div>
         <div class="headline-sub"><span>${polls}</span></div>
         <div class="interim-note">From the ${race.needle.used_votecast ? `polls and ${escapeHtml(SOURCE_NAMES.votecast)}` : 'polls'} only: no returns yet.</div>`
      : '';
    return `${before}${chartHtml(race.chart)}<div class="message">${escapeHtml(race.message ?? '')}${close}</div>${table}`;
  }
  const counted = `<span class="muted">Counted so far ${colored(race.counted.label, race.counted.party)}
    (${race.counted.votes.toLocaleString('en-US')} votes)</span>`;
  // 'counted' when there's nothing to imply from yet (hand entry with only statewide totals).
  const kind = race.implied.kind === 'counted' ? 'Counted' : 'Implied';
  if (race.needle) {
    // The model's projection is the headline; the benchmark-implied margin drops to a small line.
    return `
      <div class="headline">${needleHeadline(race.needle, 'Projected')}</div>
      <div class="headline-sub"><span>${polls}</span>${counted}</div>
      <div class="interim-note">${kind === 'Implied' ? `Benchmark-implied ${colored(race.implied.label, race.implied.party)} (if uncounted counties follow suit).` : ''}
        ± is the 90% range: 9 times in 10 the final lands within it.</div>
      ${chartHtml(race.chart)}
      ${race.pace.map(paceLine).join('')}
      ${typeProgress(race)}
      ${table}`;
  }
  const note =
    race.implied.kind === 'counted'
      ? 'Counted = the statewide totals typed in. No key county entered yet, so there are no benchmarks to compare.'
      : 'Implied = breakeven plus how far reported counties are beating their benchmarks, i.e. if the uncounted counties follow suit. No win probability for this race (see the note below).';
  return `
    <div class="headline">
      <span class="big">${colored(`${kind} ${race.implied.label}`, race.implied.party)}</span>
      <span>${polls}</span>
      ${counted}
    </div>
    <div class="interim-note">${note}</div>
    ${race.pace.map(paceLine).join('')}
      ${typeProgress(race)}
    ${table}`;
}

/** Two lines (user, 2026-10-27), plus Georgia's runoff line:
 *    Projected D+1.0 ±0.5
 *    Probability 100% (Very likely Brown)
 *  ± is the 90% range. A toss-up's probability has no party color. */
function needleHeadline(needle, word) {
  const majority = needle.majority ? `<div class="muted">${escapeHtml(needle.majority)}</div>` : '';
  return `<div class="needle-head">
      <div><span class="big">${colored(`${word} ${needle.projected_label}`, needle.projected_party)}</span>
        <span class="range">${escapeHtml(needle.range_label)}</span></div>
      <div class="chance">${colored(`Probability ${needle.chance_short_label} (${needle.chance_words})`, needle.chance_party)}</div>
      ${majority}
    </div>`;
}

/** ▼ or ▲ after the label of whatever the table is sorted by. */
function arrow(sort, key) {
  if (sort.key !== key) return '';
  return sort.descending ? ' ▼' : ' ▲';
}

/** "81% of anticipated mail ballots are counted", one line per vote type, for states whose feed
 *  counts by type (user, 2026-11-02). Nothing for other states. */
function typeProgress(race) {
  if (!race.type_progress?.length) return '';
  return `<div class="type-progress">${race.type_progress.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}

function paceLine(pace) {
  const parts = `margin ${escapeHtml(pace.margin_part_label)} · turnout ${escapeHtml(pace.turnout_part_label)}`;
  const firm = ''; // the early-vote-only figure was dropped (2026-10-28)
  return `<div class="pace">
      <span class="sentence">${colored(pace.sentence, pace.party)}</span>
      <span class="muted">(${parts}${firm})</span>
    </div>`;
}

/**
 * The county table. Its last column is a dropdown of the county census fields: picking one fills
 * the column with each county's value and sorts by it (click the arrow beside it to reverse).
 * Sorted by a category (area type, metro/rural, NCHS level), rows group by category, biggest
 * county first, with a line between groups.
 */
function countyTable(race, { sort, census, field }) {
  const rows = sortCounties(race.counties, sort, census, field)
    .map(({ county, divider }) => {
      const cls = [county.reported ? '' : 'unreported', divider ? 'divider' : ''].join(' ').trim();
      const value = field && census ? census.counties[county.fips]?.[field.key]?.text ?? '' : '';
      const censusCell = `<td class="census">${escapeHtml(value)}</td>`;
      if (!county.reported) {
        return `<tr class="${cls}">
          <td>${escapeHtml(county.name)}</td><td>0%</td><td>—</td>
          <td class="needs">${colored(county.needs_label, county.needs_party)}</td>
          <td></td><td></td>${censusCell}</tr>`;
      }
      const tag = county.early_only
        ? ' <span class="tag warn">early only</span>'
        : county.eday_done
          ? ' <span class="tag warn" title="Election Day done, mail still counting">mail out</span>'
          : '';
      return `<tr class="${cls}">
        <td>${escapeHtml(county.name)}${tag}</td>
        <td>${escapeHtml(county.pct_expected_label ?? '')}</td>
        <td>${colored(county.margin_label, county.margin_party)}</td>
        <td title="Target for the votes counted so far; whole-night breakeven ${escapeHtml(county.needs_overall_label)}">${colored(county.needs_label, county.needs_party)}</td>
        <td class="over">${overBar(county)}<span class="over-num">${colored(county.over_label, county.over_party)}</span></td>
        <td>${colored(county.net_label, county.net_party)}</td>
        ${censusCell}
      </tr>`;
    })
    .join('');
  const headers = COLUMNS.map(([label, key, tip]) => {
    const sorted = sort.key === key ? ' class="sorted"' : '';
    return `<th${sorted} data-sort="${key}" title="${escapeHtml(tip)}; click to sort">${label}${arrow(sort, key)}</th>`;
  }).join('');
  return `<table class="counties">
      <thead><tr>${headers}${censusHeader(sort, census, field)}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * A tiny bar before the over/under number, in the color of the candidate ahead of pace, its
 * length growing with the size of the over/under: full (36 px) at 10 points or more (user,
 * 2026-10-28, trying bars instead of cell shading). `county.sort.over` is the raw fraction.
 */
function overBar(county) {
  const over = county.sort?.over;
  if (over === null || over === undefined || !county.over_party) return '';
  const width = Math.round(Math.min(Math.abs(over) / 0.1, 1) * 36);
  return `<span class="over-bar"><span class="${partyClass(county.over_party)}" style="width:${width}px"></span></span>`;
}

// SWITCHED OFF 2026-10-28 (user): the 5-step cell shading by typical county miss, while the bars
// above are tried. To bring it back, use `class="${shadeClass(county)}"` on the over/under <td>
// again. The server still sends `over_step`, and the styles (.shade-*) are still in style.css.
/** The over/under cell's background: the party ahead of pace, in steps 1-4 (0 = none). */
// eslint-disable-next-line no-unused-vars
function shadeClass(county) {
  if (!county.over_step || !county.over_party) return '';
  const party = county.over_party === 'D' || county.over_party === 'R' ? county.over_party : 'I';
  return `shade shade-${party} shade-${county.over_step}`;
}

/** The last column's header: a dropdown of census fields, plus an arrow to reverse the order. */
function censusHeader(sort, census, field) {
  if (!census) return '<th class="census-head faint">loading…</th>';
  const options = census.fields
    .map(
      (f) =>
        `<option value="${escapeHtml(f.key)}"${field?.key === f.key ? ' selected' : ''}>${escapeHtml(f.heading)}</option>`,
    )
    .join('');
  const flip =
    field && sort.key === 'census'
      ? `<button type="button" class="census-flip" data-sort="census" title="Reverse the order">${sort.descending ? '▼' : '▲'}</button>`
      : field
        ? '<button type="button" class="census-flip" data-sort="census" title="Sort by this">⇅</button>'
        : '';
  return `<th class="census-head${sort.key === 'census' ? ' sorted' : ''}">
      <select class="census-pick" aria-label="County Traits: pick one to show and sort by">
        <option value=""${field ? '' : ' selected'}>County Traits</option>${options}
      </select>${flip}</th>`;
}

function notes(race) {
  const lines = [];
  if (race.needle_note) lines.push(race.needle_note);
  if (race.hand_note) lines.push(race.hand_note);
  if (race.ranked_choice_note) lines.push(race.ranked_choice_note);
  for (const warning of race.warnings) lines.push(`Source note: ${warning}`);
  for (const note of race.baseline_notes) lines.push(`Baseline: ${note}`);
  if (!lines.length) return '';
  return `<div class="notes">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
}
