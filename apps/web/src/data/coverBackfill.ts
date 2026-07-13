import { useEffect } from 'react'
import { isStoredCoverUrl, type Book } from '@reverie/core'
import { useSetCover } from './coverSheet'

// Lazy backfill (docs/task-cover-system.md §3): existing external cover URLs keep working as-is,
// and are moved into owned Storage ON NEXT ACCESS of the book's detail page — no sweep job, no
// import-time stampede. One attempt per book per session; failure leaves the external URL alone
// (it still renders, and CoverImage's broken-link telemetry covers the rot case). Enrichment-cached
// covers already live in Storage (bucket-root key) and are skipped by isStoredCoverUrl.

const attempted = new Set<string>()

export function useCoverBackfill(book: Book | undefined): void {
  const setCover = useSetCover()
  const id = book?.id
  const cover = book?.cover ?? ''

  useEffect(() => {
    if (!book || !id || !cover) return
    if (isStoredCoverUrl(cover) || attempted.has(id)) return
    if (!/^https?:\/\//i.test(cover)) return // data:/relative seeds are not backfill candidates
    attempted.add(id)
    // Not a reader choice: keep cover_user_chosen false and cover_confidence untouched.
    setCover.mutate({ book, source: 'url', url: cover, sourceUrl: cover, userChosen: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per book id/cover pair
  }, [id, cover])
}
