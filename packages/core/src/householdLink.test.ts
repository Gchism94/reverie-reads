import { describe, expect, it } from 'vitest'
import {
  householdLinkConfig,
  householdLinkPreview,
  parseHouseholdLinkArgs,
  parseHouseholdUnlinkArgs,
} from '../../../scripts/household-link-lib'

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

  it('discloses the actual household name and complete existing roster', () => {
    const config = householdLinkConfig({
      name: 'Requested rename',
      ownerId: OWNER,
      memberIds: [MEMBER],
    })
    const omitted = '33333333-3333-4333-8333-333333333333'

    expect(
      householdLinkPreview(
        config,
        [
          { id: OWNER, display_name: 'Owner' },
          { id: MEMBER, display_name: 'New member' },
          { id: omitted, display_name: 'Existing member' },
        ],
        [{ id: 'house-1', name: 'Actual household' }],
        [
          { household_id: 'house-1', user_id: OWNER, role: 'owner' },
          { household_id: 'house-1', user_id: omitted, role: 'member' },
        ],
      ),
    ).toMatchObject({
      requestedName: 'Requested rename',
      implicatedHouseholds: [
        {
          id: 'house-1',
          actualName: 'Actual household',
          members: [
            { id: OWNER, displayName: 'Owner', requested: true },
            { id: omitted, displayName: 'Existing member', requested: false },
          ],
        },
      ],
      proposedAdditions: [MEMBER],
      omittedExistingMembers: [omitted],
      canWrite: false,
    })
  })

  it('allows an additive preview only when the complete existing roster is requested', () => {
    const existing = '33333333-3333-4333-8333-333333333333'
    const config = householdLinkConfig({
      name: 'House',
      ownerId: OWNER,
      memberIds: [existing, MEMBER],
    })
    const preview = householdLinkPreview(
      config,
      [OWNER, existing, MEMBER].map((id) => ({ id, display_name: id })),
      [{ id: 'house-1', name: 'House' }],
      [
        { household_id: 'house-1', user_id: OWNER, role: 'owner' },
        { household_id: 'house-1', user_id: existing, role: 'member' },
      ],
    )

    expect(preview.canWrite).toBe(true)
    expect(preview.omittedExistingMembers).toEqual([])
    expect(preview.proposedAdditions).toEqual([MEMBER])
  })

  it('parses a membership-only unlink target and rejects malformed IDs', () => {
    expect(parseHouseholdUnlinkArgs([`--user-id=${MEMBER.toUpperCase()}`])).toEqual({
      userId: MEMBER,
    })
    expect(() => parseHouseholdUnlinkArgs(['--user-id=not-a-uuid'])).toThrow(/valid --user-id/)
  })
})
