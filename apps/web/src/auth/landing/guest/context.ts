import { createContext, useContext, type Dispatch } from 'react'
import type { GuestAction, GuestState } from './state'
export const GuestContext = createContext<{
  state: GuestState
  dispatch: Dispatch<GuestAction>
} | null>(null)
export function useGuestLibrary() {
  const context = useContext(GuestContext)
  if (!context) throw new Error('Guest library context is missing')
  return context
}
