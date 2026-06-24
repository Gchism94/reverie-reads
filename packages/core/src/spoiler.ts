// The spoiler gate, ported verbatim from the prototype's read-along view:
// a comment about unit U is visible only once the reader's progress has reached U.
// The backend enforces the same rule in RLS (supabase club_comments policy).

/** The rule itself: visible iff `comment.unit <= myProgress`. */
export const isCommentVisible = (comment: { unit: number }, myProgress: number): boolean =>
  comment.unit <= myProgress

/** Split comments into visible/hidden by progress, sorted by unit then timestamp. */
export function partitionComments<T extends { unit: number; ts?: number }>(
  comments: readonly T[],
  myProgress: number,
): { visible: T[]; hidden: T[] } {
  const sorted = [...comments].sort((a, b) => a.unit - b.unit || (a.ts ?? 0) - (b.ts ?? 0))
  const visible: T[] = []
  const hidden: T[] = []
  for (const c of sorted) {
    if (isCommentVisible(c, myProgress)) visible.push(c)
    else hidden.push(c)
  }
  return { visible, hidden }
}

/** Just the comments the reader is allowed to see, in order. */
export const visibleComments = <T extends { unit: number; ts?: number }>(
  comments: readonly T[],
  myProgress: number,
): T[] => partitionComments(comments, myProgress).visible

/** The unit at which the next hidden comment unlocks, or null if none are hidden. */
export function nextUnlockUnit(
  comments: readonly { unit: number }[],
  myProgress: number,
): number | null {
  const hidden = comments.filter((c) => !isCommentVisible(c, myProgress))
  return hidden.length ? Math.min(...hidden.map((c) => c.unit)) : null
}
