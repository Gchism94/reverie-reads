// Shapes of the relational rows (snake_case) as returned by Supabase/PostgREST.
// Mapped to/from the @reverie/core domain types in mappers.ts.

export interface BookRow {
  id: string
  owner_id: string
  title: string
  author_first: string | null
  author_last: string | null
  series: string | null
  position: number | null
  series_count: number | null
  status: string | null
  genre: string | null
  subgenre: string | null
  subgenres: string[] | null
  genres: string[]
  tags: string[]
  intensity: number | null
  cover_url: string | null
  cover_confidence: string | null
  cover_thumb_url: string | null
  cover_source: string | null
  cover_source_url: string | null
  cover_user_chosen: boolean
  cover_color: string | null
  isbn: string | null
  fave: boolean
  ownership: string
  owned_physical: string | null
  owned_ebook: boolean
  owned_audiobook: boolean
  format: string | null
  rating: number | null
  read_status: string
  source: string | null
  pub_y: number | null
  pub_m: number | null
  pub_d: number | null
  plan_date: string | null
  progress: number | null
  reading_position: number | null
  reading_now_hidden: boolean
  boyfriend: string | null
  authors_display: string | null
  enriched_at: string | null
  added_at: string
  updated_at: string
  /** ordered contributor join (present when the books query selects it) */
  book_authors?: BookAuthorRow[]
  book_tropes?: { emphasis: string; tropes: { id: string; name: string } | null }[]
  tropes_suggested_at: string | null
}

/** A row of the book_authors join with its author embedded (PostgREST nested select). */
export interface BookAuthorRow {
  position: number
  role: string
  authors: { id: string; name: string } | null
}

export interface ListRow {
  id: string
  owner_id: string
  name: string
  kind: 'tbr' | 'collection'
  is_priority: boolean
  sort_order: number | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface ReadRow {
  id: string
  book_id: string
  owner_id: string
  read_on: string | null
  format: string | null
  rating: number | null
  notes: string | null
  created_at: string
}
