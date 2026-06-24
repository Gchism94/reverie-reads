# Offline mirror & conflict policy

## Mirror
The TanStack Query cache (library, lists, reads, clubs, …) is persisted to IndexedDB via a
Dexie-backed persister (`apps/web/src/lib/offlineCache.ts`, wired in `main.tsx` through
`PersistQueryClientProvider`). On launch the cache is restored before render, so the app
**opens, browses, searches, and filters with the network off**. `gcTime` (7 days) outlasts
`maxAge` so cached queries survive to be restored.

## Writes while offline
Every mutation is optimistic: `onMutate` patches the cache immediately, so an edit made
offline shows at once and is persisted to IndexedDB. With the default `networkMode: 'online'`,
the network call is **paused** while offline and **auto-resumes on reconnect**
(`resumePausedMutations` is also called when the persisted client is restored). Nothing is
lost; queued edits flush when connectivity returns.

## Conflict policy — reconcile, don't clobber
- **Books: field-level last-write-wins.** Mutations send a *partial* row
  (`toBookRow(patch)` emits only the fields the user actually changed). An offline edit to
  `fave` therefore updates only `owned_*`/`fave`/whatever changed — it does **not** overwrite a
  concurrent server-side change to `rating` or `progress`. Two readers editing *different*
  fields of the same book both keep their change. Two readers editing the *same* field resolve
  to the later write.
- **Child rows merge, never replace.** Reread-log entries (`reads`), `reviews`, and list
  memberships (`list_items`) are inserted/deleted as individual rows — they accumulate across
  clients rather than overwriting each other. Reads dedupe by date; reviews are unique per
  `(work_key, reviewer)`; list items are unique per `(list, book)`.
- **Shared docs (capability lists)** are read-modify-write with last-write-wins on the whole
  document, re-read immediately before each edit to minimize clobbering (the prototype's model).

### Verification
`tests/two-client reconcile` (run against the local stack): client A sets `fave`, client B sets
`rating` on the same book while "offline", both flush on reconnect → the final row carries
**both** changes (no clobber). Field-level merge confirmed.
