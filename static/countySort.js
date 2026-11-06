/**
 * Re-ordering the county table on the page. This only changes the ORDER of rows (and where the
 * category divider lines go); every number shown still comes ready-made from the server.
 *
 * A sort is { key, descending }:
 *   key 'name', 'pct_expected', 'margin', 'needs', 'over', 'net_votes'
 *                     a table column, using the row's raw `sort` values (click its header)
 *   key 'census'      the county census field picked in the last column's dropdown
 *
 * Default when a race opens: Net votes, the left candidate's biggest gains first. Clicking Net
 * votes flips between the left's and the right's biggest gains (user, 2026-10-27).
 * Margins are left minus right, so "high to low" puts the left candidate's best counties first.
 * Rows with nothing to sort by (e.g. an unreported county's margin) always go last.
 *
 * Census categories (area type, metro/rural, NCHS level) sort urban to rural (or the reverse),
 * then by population within each category, with a divider line between categories (user,
 * 2026-10-27). Number fields just sort.
 */

export const DEFAULT_SORT = { key: 'net_votes', descending: true };

const COLUMN_KEYS = ['name', 'pct_expected', 'margin', 'needs', 'over', 'net_votes', 'census'];

/** A remembered sort that no longer exists (e.g. the old 'Biggest effect') falls back to default. */
export function validSort(sort) {
  return sort && COLUMN_KEYS.includes(sort.key) ? sort : DEFAULT_SORT;
}

/** The sort after clicking `key`: the same key flips direction; a new key starts high-to-low
 *  (A-to-Z for county names). */
export function nextSort(current, key) {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: key !== 'name' };
}

/** The sort after picking a census field: categories start urban-first, numbers high-to-low. */
export function censusSort(field) {
  return { key: 'census', descending: field.kind !== 'text' };
}

/**
 * `counties` in the order `sort` asks for. `census` is the state's census data (or null while it
 * loads) and `field` the picked census field. Returns [{county, divider}], divider = true on the
 * first row of each new category (census categories only).
 */
export function sortCounties(counties, sort, census, field) {
  const byCensus = sort.key === 'census' && census && field;
  const valueOf = byCensus
    ? (county) => census.counties[county.fips]?.[field.key]?.value ?? null
    : (county) => county.sort[sort.key] ?? null;
  const population = (county) => census?.counties[county.fips]?.population ?? 0;
  const categories = byCensus && field.kind === 'text';
  const direction = sort.descending ? -1 : 1;

  const sorted = [...counties].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1; // nothing to sort by: always last
    if (right === null) return -1;
    const order = typeof left === 'string' ? left.localeCompare(right) : left - right;
    if (order !== 0) return direction * order;
    return categories ? population(b) - population(a) : 0; // biggest first within a category
  });

  return sorted.map((county, index) => ({
    county,
    divider: categories && index > 0 && valueOf(county) !== valueOf(sorted[index - 1]),
  }));
}
