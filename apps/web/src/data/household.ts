import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export type HouseholdMemberRole = 'owner' | 'member'

export interface HouseholdMember {
  householdId: string
  householdName: string
  userId: string
  displayName: string
  role: HouseholdMemberRole
}

export interface HouseholdBook {
  id: string
  ownerId: string
  ownerName: string
  title: string
  author: string
  cover: string
  coverThumb: string
  coverColor: string
  series: string
  position: number | null
  seriesCount: number | null
  seriesStatus: string
  primaryGenre: string
  genres: string[]
  subgenre: string
  subgenres: string[]
  isbn: string
  ownership: string
  borrowed: boolean
  wishlist: boolean
  ownedPhysical: string
  ownedEbook: boolean
  ownedAudiobook: boolean
  bookFormat: string
  publicationYear: number | null
  publicationMonth: number | null
  publicationDay: number | null
  addedAt: string
}

interface HouseholdBookSelection {
  bookId: string
  householdId: string
}

interface HouseholdRosterRow {
  household_id: string
  household_name: string
  user_id: string
  display_name: string | null
  member_role: HouseholdMemberRole
}

interface HouseholdBookRow {
  book_id: string
  owner_id: string
  owner_name: string | null
  title: string
  author: string | null
  cover_url: string | null
  cover_thumb_url: string | null
  cover_color: string | null
  series_name: string | null
  series_position: number | string | null
  series_count: number | null
  series_status: string | null
  primary_genre: string | null
  genres: string[] | null
  subgenre: string | null
  subgenres: string[] | null
  isbn: string | null
  ownership: string | null
  borrowed: boolean | null
  wishlist: boolean | null
  owned_physical: string | null
  owned_ebook: boolean | null
  owned_audiobook: boolean | null
  book_format: string | null
  pub_y: number | null
  pub_m: number | null
  pub_d: number | null
  added_at: string
}

const readerName = (value: string | null): string => value?.trim() || 'Reader'

const numericPosition = (value: number | string | null): number | null => {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Explicit mappers are a second whitelist beside the RPC return signature. If the database
 * function ever grows a column, it does not silently become client state just because PostgREST
 * included it in the response.
 */
export const toHouseholdMember = (row: HouseholdRosterRow): HouseholdMember => ({
  householdId: row.household_id,
  householdName: row.household_name,
  userId: row.user_id,
  displayName: readerName(row.display_name),
  role: row.member_role,
})

export const toHouseholdBook = (row: HouseholdBookRow): HouseholdBook => ({
  id: row.book_id,
  ownerId: row.owner_id,
  ownerName: readerName(row.owner_name),
  title: row.title,
  author: row.author?.trim() ?? '',
  cover: row.cover_url ?? '',
  coverThumb: row.cover_thumb_url ?? '',
  coverColor: row.cover_color ?? '',
  series: row.series_name ?? '',
  position: numericPosition(row.series_position),
  seriesCount: row.series_count,
  seriesStatus: row.series_status ?? '',
  primaryGenre: row.primary_genre ?? '',
  genres: row.genres ?? [],
  subgenre: row.subgenre ?? '',
  subgenres: row.subgenres ?? [],
  isbn: row.isbn ?? '',
  ownership: row.ownership ?? 'unowned',
  borrowed: row.borrowed ?? false,
  wishlist: row.wishlist ?? false,
  ownedPhysical: row.owned_physical ?? '',
  ownedEbook: row.owned_ebook ?? false,
  ownedAudiobook: row.owned_audiobook ?? false,
  bookFormat: row.book_format ?? '',
  publicationYear: row.pub_y,
  publicationMonth: row.pub_m,
  publicationDay: row.pub_d,
  addedAt: row.added_at,
})

const normalizedReaderName = (value: string): string => value.trim().toLocaleLowerCase()

function uniqueReaderSuffix(readerId: string, allReaderIds: readonly string[]): string {
  const distinctOthers = [...new Set(allReaderIds)].filter((candidate) => candidate !== readerId)
  let length = Math.min(8, readerId.length)
  while (
    length < readerId.length &&
    distinctOthers.some((candidate) => candidate.slice(0, length) === readerId.slice(0, length))
  ) {
    length += 1
  }
  return readerId.slice(0, length)
}

/**
 * One complete-roster-derived identity map feeds both member chips and book ownership labels.
 * Book rows are deliberately not allowed to decide whether a name is ambiguous: members with an
 * empty library still participate, and a colliding eight-character UUID prefix grows until unique.
 */
export function householdOwnerLabels(
  members: readonly HouseholdMember[],
): ReadonlyMap<string, string> {
  const idsByName = new Map<string, Set<string>>()
  for (const member of members) {
    const name = normalizedReaderName(member.displayName)
    const ids = idsByName.get(name) ?? new Set<string>()
    ids.add(member.userId)
    idsByName.set(name, ids)
  }

  const allReaderIds = members.map((member) => member.userId)
  return new Map(
    members.map((member) => {
      const ids = idsByName.get(normalizedReaderName(member.displayName)) ?? new Set<string>()
      const needsSuffix = member.displayName === 'Reader' || ids.size > 1
      const label = needsSuffix
        ? `${member.displayName} · ${uniqueReaderSuffix(member.userId, allReaderIds)}`
        : member.displayName
      return [member.userId, label]
    }),
  )
}

export function labelHouseholdData(
  members: readonly HouseholdMember[],
  books: readonly HouseholdBook[],
): { members: HouseholdMember[]; books: HouseholdBook[] } {
  const labels = householdOwnerLabels(members)
  return {
    members: members.map((member) => ({
      ...member,
      displayName: labels.get(member.userId) ?? member.displayName,
    })),
    // A curated row whose owner is absent from the authorizing roster fails closed instead of
    // receiving an independently-derived label and rendering as if it were still authorized.
    books: books.flatMap((book) => {
      const ownerName = labels.get(book.ownerId)
      return ownerName ? [{ ...book, ownerName }] : []
    }),
  }
}

/**
 * A household selection carries the household that authorized it. Any authorization transition
 * clears the stored value, so recovery cannot reopen a drawer without a new reader gesture even if
 * the same book id becomes visible again.
 */
export function useHouseholdBookSelection({
  householdId,
  books,
  authorized,
}: {
  householdId: string | null
  books: readonly HouseholdBook[]
  authorized: boolean
}) {
  const [selection, setSelection] = useState<HouseholdBookSelection | null>(null)
  const selected =
    (authorized &&
      selection?.householdId === householdId &&
      books.find((book) => book.id === selection.bookId)) ||
    null

  useEffect(() => {
    if (!selection) return
    const remainsAuthorized =
      authorized &&
      !!householdId &&
      selection.householdId === householdId &&
      books.some((book) => book.id === selection.bookId)
    if (!remainsAuthorized) setSelection(null)
  }, [authorized, books, householdId, selection])

  return {
    selected,
    open: (bookId: string) => {
      if (authorized && householdId && books.some((book) => book.id === bookId)) {
        setSelection({ bookId, householdId })
      }
    },
    clear: () => setSelection(null),
  }
}

export const householdRosterKey = (readerId: string) => ['household', 'roster', readerId] as const
export const householdBooksKey = (readerId: string, householdId: string) =>
  ['household', 'books', readerId, householdId] as const

const authorizationSensitiveQueryOptions = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
}

export function useHouseholdRoster() {
  const { session } = useAuth()
  const readerId = session?.user.id ?? ''
  const queryClient = useQueryClient()
  const queryKey = householdRosterKey(readerId)

  useEffect(() => {
    const mountedQueryKey = householdRosterKey(readerId)
    return () => queryClient.removeQueries({ queryKey: mountedQueryKey, exact: true })
  }, [queryClient, readerId])

  return useQuery({
    queryKey,
    enabled: !!readerId,
    ...authorizationSensitiveQueryOptions,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase.rpc('household_roster')
      if (error) throw error
      return ((data ?? []) as HouseholdRosterRow[]).map(toHouseholdMember)
    },
  })
}

export function useHouseholdBooks(householdId: string | null) {
  const { session } = useAuth()
  const readerId = session?.user.id ?? ''
  const queryClient = useQueryClient()
  const queryKey = householdBooksKey(readerId, householdId ?? '')

  useEffect(() => {
    const mountedQueryKey = householdBooksKey(readerId, householdId ?? '')
    return () => queryClient.removeQueries({ queryKey: mountedQueryKey, exact: true })
  }, [queryClient, readerId, householdId])

  return useQuery({
    queryKey,
    enabled: !!readerId && !!householdId,
    ...authorizationSensitiveQueryOptions,
    queryFn: async (): Promise<HouseholdBook[]> => {
      const { data, error } = await supabase.rpc('household_library_books')
      if (error) throw error
      return ((data ?? []) as HouseholdBookRow[]).map(toHouseholdBook)
    },
  })
}
