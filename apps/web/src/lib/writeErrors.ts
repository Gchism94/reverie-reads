import { useSyncExternalStore } from 'react'

/**
 * The write-failure channel.
 *
 * Every mutation in the data layer used to handle failure the same way: roll the optimistic patch
 * back and say nothing. A rejected write was therefore indistinguishable from a successful one —
 * the edit appeared, then quietly reverted. That is exactly how a CHECK-constraint rejection on a
 * publication date went unexplained (and took every other field in the dialog with it).
 *
 * Failures land here and get shown. The reporting is wired ONCE, at the QueryClient's MutationCache,
 * so it covers the whole data layer rather than each hook remembering to opt in.
 */

export interface WriteError {
  id: number
  /** what the reader was doing, from the mutation's `meta.action` */
  action: string
  /** a short, human reading of the failure — never a raw Postgres string */
  detail: string
}

/** Mutations name themselves through `meta` so the toast can say what failed. */
export interface MutationMeta {
  action?: string
}

// Register the shape app-wide, so `meta: { action: … }` is type-checked at every call site and
// `mutation.options.meta` arrives typed at the MutationCache handler.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationMeta
  }
}

let nextId = 1
let errors: WriteError[] = []
const listeners = new Set<() => void>()

const emit = () => {
  for (const l of listeners) l()
}

/** Postgres speaks in constraint names. Translate the ones a reader can actually act on. */
export function readableWriteError(error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '')

  if (/books_pub_m_check/.test(raw)) return 'The publication month has to be between 1 and 12.'
  if (/books_pub_d_check/.test(raw)) return 'The publication day has to be between 1 and 31.'
  if (/books_status_check/.test(raw)) return 'That series status isn’t one of the allowed values.'
  if (/books_ownership_check/.test(raw)) return 'That ownership value isn’t one of the allowed values.'
  if (/books_rating_check|reads_rating_check/.test(raw)) return 'A rating has to be between 0 and 5.'
  if (/duplicate key|already exists|_uidx/.test(raw)) return 'That already exists.'
  if (/row-level security|permission denied|JWT|401|403/i.test(raw)) return 'You’re signed out, or that isn’t yours to change.'
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'No connection — the change didn’t reach the server.'
  if (/violates check constraint/.test(raw)) return 'One of those values isn’t allowed.'
  return 'The change didn’t save.'
}

export function reportWriteError(error: unknown, meta?: MutationMeta): void {
  const entry: WriteError = {
    id: nextId++,
    action: meta?.action ?? 'Saving',
    detail: readableWriteError(error),
  }
  // Keep the last few; a burst from one failed dialog shouldn't bury the screen.
  errors = [...errors, entry].slice(-3)
  emit()
}

export function dismissWriteError(id: number): void {
  errors = errors.filter((e) => e.id !== id)
  emit()
}

export function clearWriteErrors(): void {
  errors = []
  emit()
}

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const snapshot = (): WriteError[] => errors

export function useWriteErrors(): WriteError[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
