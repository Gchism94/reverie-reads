export type NavigationIconName =
  | 'home'
  | 'library'
  | 'shelves'
  | 'series'
  | 'tropes'
  | 'planner'
  | 'stats'
  | 'match'
  | 'discover'
  | 'clubs'
  | 'indies'
  | 'skins'
  | 'settings'

export interface NavigationItem {
  label: string
  to: string
  icon: NavigationIconName
}

/** One navigation model feeds both the shipped shell and the public product playground. */
export const NAVIGATION_ITEMS = [
  { label: 'Home', to: '/', icon: 'home' },
  { label: 'Library', to: '/library', icon: 'library' },
  { label: 'Shelves', to: '/shelves', icon: 'shelves' },
  { label: 'Series', to: '/series', icon: 'series' },
  { label: 'Tropes', to: '/tropes', icon: 'tropes' },
  { label: 'Planner', to: '/planner', icon: 'planner' },
  { label: 'Stats', to: '/stats', icon: 'stats' },
  { label: 'Match', to: '/match', icon: 'match' },
  { label: 'Discover', to: '/discover', icon: 'discover' },
  { label: 'Clubs', to: '/clubs', icon: 'clubs' },
  { label: 'Indies', to: '/indie', icon: 'indies' },
] as const satisfies readonly NavigationItem[]

export const NAVIGATION_GROUPS = [
  { label: 'Your books', items: NAVIGATION_ITEMS.slice(0, 5) },
  { label: 'Reading life', items: NAVIGATION_ITEMS.slice(5, 8) },
  { label: 'Explore', items: NAVIGATION_ITEMS.slice(8) },
] as const

export const MOBILE_TAB_ITEMS = [
  NAVIGATION_ITEMS[0],
  NAVIGATION_ITEMS[1],
  NAVIGATION_ITEMS[4],
] as const

export const MORE_NAVIGATION_ITEMS = [
  ...NAVIGATION_ITEMS.filter(
    (item) => !(MOBILE_TAB_ITEMS as readonly NavigationItem[]).includes(item),
  ),
  { label: 'Skins', to: '/skins', icon: 'skins' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
] as const satisfies readonly NavigationItem[]
