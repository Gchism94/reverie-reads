const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface HouseholdLinkInput {
  name: string
  ownerId: string
  memberIds: string[]
}

export interface HouseholdLinkConfig extends HouseholdLinkInput {
  allUserIds: string[]
}

export interface HouseholdProfileRow {
  id: string
  display_name: string | null
}

export interface HouseholdMembershipRow {
  household_id: string
  user_id: string
  role: 'owner' | 'member'
}

export interface HouseholdRow {
  id: string
  name: string
}

export interface HouseholdLinkPreview {
  requestedName: string
  implicatedHouseholds: Array<{
    id: string
    actualName: string
    members: Array<{
      id: string
      displayName: string | null
      role: 'owner' | 'member'
      requested: boolean
    }>
  }>
  requestedAccounts: Array<{
    id: string
    displayName: string | null
    requestedRole: 'owner' | 'member'
  }>
  proposedAdditions: string[]
  omittedExistingMembers: string[]
  canWrite: boolean
}

export interface HouseholdUnlinkConfig {
  userId: string
}

export interface HouseholdUnlinkVerification {
  reviewedHouseholdId: string
  returnedHouseholdId: string
  remainingMembershipCount: number
  householdExists: boolean
}

/** Validate and normalize the runtime-only account identifiers used by the owner-run linker. */
export function householdLinkConfig(input: HouseholdLinkInput): HouseholdLinkConfig {
  const name = input.name.trim()
  const ownerId = input.ownerId.trim().toLowerCase()
  const memberIds = [...new Set(input.memberIds.map((id) => id.trim().toLowerCase()))].filter(
    (id) => id !== ownerId,
  )

  if (!name) throw new Error('pass --name=<household name>')
  if (!UUID.test(ownerId)) throw new Error('pass a valid --owner-id=<uuid>')
  const invalid = memberIds.find((id) => !UUID.test(id))
  if (invalid) throw new Error(`invalid --member-id UUID: ${invalid}`)
  if (!memberIds.length) throw new Error('pass at least one distinct --member-id=<uuid>')

  return { name, ownerId, memberIds, allUserIds: [ownerId, ...memberIds] }
}

/** Parse repeatable --member-id flags without teaching the write shell any identity rules. */
export function parseHouseholdLinkArgs(args: readonly string[]): HouseholdLinkConfig {
  const value = (name: string) => {
    const hit = args.find((arg) => arg.startsWith(`--${name}=`))
    return hit?.slice(name.length + 3) ?? ''
  }
  return householdLinkConfig({
    name: value('name'),
    ownerId: value('owner-id'),
    memberIds: args
      .filter((arg) => arg.startsWith('--member-id='))
      .map((arg) => arg.slice('--member-id='.length)),
  })
}

const profileNames = (profiles: readonly HouseholdProfileRow[]) =>
  new Map(profiles.map((profile) => [profile.id, profile.display_name]))

/** Build the disclosure shown before linking. Every implicated household member is included. */
export function householdLinkPreview(
  config: HouseholdLinkConfig,
  profiles: readonly HouseholdProfileRow[],
  households: readonly HouseholdRow[],
  memberships: readonly HouseholdMembershipRow[],
): HouseholdLinkPreview {
  const requested = new Set(config.allUserIds)
  const names = profileNames(profiles)
  const householdById = new Map(households.map((household) => [household.id, household]))
  const implicatedIds = [
    ...new Set(
      memberships
        .filter((membership) => requested.has(membership.user_id))
        .map((membership) => membership.household_id),
    ),
  ].sort()
  const implicatedMemberships = memberships.filter((membership) =>
    implicatedIds.includes(membership.household_id),
  )
  const existingIds = new Set(implicatedMemberships.map((membership) => membership.user_id))
  const omittedExistingMembers = [...existingIds].filter((id) => !requested.has(id)).sort()

  return {
    requestedName: config.name,
    implicatedHouseholds: implicatedIds.map((id) => ({
      id,
      actualName: householdById.get(id)?.name ?? '(household name unavailable)',
      members: implicatedMemberships
        .filter((membership) => membership.household_id === id)
        .sort((a, b) => a.user_id.localeCompare(b.user_id))
        .map((membership) => ({
          id: membership.user_id,
          displayName: names.get(membership.user_id) ?? null,
          role: membership.role,
          requested: requested.has(membership.user_id),
        })),
    })),
    requestedAccounts: config.allUserIds.map((id) => ({
      id,
      displayName: names.get(id) ?? null,
      requestedRole: id === config.ownerId ? 'owner' : 'member',
    })),
    proposedAdditions: config.allUserIds.filter((id) => !existingIds.has(id)),
    omittedExistingMembers,
    canWrite: implicatedIds.length <= 1 && omittedExistingMembers.length === 0,
  }
}

export function parseHouseholdUnlinkArgs(args: readonly string[]): HouseholdUnlinkConfig {
  const hit = args.find((arg) => arg.startsWith('--user-id='))
  const userId = (hit?.slice('--user-id='.length) ?? '').trim().toLowerCase()
  if (!UUID.test(userId)) throw new Error('pass a valid --user-id=<uuid>')
  return { userId }
}

/** Verify the reviewed household reached the lifecycle state implied by its remaining roster. */
export function verifyHouseholdUnlink({
  reviewedHouseholdId,
  returnedHouseholdId,
  remainingMembershipCount,
  householdExists,
}: HouseholdUnlinkVerification): 'deleted' | 'retained' {
  if (returnedHouseholdId !== reviewedHouseholdId) {
    throw new Error('household unlink verification failed: RPC returned a different household')
  }
  if (!Number.isInteger(remainingMembershipCount) || remainingMembershipCount < 0) {
    throw new Error('household unlink verification failed: unreadable remaining roster count')
  }
  if (remainingMembershipCount === 0 && householdExists) {
    throw new Error('household unlink verification failed: empty household still exists')
  }
  if (remainingMembershipCount > 0 && !householdExists) {
    throw new Error('household unlink verification failed: populated household is missing')
  }
  return remainingMembershipCount === 0 ? 'deleted' : 'retained'
}
