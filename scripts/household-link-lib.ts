const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface HouseholdLinkInput {
  name: string
  ownerId: string
  memberIds: string[]
}

export interface HouseholdLinkConfig extends HouseholdLinkInput {
  allUserIds: string[]
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
