/**
 * Practice mode's step buttons, inside the amber banner (testing only).
 *
 * Shown only when the server was started with `--practice <night>`; the bundle's `practice` is
 * null otherwise (live mode and plain replay), so there's nothing to show. Each click rebuilds the
 * practice night's playing folder to that step on the server, then the page refreshes.
 *
 *   PRACTICE oh-d1 · step 4 of 10 · 9:30 PM ET   [Start] [◀ Back] [Next ▶] [End]
 *
 * The ← and → keys also step back and forward (not while typing in a box).
 */

import { setPracticeStep } from './api.js';
import { escapeHtml } from './util.js';

let current = null; // the latest practice state, for the keyboard shortcuts
let onStepped = null;

export function renderPracticeBanner(banner, practice, refresh) {
  current = practice;
  onStepped = refresh;
  const { night, step, steps, time_label: time } = practice;
  banner.innerHTML = `PRACTICE ${escapeHtml(night)} · step ${step} of ${steps} · ${escapeHtml(time)}.
    Not live results.
    <span class="practice-steps">
      <button type="button" data-step="0" ${step === 0 ? 'disabled' : ''}>Start</button>
      <button type="button" data-step="${step - 1}" ${step === 0 ? 'disabled' : ''}>◀ Back</button>
      <button type="button" data-step="${step + 1}" ${step === steps ? 'disabled' : ''}>Next ▶</button>
      <button type="button" data-step="${steps}" ${step === steps ? 'disabled' : ''}>End</button>
    </span>`;
  banner.querySelectorAll('button[data-step]').forEach((button) => {
    button.addEventListener('click', () => goTo(Number(button.dataset.step)));
  });
}

async function goTo(step) {
  if (!current || step < 0 || step > current.steps) return;
  try {
    await setPracticeStep(step);
  } catch (error) {
    window.alert(error.message);
    return;
  }
  onStepped();
}

document.addEventListener('keydown', (event) => {
  if (!current) return;
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowRight') goTo(current.step + 1);
  if (event.key === 'ArrowLeft') goTo(current.step - 1);
});
