export type AddDestination = 'mine' | 'both' | 'household' | `member:${string}`

export const delegatedMemberId = (destination: AddDestination): string | null =>
  destination.startsWith('member:') ? destination.slice('member:'.length) : null
