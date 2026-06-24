import { create } from 'zustand'
import {
  defaultFilters,
  type LibraryFilters,
  type LibraryMode,
  type LibrarySort,
  type SeriesLenBucket,
} from '@reverie/core'

interface FilterState {
  filters: LibraryFilters
  mode: LibraryMode
  panelOpen: boolean
  setQuery: (q: string) => void
  toggleTrope: (t: string) => void
  setSub: (s: string) => void
  setStatus: (s: LibraryFilters['status']) => void
  setLen: (s: SeriesLenBucket) => void
  setRead: (s: LibraryFilters['read']) => void
  setFormat: (s: string) => void
  toggleFave: () => void
  setSort: (s: LibrarySort) => void
  setMode: (m: LibraryMode) => void
  togglePanel: () => void
  clear: () => void
}

export const useFilters = create<FilterState>((set) => ({
  filters: defaultFilters(),
  mode: 'grid',
  panelOpen: false,
  setQuery: (q) => set((s) => ({ filters: { ...s.filters, q } })),
  toggleTrope: (t) =>
    set((s) => ({
      filters: {
        ...s.filters,
        tropes: s.filters.tropes.includes(t)
          ? s.filters.tropes.filter((x) => x !== t)
          : [...s.filters.tropes, t],
      },
    })),
  setSub: (sub) => set((s) => ({ filters: { ...s.filters, sub } })),
  setStatus: (status) => set((s) => ({ filters: { ...s.filters, status } })),
  setLen: (len) => set((s) => ({ filters: { ...s.filters, len } })),
  setRead: (read) => set((s) => ({ filters: { ...s.filters, read } })),
  setFormat: (format) => set((s) => ({ filters: { ...s.filters, format } })),
  toggleFave: () => set((s) => ({ filters: { ...s.filters, fave: !s.filters.fave } })),
  setSort: (sort) => set((s) => ({ filters: { ...s.filters, sort } })),
  setMode: (mode) => set({ mode }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  // Clear all facets but keep the search box and chosen sort (matches the prototype).
  clear: () => set((s) => ({ filters: { ...defaultFilters(), q: s.filters.q, sort: s.filters.sort } })),
}))
