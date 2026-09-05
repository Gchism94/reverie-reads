import { createHash } from 'node:crypto'

const hashJson = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const byEvidenceId = (left, right) => left.evidenceId.localeCompare(right.evidenceId)

const stableQuality = (quality = {}) => ({
  sourceRole: quality.sourceRole ?? null,
  dataUse: quality.dataUse ?? null,
  membershipRule: quality.membershipRule ?? null,
  positionRule: quality.positionRule ?? null,
  independentOriginCount: quality.independentOriginCount ?? null,
  corroboratingEvidenceIds: [...(quality.corroboratingEvidenceIds ?? [])].sort(),
  positionCorroboratingEvidenceIds: [...(quality.positionCorroboratingEvidenceIds ?? [])].sort(),
  riskFlags: [...(quality.riskFlags ?? [])].sort(),
  membershipEligible: Boolean(quality.membershipEligible),
  positionEligible: Boolean(quality.positionEligible),
})

export const decisionPacketCacheMaterial = (packet) => ({
  schemaVersion: packet.schemaVersion,
  caseId: packet.caseId,
  target: {
    title: packet.target?.title ?? null,
    authors: [...(packet.target?.authors ?? [])].sort(),
  },
  identityEvidence: (packet.identityEvidence ?? [])
    .map((entry) => ({
      evidenceId: entry.evidenceId,
      provider: entry.provider,
      confidence: entry.confidence,
      title: entry.title,
      authors: [...(entry.authors ?? [])].sort(),
    }))
    .sort(byEvidenceId),
  membershipEvidence: (packet.membershipEvidence ?? [])
    .map((entry) => ({
      evidenceId: entry.evidenceId,
      provider: entry.provider,
      evidenceKind: entry.evidenceKind,
      series: entry.series,
      position: entry.position,
      memberCount: entry.memberCount,
      orderType: entry.orderType,
      role: entry.role,
      quality: stableQuality(entry.quality),
    }))
    .sort(byEvidenceId),
  providerProfiles: Object.fromEntries(
    Object.entries(packet.providerProfiles ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ),
  providerErrors: [...new Set((packet.providerErrors ?? []).map((entry) => entry.provider))].sort(),
})

export const decisionPacketCacheKey = ({ model, promptVersion, packet }) =>
  hashJson({
    cacheVersion: 'decision-packet-v1',
    model,
    promptVersion,
    packet: decisionPacketCacheMaterial(packet),
  })

export const legacyPacketCacheKey = ({ model, promptVersion, packet }) =>
  hashJson({ model, promptVersion, packet })
