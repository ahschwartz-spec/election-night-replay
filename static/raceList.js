/**
 * The race list: one row per state in the user's fixed priority order, Senate and Governor side
 * by side (docs/decisions/frontend-design.md). Rows never move during the night.
 *
 * Each cell shows the benchmark-implied margin (bold, party color), then the win probability
 * (once the model exists), then % of expected vote in, lighter and in parentheses. Before a race
 * has votes it shows its first poll-closing time instead.
 */

import { colored, easternTime, escapeHtml } from './util.js';

export function renderRaceList(element, state, { selected, highlightStates, onSelect }) {
  const head =
    '<div class="list-row head"><div></div><div>Senate</div><div>Governor</div><div title="Data status">Data</div></div>';
  const rows = state.rows
    .map((row) => {
      const highlight = highlightStates.has(row.state) ? ' closing-highlight' : '';
      return `<div class="list-row${highlight}">
        <div class="state-code">${escapeHtml(row.state)}</div>
        ${cell(row.senate, selected)}
        ${cell(row.governor, selected)}
        ${feedStatus(row.feed)}
      </div>`;
    })
    .join('');
  const note = `<div class="list-note">Cells: projected margin, chance of winning, (% of expected
    vote in).</div>`;
  element.innerHTML = head + rows + senateNet(state.senate_net) + note;

  element.querySelectorAll('button.cell[data-contest]').forEach((button) => {
    button.addEventListener('click', () => onSelect(button.dataset.contest));
  });
}

/**
 * The data-status mark at the end of each state's row (user, 2026-10-28): its shape says how the
 * state's data arrives (dots = automatic feed, folder = drop folder you save into, hand = typed
 * in), its color how fresh it is (gray before polls close, green, yellow, red); a failing
 * automatic feed shows a red "!". Hover for the details. A reminder of which states need pulling.
 */
function feedStatus(feed) {
  if (!feed) return '<div class="feed-status"></div>';
  const icon = feed.level === 'broken' ? '<b>!</b>' : ICONS[feed.kind];
  return `<div class="feed-status level-${feed.level}" title="${escapeHtml(feed.text)}">${icon}</div>`;
}

// Small drawn icons (no icon font, nothing from the internet). They use the text color.
const ICONS = {
  auto: `<svg viewBox="0 0 18 6" width="18" height="6" aria-label="automatic feed">
    <circle cx="3" cy="3" r="2.2" fill="currentColor" /><circle cx="9" cy="3" r="2.2" fill="currentColor" />
    <circle cx="15" cy="3" r="2.2" fill="currentColor" /></svg>`,
  drop: `<svg viewBox="0 0 16 13" width="16" height="13" aria-label="drop folder">
    <path d="M1 2.5 a1 1 0 0 1 1-1 h4 l1.5 1.5 h6.5 a1 1 0 0 1 1 1 v7.5 a1 1 0 0 1-1 1 h-12 a1 1 0 0 1-1-1 z"
      fill="currentColor" /></svg>`,
  hand: `<svg viewBox="0 0 14 16" width="13" height="15" aria-label="hand entry">
    <path d="M3 8 V3.2 a1 1 0 0 1 2 0 V7 V2 a1 1 0 0 1 2 0 V7 V2.6 a1 1 0 0 1 2 0 V7.4 V4 a1 1 0 0 1 2 0
      V10 a5 5 0 0 1-5 5 h-.5 a4.5 4.5 0 0 1-3.6-1.8 L.6 10.4 a1 1 0 0 1 1.6-1.2 Z" fill="currentColor" /></svg>`,
};

/** "Senate net, called races: D +2 plus Osborn (6 of 15 called)" (user, 2026-10-28). */
function senateNet(net) {
  if (!net) return '';
  return `<div class="senate-net">Senate net, called races: <b>${colored(net.label, net.party)}</b>
    <span class="muted">(${net.called} of ${net.total} called)</span></div>`;
}

function cell(summary, selected) {
  if (!summary) return '<div class="cell empty">—</div>';
  const isSelected = summary.contest_id === selected ? ' selected' : '';
  // Called by a network: inverted colors (party background, light text) at a glance.
  const called = summary.called_party ? ` called called-${['D', 'R'].includes(summary.called_party) ? summary.called_party : 'I'}` : '';
  return `<button type="button" class="cell${isSelected}${called}" data-contest="${escapeHtml(summary.contest_id)}"
    title="${escapeHtml(summary.contest_id)}">${cellBody(summary)}</button>`;
}

function cellBody(summary) {
  // No "1st round" tag for AK/ME here: the race title says ranked-choice (user, 2026-10-24).
  const rcv =
    // (No ✎ for hand-typed numbers here: the Data column's hand icon says so; user, 2026-10-28.)
    (summary.votecast_due ? ' <span class="tag due">VoteCast due</span>' : '');
  if (summary.status === 'counting') {
    // Margin (bold), then win probability (once the model exists), then % in, lighter.
    const win = summary.win_probability_label
      ? ` ${colored(summary.win_probability_label, summary.win_probability_party)}`
      : '';
    return `<span class="margin">${colored(summary.implied_label, summary.implied_party)}</span>${win}
      <span class="faint">(${escapeHtml(summary.pct_expected_label)})</span>${rcv}`;
  }
  if (summary.status === 'error') return '<span class="tag warn">problem</span>';
  const closes = summary.first_close_time ? new Date(summary.first_close_time) : null;
  const beforeClose = closes && new Date() < closes;
  const when = closes ? easternTime(closes) : ''; // clock time only: "12:00 AM", not the date
  if (beforeClose) return `<span class="faint">closes ${when}</span>${rcv}`;
  const idle = summary.status === 'no_feed' ? 'no feed' : 'no votes yet';
  return `<span class="faint">${idle}</span>${rcv}`;
}
