/**
 * Talking to the local server (server.py). One route: everything the page shows, in one bundle.
 *
 * If the server can't be reached, the error says what to do, because "fetch failed" is no help
 * at 11 pm on election night.
 */

export class OfflineError extends Error {}

export async function fetchState() {
  let response;
  try {
    response = await fetch('/api/state', { cache: 'no-store' });
  } catch {
    throw new OfflineError(
      'Can\'t reach the dashboard server. Is "python server.py" still running? ' +
        'The numbers below are from the last successful update.',
    );
  }
  if (!response.ok) {
    throw new OfflineError(
      `The dashboard server returned an error (${response.status}). Check its PowerShell window. ` +
        'The numbers below are from the last successful update.',
    );
  }
  return response.json();
}

/** Log a network's call of a race for 'left' or 'right' (or undo it with withdraw). */
export function logCall(contestId, network, winner, withdraw = false) {
  return postJson(`/api/calls/${encodeURIComponent(contestId)}`, { network, winner, withdraw });
}

/** Practice mode only: show step N of the practice night. */
export async function setPracticeStep(step) {
  const response = await requestOrOffline('/api/practice/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/** A state's county census fields (for the county table's last column). */
export async function fetchCensus(state) {
  const response = await requestOrOffline(`/api/census/${encodeURIComponent(state)}`);
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/** The hand-entry form for a race, prefilled from its last save. */
export async function fetchEntryForm(contestId) {
  const response = await requestOrOffline(`/api/entry/${encodeURIComponent(contestId)}`);
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/**
 * Save hand-entered results. Resolves to the server's answer: {saved: true, saved_at} or
 * {saved: false, warnings}. Rejects with the server's message for impossible input.
 */
export async function saveEntry(contestId, form, override) {
  const response = await requestOrOffline(`/api/entry/${encodeURIComponent(contestId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ form, override }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/** The VoteCast form for a race, with its saved reading if there is one. */
export async function fetchVoteCastForm(contestId) {
  const response = await requestOrOffline(`/api/votecast/${encodeURIComponent(contestId)}`);
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

/** What the typed VoteCast numbers give (labels and typo warnings); nothing is saved. */
export function previewVoteCast(contestId, fields) {
  return postJson(`/api/votecast/${encodeURIComponent(contestId)}/preview`, { fields });
}

/** Save a race's VoteCast reading. Rejects with the server's message (including "already
 *  entered" when a reading exists and `override` is false). */
export function saveVoteCast(contestId, fields, override) {
  return postJson(`/api/votecast/${encodeURIComponent(contestId)}`, { fields, override });
}

async function postJson(path, body) {
  const response = await requestOrOffline(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json();
}

async function requestOrOffline(path, options) {
  try {
    return await fetch(path, { cache: 'no-store', ...options });
  } catch {
    throw new OfflineError(
      'Can\'t reach the dashboard server, so nothing was saved. Is "python server.py" still running?',
    );
  }
}

async function errorText(response) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  return `The server refused it (${response.status}).`;
}
