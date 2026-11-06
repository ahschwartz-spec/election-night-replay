/**
 * The bar across the top: Eastern clock, poll-close timeline, refresh button. (Feed freshness
 * moved to the race list's Data column, 2026-10-28: the text here was too heavy to read.)
 *
 * Timeline: every poll-closing time, solid once it has passed. Clicking a time highlights the
 * states that close then in the race list (click again to clear).
 */

import { easternTime, escapeHtml } from './util.js';

export function renderTopBar(element, state, { activeClosing, onClosingClick, onRefresh, now }) {
  now = now ?? new Date(); // the static replay passes the moment being shown
  const times = state.timeline
    .map((closing) => {
      const passed = now >= new Date(closing.time);
      const classes = [passed ? 'passed' : '', closing.time === activeClosing ? 'active' : ''];
      return `<button type="button" class="${classes.join(' ')}" data-time="${closing.time}"
        title="Polls close: ${escapeHtml(closing.states.join(', '))}">${escapeHtml(closing.label)}</button>`;
    })
    .join('');

  element.innerHTML = `
    <span class="clock">${easternTime(now)} ET</span>
    <span class="timeline">${times}</span>
    <span class="feeds"></span>
    ${onRefresh ? '<button type="button" class="refresh">Refresh</button>' : ''}`;

  element.querySelectorAll('.timeline button').forEach((button) => {
    button.addEventListener('click', () => onClosingClick(button.dataset.time));
  });
  element.querySelector('.refresh')?.addEventListener('click', onRefresh);
}
