/**
 * Small helpers shared by the page's scripts.
 *
 * `partyClass` is the only place a party code becomes a color class. The colors themselves live
 * in style.css. Any party other than D or R (independents, Libertarians, ...) is shown gray.
 */

/** What the page calls its two pre-returns sources. The live dashboard says "Polls" and
 *  "VoteCast"; the shared replay names them (user, 2026-11-05), set on its <html> element by
 *  tools/export_replay.py. */
export const SOURCE_NAMES = {
  polls: document.documentElement.dataset.pollsName ?? null, // null = "Polls said ..."
  votecast: document.documentElement.dataset.votecastName ?? 'VoteCast',
};

export function partyClass(party) {
  if (party === 'D' || party === 'R') return `party-${party}`;
  return party ? 'party-I' : '';
}

/** Make text safe to put inside HTML (county or candidate names, messages from the server). */
export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Wrap text in a span colored for `party` (or plain, if party is null). */
export function colored(text, party) {
  return `<span class="${partyClass(party)}">${escapeHtml(text)}</span>`;
}

/** A Date as Eastern clock time, e.g. "9:41 PM". Uses the browser's own time-zone data. */
export function easternTime(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A Date as Eastern date and time, e.g. "Oct 22, 3:26 PM", for anything not from tonight. */
export function easternDateTime(date) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
