/**
 * The VoteCast form: one race's poll-close reading, typed ONCE from AP VoteCast or Fox News Voter
 * Analysis, then frozen (docs/decisions/votecast.md).
 *
 * You type the gender crosstabs as published (percent). As you type, the server computes the
 * imputed topline, before and after the bias correction, and flags likely typos (men + women not
 * about 100, the two candidates adding to far less than 100 in a group). Save locks it.
 *
 * If a reading is already saved, the form shows it and refuses to save again unless you tick
 * "replace it": that's only for fixing a typo, never for typing in a later number (later numbers
 * are re-weighted toward the returns and would count the vote twice).
 *
 * Like the results form, it lives in #entry-panel, which the 30-second refresh never redraws.
 */

import { fetchVoteCastForm, previewVoteCast, saveVoteCast } from './api.js';
import { closeEntryForm, showRaceMismatch } from './entryForm.js';
import { colored, escapeHtml } from './util.js';

const BOXES = [
  ['men_share', "Men's share of voters"],
  ['women_share', "Women's share of voters"],
  ['left_among_men', 'among men'],
  ['right_among_men', 'among men'],
  ['left_among_women', 'among women'],
  ['right_among_women', 'among women'],
];

export async function openVoteCastForm(element, contestId, { onSaved, viewing }) {
  element.hidden = false;
  element.innerHTML = '<div class="message">Loading the form…</div>';
  let form;
  try {
    form = await fetchVoteCastForm(contestId);
  } catch (error) {
    element.innerHTML = `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
    return;
  }
  draw(element, form, onSaved, viewing);
  showRaceMismatch(element, viewing());
}

function draw(element, form, onSaved, viewing) {
  element.dataset.contest = form.contest_id; // which race this form is for (see showRaceMismatch)
  element.dataset.label = form.label;
  const left = colored(`${form.left.name} (${form.left.party})`, form.left.party);
  const right = colored(`${form.right.name} (${form.right.party})`, form.right.party);
  const sources = form.sources
    .map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`)
    .join('');
  const saved = form.saved
    ? `<div class="entry-problem warn">Already entered at ${escapeHtml(form.saved.entered_at)}
        (${escapeHtml(form.saved.source)}): ${readingText(form.saved)}. Frozen.
        <label class="replace"><input type="checkbox" name="override" />
          Replace it (only to fix a typo, never with a later number)</label></div>`
    : '';
  element.innerHTML = `
    <div class="entry-head">
      <h2>VoteCast at poll close: ${escapeHtml(form.label)}</h2>
      <button type="button" class="entry-close">Close</button>
    </div>
    ${form.replay ? '<div class="entry-practice">Practice: saved inside the replay folder, never with the real night\'s entries.</div>' : ''}
    ${saved}
    <form class="entry-form votecast-form" autocomplete="off">
      <div class="votecast-source">Source <select name="source" aria-label="Source">${sources}</select></div>
      <div class="entry-body">
      <table class="entry-table">
        <thead><tr><th></th><th>Share of voters</th><th>${left}</th><th>${right}</th></tr></thead>
        <tbody>
          <tr><td>Men</td>${box('men_share')}${box('left_among_men')}${box('right_among_men')}</tr>
          <tr><td>Women</td>${box('women_share')}${box('left_among_women')}${box('right_among_women')}</tr>
        </tbody>
      </table>
      <div class="entry-mismatch" hidden></div>
      </div>
      <div class="votecast-preview muted">Type the crosstabs (percent) to see the topline.</div>
      <div class="entry-actions">
        <button type="submit" class="primary">Save and lock</button>
      </div>
      <div class="entry-feedback"></div>
    </form>`;

  element.querySelector('.entry-close').addEventListener('click', () => closeEntryForm(element));
  element.querySelectorAll('input[data-box]').forEach((input) => {
    input.addEventListener('input', () => preview(element, form));
  });
  element.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit(element, form, onSaved, viewing);
  });
}

function box(name) {
  const label = BOXES.find(([key]) => key === name)[1];
  return `<td><input type="text" inputmode="decimal" data-box="${name}" name="${name}"
    aria-label="${escapeHtml(`${name.startsWith('left') ? 'Left candidate' : name.startsWith('right') ? 'Right candidate' : ''} ${label}`.trim())}" />%</td>`;
}

/** "R+7.2 as published, R+8.7 after the D+1.5 correction" (bias from config/needle.toml). */
function readingText(labels) {
  return `${colored(labels.raw_label, labels.raw_party)} as published,
    <b>${colored(labels.corrected_label, labels.corrected_party)}</b> after the
    ${escapeHtml(labels.bias_label)} correction`;
}

/** The boxes as numbers, or null if any is blank or not a number. */
function readFields(element) {
  const fields = { source: element.querySelector('[name="source"]').value };
  for (const [name] of BOXES) {
    const text = element.querySelector(`[name="${name}"]`).value.trim().replace('%', '');
    if (text === '' || Number.isNaN(Number(text))) return null;
    fields[name] = Number(text);
  }
  return fields;
}

let previewTimer = null;

function preview(element, form) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const target = element.querySelector('.votecast-preview');
    const fields = readFields(element);
    if (!target) return;
    if (!fields) {
      target.innerHTML = 'Type all six numbers to see the topline.';
      return;
    }
    try {
      const answer = await previewVoteCast(form.contest_id, fields);
      const warnings = answer.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
      target.innerHTML = `Topline: ${readingText(answer)}
        ${warnings ? `<div class="entry-problem warn">Check these:<ul>${warnings}</ul></div>` : ''}`;
    } catch (error) {
      target.innerHTML = `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
    }
  }, 250); // wait for a pause in typing, not every keystroke
}

async function submit(element, form, onSaved, viewing) {
  const feedback = element.querySelector('.entry-feedback');
  const fields = readFields(element);
  if (!fields) {
    feedback.innerHTML = '<div class="entry-problem error">Fill in all six numbers first.</div>';
    return;
  }
  const override = element.querySelector('[name="override"]')?.checked ?? false;
  try {
    await saveVoteCast(form.contest_id, fields, override);
  } catch (error) {
    feedback.innerHTML = `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
    return;
  }
  onSaved();
  // Reopen to show the frozen reading (and the lock) exactly as saved.
  openVoteCastForm(element, form.contest_id, { onSaved, viewing });
}
