import { useEffect, useState } from 'react'

/** The value, updated only after it has held still for `delayMs` — so a fast typist fires one search,
 *  not one per keystroke (task §1: debounce ≥400ms). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
