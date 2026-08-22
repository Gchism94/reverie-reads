/**
 * PAGE SIZE. PostgREST caps a select — ranged or not — at this many rows per response, and it does
 * so SILENTLY: no error, no warning, just a short answer.
 */
export const PAGE = 1000

/**
 * Read a whole result set, paging until a short page, and REFUSE to return a partial answer.
 *
 * Extracted from importExport.ts (#348) so the data layer has ONE paging discipline. Every read
 * that returns a row set whose size grows with the library goes through here; a second loop
 * somewhere else is how the two drift apart, and the drift is invisible because both look right
 * until the day a table crosses the cap.
 *
 * `{ count: 'exact' }` makes the server report the size of the whole match, not the page — so the
 * row count is measured by the database rather than inferred from the loop that is itself the thing
 * most likely to be wrong. A count derived from the same fetch it is checking would agree with a
 * truncated read every time.
 *
 * `order` is not cosmetic: `.range()` over an unordered select is not guaranteed to return disjoint
 * pages, so without a total order the pages can overlap and drop rows while still counting right.
 * Every caller passes a stable key.
 *
 * `label` names the read in the error. It reaches a person only when something is already wrong, so
 * it should say which read failed, not what the function does.
 */
export async function pageAll<T>(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await page(from, from + PAGE - 1)
    if (error) throw error
    const got = data ?? []
    rows.push(...got)
    if (count != null) total = count
    if (got.length < PAGE) break
    // TERMINATION, not an optimization. Without this the loop trusts the window to advance, and a
    // read that keeps returning page one — the shape a dropped `.range()` produces — spins forever
    // accumulating duplicates until the tab runs out of memory. Found by writing that regression as
    // a test: it OOM'd instead of failing. Overshooting the server's count is impossible for a
    // healthy read, so stopping there costs nothing and turns a hang into the error below.
    if (total != null && rows.length >= total) break
  }
  // Two faults, told apart because they need different fixes: SHORT means the read stopped early,
  // OVER means it never advanced and re-read the same window. Both throw — a caller that silently
  // received a partial library is the failure this whole helper exists to prevent, and every caller
  // here feeds a screen, so a wrong answer would be indistinguishable from a smaller library.
  if (total != null && rows.length !== total)
    throw new Error(
      rows.length > total
        ? `Paging did not advance for ${label} — the same rows came back until the total overshot ${total}.`
        : `Read ${rows.length} of ${total} ${label} rows — the result was truncated, not short.`,
    )
  return rows
}
