/**
 * The "Enter call" form (user, 2026-10-28): log one network's call of a race. Pick the outlet
 * (NYT, CNN or Fox; you won't log all three), then click the candidate it called the race for.
 * The call is stamped with the time of the click and saved with the needle's chance for that
 * candidate at that moment (election_night/calls.py). Calls already logged are listed below with
 * an "undo" for misclicks; undone calls are kept in the file as withdrawn.
 *
 * Like the other entry forms it lives in #entry-panel, which the 30-second refresh never redraws,
 * and it warns beside its boxes if you're now viewing a different race.
 */

import { logCall } from './api.js';
import { closeEntryForm, showRaceMismatch } from './entryForm.js';
import { colored, escapeHtml, partyClass } from './util.js';

const OUTLETS = ['NYT', 'CNN', 'Fox'];

/** `getRace()` returns the race's latest data (its calls change as you log them). */
export function openCallForm(element, getRace, { onSaved, viewing }) {
  element.hidden = false;
  draw(element, getRace, onSaved, viewing);
}

function draw(element, getRace, onSaved, viewing) {
  const race = getRace();
  element.dataset.contest = race.contest_id;
  element.dataset.label = race.label;
  const outlet = element.dataset.outlet || OUTLETS[0]; // keep the last outlet picked
  const options = OUTLETS.map(
    (o) => `<option value="${o}"${o === outlet ? ' selected' : ''}>${o}</option>`,
  ).join('');
  const candidate = (side) =>
    `<button type="button" class="call-pick ${partyClass(race[side].party)}" data-winner="${side}">
      ${escapeHtml(race[side].name)} (${escapeHtml(race[side].party)})</button>`;
  const logged = Object.entries(race.calls.networks)
    .filter(([, call]) => call)
    .map(
      ([network, call]) => `<li>${network}: ${colored(call.candidate, call.party)}
        <span class="muted">${escapeHtml(call.time)}</span>
        <button type="button" class="call-undo" data-network="${network}">undo</button></li>`,
    )
    .join('');
  element.innerHTML = `
    <div class="entry-head">
      <h2>Enter call: ${escapeHtml(race.label)}</h2>
      <button type="button" class="entry-close">Close</button>
    </div>
    <div class="entry-body">
      <div class="call-form">
        <label>Outlet <select class="call-outlet" aria-label="Which outlet's call">${options}</select></label>
        <span class="muted">called it for</span> ${candidate('left')} ${candidate('right')}
        ${logged ? `<ul class="call-list">${logged}</ul>` : '<div class="faint">No calls logged yet.</div>'}
        <div class="entry-feedback"></div>
      </div>
      <div class="entry-mismatch" hidden></div>
    </div>`;

  element.querySelector('.entry-close').addEventListener('click', () => closeEntryForm(element));
  element.querySelector('.call-outlet').addEventListener('change', (event) => {
    element.dataset.outlet = event.target.value;
  });
  const save = async (network, winner, withdraw) => {
    try {
      await logCall(race.contest_id, network, winner, withdraw);
    } catch (error) {
      element.querySelector('.entry-feedback').innerHTML =
        `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
      return;
    }
    await onSaved(); // refresh, then redraw the form with the updated calls
    draw(element, getRace, onSaved, viewing);
  };
  element.querySelectorAll('.call-pick').forEach((button) => {
    button.addEventListener('click', () =>
      save(element.querySelector('.call-outlet').value, button.dataset.winner, false),
    );
  });
  element.querySelectorAll('.call-undo').forEach((button) => {
    button.addEventListener('click', () => save(button.dataset.network, '', true));
  });
  showRaceMismatch(element, viewing());
}
