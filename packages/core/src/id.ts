/** Short, roughly time-ordered id — ported verbatim from the prototype's `uid`. */
export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
