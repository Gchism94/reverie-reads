import { useMemo, useReducer, type ReactNode } from 'react'
import { guestReducer, initialGuestState } from './state'
import { GuestContext } from './context'
export function GuestLibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(guestReducer, undefined, initialGuestState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return (
    <GuestContext.Provider value={value}>
      {children}
      <p className="sr-only" role="status">
        {state.notice}
      </p>
    </GuestContext.Provider>
  )
}
