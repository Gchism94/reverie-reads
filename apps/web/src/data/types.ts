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
  subgenre: string | null
  genres: string[]
  tropes: string[]
  spice: number | null
  cover_url: string | null
  isbn: string | null
  fave: boolean
  format: string | null
  rating: number | null
  read_status: string
  source: string | null
  pub_y: number | null
  pub_m: number | null
  pub_d: number | null
  plan_date: string | null
  progress: number | null
  boyfriend: string | null
  added_at: string
  updated_at: string
}

export interface ListRow {
  id: string
  owner_id: string
  name: string
  kind: 'tbr' | 'collection'
  is_priority: boolean
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
