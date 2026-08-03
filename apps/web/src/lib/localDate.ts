/**
 * Today's date as the reader's own calendar sees it, `YYYY-MM-DD`.
 *
 * `new Date().toISOString().slice(0, 10)` reads the UTC day, not the reader's. West of UTC in the
 * evening, the two disagree: at 7pm in New Orleans (UTC-5), `toISOString()` already reports
 * tomorrow. The log-a-read dialog defaulted to exactly that expression, so a reread finished this
 * evening silently pre-filled with tomorrow's date — editable, so not a forced error, but a wrong
 * default that seeds the app's only dated reading history with an off-by-one day nobody asked for.
 *
 * `getFullYear()` / `getMonth()` / `getDate()` are the LOCAL accessors on `Date` — the fix is using
 * those instead of the UTC-based `toISOString()`, not a timezone library.
 */
export function todayLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
