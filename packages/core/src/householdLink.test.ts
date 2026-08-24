import { describe, expect, it } from 'vitest'
import { householdLinkConfig, parseHouseholdLinkArgs } from '../../../scripts/household-link-lib'

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

describe('household link arguments', () => {
  it('normalizes runtime UUIDs and deduplicates repeatable member flags', () => {
    expect(
      parseHouseholdLinkArgs([
        '--name=  Our household  ',
        `--owner-id=${OWNER.toUpperCase()}`,
        `--member-id=${MEMBER}`,
        `--member-id=${MEMBER}`,
      ]),
    ).toEqual({
      name: 'Our household',
      ownerId: OWNER,
      memberIds: [MEMBER],
      allUserIds: [OWNER, MEMBER],
    })
  })

  it('drops the owner from the member list but still requires a second account', () => {
    expect(() =>
      householdLinkConfig({ name: 'House', ownerId: OWNER, memberIds: [OWNER] }),
    ).toThrow(/distinct --member-id/)
  })

  it('rejects malformed IDs before any database client exists', () => {
    expect(() =>
      householdLinkConfig({ name: 'House', ownerId: OWNER, memberIds: ['not-a-uuid'] }),
    ).toThrow(/invalid --member-id UUID/)
  })

  it('requires a household name and owner', () => {
    expect(() => householdLinkConfig({ name: '', ownerId: OWNER, memberIds: [MEMBER] })).toThrow(
      /--name/,
    )
    expect(() => householdLinkConfig({ name: 'House', ownerId: '', memberIds: [MEMBER] })).toThrow(
      /--owner-id/,
    )
  })
})
