import { useQuery } from '@tanstack/react-query'
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

const shortReaderId = (readerId: string): string => readerId.slice(0, 8)

const readerName = (value: string | null, readerId: string): string =>
  value?.trim() || `Reader · ${shortReaderId(readerId)}`

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
  displayName: readerName(row.display_name, row.user_id),
  role: row.member_role,
})

export const toHouseholdBook = (row: HouseholdBookRow): HouseholdBook => ({
  id: row.book_id,
  ownerId: row.owner_id,
  ownerName: readerName(row.owner_name, row.owner_id),
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

function ambiguousReaderNames(
  rows: readonly { readerId: string; displayName: string }[],
): Set<string> {
  const idsByName = new Map<string, Set<string>>()
  for (const row of rows) {
    const ids = idsByName.get(row.displayName) ?? new Set<string>()
    ids.add(row.readerId)
    idsByName.set(row.displayName, ids)
  }
  return new Set(
    [...idsByName.entries()].filter(([, ids]) => ids.size > 1).map(([name]) => name),
  )
}

export function disambiguateHouseholdMembers(
  members: readonly HouseholdMember[],
): HouseholdMember[] {
  const ambiguous = ambiguousReaderNames(
    members.map((member) => ({ readerId: member.userId, displayName: member.displayName })),
  )
  return members.map((member) =>
    ambiguous.has(member.displayName)
      ? { ...member, displayName: `${member.displayName} · ${shortReaderId(member.userId)}` }
      : member,
  )
}

export function disambiguateHouseholdBooks(books: readonly HouseholdBook[]): HouseholdBook[] {
  const ambiguous = ambiguousReaderNames(
    books.map((book) => ({ readerId: book.ownerId, displayName: book.ownerName })),
  )
  return books.map((book) =>
    ambiguous.has(book.ownerName)
      ? { ...book, ownerName: `${book.ownerName} · ${shortReaderId(book.ownerId)}` }
      : book,
  )
}

export const householdRosterKey = (readerId: string) =>
  ['household', 'roster', readerId] as const
export const householdBooksKey = (readerId: string) =>
  ['household', 'books', readerId] as const

export function useHouseholdRoster() {
  const { session } = useAuth()
  const readerId = session?.user.id ?? ''
  return useQuery({
    queryKey: householdRosterKey(readerId),
    enabled: !!readerId,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase.rpc('household_roster')
      if (error) throw error
      return disambiguateHouseholdMembers(
        ((data ?? []) as HouseholdRosterRow[]).map(toHouseholdMember),
      )
    },
  })
}

export function useHouseholdBooks() {
  const { session } = useAuth()
  const readerId = session?.user.id ?? ''
  return useQuery({
    queryKey: householdBooksKey(readerId),
    enabled: !!readerId,
    queryFn: async (): Promise<HouseholdBook[]> => {
      const { data, error } = await supabase.rpc('household_library_books')
      if (error) throw error
      return disambiguateHouseholdBooks(
        ((data ?? []) as HouseholdBookRow[]).map(toHouseholdBook),
      )
    },
  })
}
