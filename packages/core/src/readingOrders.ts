// Reading orders (docs/DATA_MODEL.md) — a user-defined, named, ORDERED sequence that can span
// multiple series + standalones (e.g. two interconnected series read in a specific interleaved
// order). Distinct from `series` (intrinsic to a book) and `lists` (unordered collections): a
// reading order is an OVERLAY. A book keeps its own series + position and may also appear in one or
// more reading orders at different positions.
//
// An item is either a BOOK (core) or a SERIES reference (expands to that series' books in series
// order at that slot). Positions are FRACTIONAL so a drag-insert between two items never collides;
// renumberItems() re-spaces them when a gap gets too tight.

import type { Book } from './types'
import { isBookRead, groupSeries } from './filters'

export type ReadingOrderItemKind = 'book' | 'series'

export interface ReadingOrderItem {
  id: string
  kind: ReadingOrderItemKind
  /** set when kind = 'book' */
  bookId?: string
  /** set when kind = 'series' (the series name — series are identified by name in this app) */
  series?: string
  /** optional per-item note, e.g. "read to ch.20 before B2" */
  note?: string
  /** fractional sort key (see POSITION_STEP); insert = midpoint between neighbours */
  position: number
}

export interface ReadingOrder {
  id: string
  name: string
  description?: string
  items: ReadingOrderItem[]
}

/** Initial spacing between positions — leaves room for ~many midpoint inserts before a renumberItems. */
export const POSITION_STEP = 1024

/** Items in display order. */
export const sortItems = (items: readonly ReadingOrderItem[]): ReadingOrderItem[] =>
  [...items].sort((a, b) => a.position - b.position)

/** Position to append after the last item. */
export function appendPosition(items: readonly ReadingOrderItem[]): number {
  if (!items.length) return POSITION_STEP
  return Math.max(...items.map((i) => i.position)) + POSITION_STEP
}

/**
 * A fractional position that places a new (or moved) item at slot `index` in the sorted list.
 * index <= 0 → before the first; index >= len → after the last; otherwise the midpoint between the
 * neighbours. `excludeId` omits an item being moved so it isn't treated as its own neighbour.
 */
export function insertPositionAt(
  items: readonly ReadingOrderItem[],
  index: number,
  excludeId?: string,
): number {
  const sorted = sortItems(items.filter((i) => i.id !== excludeId))
  if (!sorted.length) return POSITION_STEP
  if (index <= 0) return sorted[0]!.position - POSITION_STEP
  if (index >= sorted.length) return sorted[sorted.length - 1]!.position + POSITION_STEP
  return (sorted[index - 1]!.position + sorted[index]!.position) / 2
}

/** True when two positions collide or any gap is too small to insert between safely. */
export function needsRenumber(items: readonly ReadingOrderItem[]): boolean {
  const sorted = sortItems(items)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.position - sorted[i - 1]!.position < 1e-6) return true
  }
  return false
}

/** Re-space positions to clean multiples of POSITION_STEP, preserving order. */
export const renumberItems = (items: readonly ReadingOrderItem[]): ReadingOrderItem[] =>
  sortItems(items).map((it, i) => ({ ...it, position: (i + 1) * POSITION_STEP }))

/**
 * Move the item `id` to slot `toIndex` (in the current sorted order) and return the full list with
 * its new fractional position — renumbering everything if the midpoint would collide. Stable: the
 * result is always strictly ordered with distinct positions.
 */
export function reorderItems(
  items: readonly ReadingOrderItem[],
  id: string,
  toIndex: number,
): ReadingOrderItem[] {
  const moving = items.find((i) => i.id === id)
  if (!moving) return [...items]
  const pos = insertPositionAt(items, toIndex, id)
  const next = items.map((i) => (i.id === id ? { ...i, position: pos } : i))
  return needsRenumber(next) ? renumberItems(next) : sortItems(next)
}

/** A book resolved from the order, with the item it came from + any note. */
export interface ExpandedEntry {
  book: Book
  itemId: string
  note?: string
  /** the series name when this entry came from expanding a series item */
  viaSeries?: string
}

/**
 * Resolve the order to a flat book sequence: a `book` item yields its book; a `series` item expands
 * to that series' books in series order at that slot. Books missing from the library are skipped;
 * duplicates (a book listed explicitly AND inside an expanded series) are deduped, first slot wins.
 */
export function expandOrder(
  items: readonly ReadingOrderItem[],
  library: readonly Book[],
): ExpandedEntry[] {
  const byId = new Map(library.map((b) => [b.id, b]))
  const seriesBooks = new Map(groupSeries(library).map((g) => [g.name, g.books]))
  const out: ExpandedEntry[] = []
  const seen = new Set<string>()
  const push = (book: Book, itemId: string, note?: string, viaSeries?: string) => {
    if (seen.has(book.id)) return
    seen.add(book.id)
    out.push({ book, itemId, note, viaSeries })
  }
  for (const it of sortItems(items)) {
    if (it.kind === 'book' && it.bookId) {
      const b = byId.get(it.bookId)
      if (b) push(b, it.id, it.note)
    } else if (it.kind === 'series' && it.series) {
      for (const b of seriesBooks.get(it.series) ?? []) push(b, it.id, it.note, it.series)
    }
  }
  return out
}

/** The next entry to read along the order: the first whose book isn't read yet. */
export function nextInOrder(expanded: readonly ExpandedEntry[]): ExpandedEntry | null {
  return expanded.find((e) => !isBookRead(e.book)) ?? null
}

/** Read-progress along the order. */
export function orderProgress(expanded: readonly ExpandedEntry[]): { read: number; total: number } {
  return { read: expanded.filter((e) => isBookRead(e.book)).length, total: expanded.length }
}

/** Names of the reading orders a given book participates in (explicitly or via a series item). */
export function ordersForBook(book: Book, orders: readonly ReadingOrder[]): ReadingOrder[] {
  return orders.filter((o) =>
    o.items.some((it) =>
      it.kind === 'book' ? it.bookId === book.id : !!book.series && it.series === book.series,
    ),
  )
}
