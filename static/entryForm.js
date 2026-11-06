/**
 * The "Enter results by hand" form: a statewide row plus the state's key counties
 * (config/key_counties.toml), each with left, right and other votes, and a status per county.
 *
 * It lives in its own panel (#entry-panel), which the page's 30-second refresh never redraws,
 * so numbers being typed can't be wiped. It opens prefilled with the race's last save, so on the
 * night you just overwrite the numbers that changed and press Save (or Enter).
 *
 * Saving: the server refuses impossible input (shown in red, fix it and save again) and holds back
 * input that looks like a typo, such as a count going down (shown in amber, with a "Save anyway"
 * button). Commas in numbers are fine: "1,204,330" is read as 1204330.
 */

import { fetchEntryForm, saveEntry } from './api.js';
import { colored, escapeHtml } from './util.js';

const STATUS_OPTIONS = [
  ['counting', 'counting'],
  ['early_only', 'early votes only'],
  ['eday_done', 'ED done, mail counting'], // Election Day done, mail/absentee still counting
  ['complete', 'fully counted'],
];

/**
 * Warn, beside the boxes, when the open form is for a different race than the one being viewed.
 * The form deliberately stays on its race when you click elsewhere (so typing isn't lost), but
 * then it's easy to type one race's numbers into another's form. Called on every page redraw and
 * whenever a form opens; works for both this form and the VoteCast form (votecastForm.js).
 * `viewing` is {id, label} of the race open in the race panel.
 */
export function showRaceMismatch(element, viewing) {
  const box = element.querySelector('.entry-mismatch');
  if (!box) return;
  const differs = Boolean(viewing?.id) && element.dataset.contest !== viewing.id;
  box.hidden = !differs;
  element.classList.toggle('mismatch', differs);
  if (differs) {
    box.innerHTML = `⚠ This form is for <b>${escapeHtml(element.dataset.label)}</b>, not
      ${escapeHtml(viewing.label)}, the race you're viewing.`;
  }
}

export async function openEntryForm(element, contestId, { onSaved, viewing }) {
  element.hidden = false;
  element.innerHTML = '<div class="message">Loading the form…</div>';
  let form;
  try {
    form = await fetchEntryForm(contestId);
  } catch (error) {
    element.innerHTML = `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
    return;
  }
  draw(element, form, onSaved);
  showRaceMismatch(element, viewing());
}

export function closeEntryForm(element) {
  element.hidden = true;
  element.innerHTML = '';
  delete element.dataset.contest;
  delete element.dataset.label;
  element.classList.remove('mismatch');
}

/** "CNN | SoS": where to read the numbers to type in (config/dashboard.toml [result_links];
 *  user, 2026-11-03). Opens in a new tab so the form, and what's typed in it, stays put. */
function resultLinks(links) {
  const names = { cnn: 'CNN', sos: 'SoS' };
  const parts = Object.entries(names)
    .filter(([key]) => links?.[key])
    .map(([key, name]) => `<a href="${escapeHtml(links[key])}" target="_blank" rel="noopener">${name}</a>`);
  return parts.length ? `<span class="entry-links">${parts.join(' | ')}</span>` : '';
}

function draw(element, form, onSaved) {
  element.dataset.contest = form.contest_id; // which race this form is for (see showRaceMismatch)
  element.dataset.label = form.label;
  const left = colored(`${form.left.name} (${form.left.party})`, form.left.party);
  const right = colored(`${form.right.name} (${form.right.party})`, form.right.party);
  const counties = form.counties.map((county, index) => countyRow(county, index, form)).join('');
  const noCounties = form.counties.length
    ? ''
    : '<tr><td colspan="5" class="faint">No key counties listed for this state (config/key_counties.toml).</td></tr>';
  element.innerHTML = `
    <div class="entry-head">
      <h2>Enter results by hand: ${escapeHtml(form.label)}</h2>
      ${resultLinks(form.links)}
      <button type="button" class="entry-close" title="Close the form (nothing unsaved is kept)">Close</button>
    </div>
    ${form.replay ? '<div class="entry-practice">Practice: saved inside the replay folder, never with the real night\'s entries.</div>' : ''}
    <form class="entry-form" autocomplete="off">
      <div class="entry-body">
      <table class="entry-table">
        <thead><tr><th></th><th>${left}</th><th>${right}</th><th>Other</th><th>Status</th>
          <th title="Only with 'Election Day done, mail counting': % of mail/absentee counted so far (optional)">Mail %</th></tr></thead>
        <tbody>
          <tr class="statewide">
            <td>Statewide</td>
            ${numberCell('statewide', 'left', form.statewide.left, `Statewide, ${form.left.name} votes`)}
            ${numberCell('statewide', 'right', form.statewide.right, `Statewide, ${form.right.name} votes`)}
            ${numberCell('statewide', 'other', form.statewide.other, 'Statewide, other votes')}
            <td class="faint">from TV/AP</td><td></td>
          </tr>
          ${counties}${noCounties}
        </tbody>
      </table>
      <div class="entry-mismatch" hidden></div>
      </div>
      <div class="entry-actions">
        <button type="submit" class="primary">Save</button>
        <span class="entry-status muted">${form.saved_at ? `Last saved ${escapeHtml(form.saved_at)}` : 'Nothing saved yet for this race.'}</span>
      </div>
      <div class="entry-feedback"></div>
    </form>`;

  element.querySelector('.entry-close').addEventListener('click', () => closeEntryForm(element));
  element.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit(element, form, false, onSaved);
  });
  // The mail % box is open only for "Election Day done, mail counting".
  element.querySelectorAll('select[name$="-status"]').forEach((select) => {
    select.addEventListener('change', () => {
      const box = element.querySelector(`[name="${select.name.replace('-status', '-mail')}"]`);
      box.disabled = select.value !== 'eday_done';
      if (box.disabled) box.value = '';
    });
  });
}

function countyRow(county, index, form) {
  const options = STATUS_OPTIONS.map(
    ([value, label]) =>
      `<option value="${value}"${county.status === value ? ' selected' : ''}>${label}</option>`,
  ).join('');
  return `<tr data-county="${index}">
      <td>${escapeHtml(county.name)}</td>
      ${numberCell(`county-${index}`, 'left', county.left, `${county.name}, ${form.left.name} votes`)}
      ${numberCell(`county-${index}`, 'right', county.right, `${county.name}, ${form.right.name} votes`)}
      ${numberCell(`county-${index}`, 'other', county.other, `${county.name}, other votes`)}
      <td><select name="county-${index}-status" title="ED done = every Election Day precinct in, mail/absentee still being counted" aria-label="${escapeHtml(county.name)}, status">${options}</select></td>
      <td><input type="text" inputmode="decimal" class="mail-pct" name="county-${index}-mail"
        value="${county.mail_pct ?? ''}" aria-label="${escapeHtml(county.name)}, % of mail counted"
        ${county.status === 'eday_done' ? '' : 'disabled'} placeholder="—" /></td>
    </tr>`;
}

function numberCell(row, side, value, label) {
  const shown = value === null || value === undefined ? '' : value.toLocaleString('en-US');
  return `<td><input type="text" inputmode="numeric" name="${row}-${side}" value="${shown}"
    aria-label="${escapeHtml(label)}" /></td>`;
}

/** Read the boxes into the shape the server expects. Returns {fields} or {error}. */
function readForm(element, form) {
  const get = (name) => element.querySelector(`[name="${name}"]`).value.trim();
  const problems = [];
  const number = (name, where) => {
    const text = get(name).replaceAll(',', '').replaceAll(' ', '');
    if (text === '') return null;
    if (!/^\d+$/.test(text)) {
      problems.push(`${where}: "${get(name)}" isn't a whole number.`);
      return null;
    }
    return Number(text);
  };
  const fields = {
    statewide: {
      left: number('statewide-left', 'Statewide, left'),
      right: number('statewide-right', 'Statewide, right'),
      other: number('statewide-other', 'Statewide, other'),
    },
    counties: form.counties.map((county, index) => ({
      name: county.name,
      left: number(`county-${index}-left`, `${county.name}, left`),
      right: number(`county-${index}-right`, `${county.name}, right`),
      other: number(`county-${index}-other`, `${county.name}, other`),
      status: get(`county-${index}-status`),
      mail_pct: mailPercent(`county-${index}-mail`, county.name),
    })),
  };
  return problems.length ? { error: problems.join(' ') } : { fields };

  /** The optional mail % box: blank, or a number 0-100 (the server checks it again). */
  function mailPercent(name, where) {
    const text = get(name).replace('%', '');
    if (text === '') return null;
    const value = Number(text);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      problems.push(`${where}: mail % must be 0 to 100.`);
      return null;
    }
    return value;
  }
}

async function submit(element, form, override, onSaved) {
  const feedback = element.querySelector('.entry-feedback');
  const read = readForm(element, form);
  if (read.error) {
    feedback.innerHTML = `<div class="entry-problem error">${escapeHtml(read.error)}</div>`;
    return;
  }
  feedback.innerHTML = '<div class="muted">Saving…</div>';
  let answer;
  try {
    answer = await saveEntry(form.contest_id, read.fields, override);
  } catch (error) {
    feedback.innerHTML = `<div class="entry-problem error">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!answer.saved) {
    const list = answer.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
    feedback.innerHTML = `<div class="entry-problem warn">Not saved yet. These look like typos:
        <ul>${list}</ul>
        Fix them and Save, or <button type="button" class="save-anyway">Save anyway</button></div>`;
    feedback.querySelector('.save-anyway').addEventListener('click', () => {
      submit(element, form, true, onSaved);
    });
    return;
  }
  feedback.innerHTML = '';
  element.querySelector('.entry-status').textContent = `Saved ${answer.saved_at}`;
  onSaved();
}
