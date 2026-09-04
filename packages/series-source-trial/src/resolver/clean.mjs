import { lineageKey } from '../lineage.mjs'
import { normalize } from '../normalize.mjs'

export const PROVIDER_PROFILES = {
  'google-books': {
    sourceRole: 'identity_only',
    membershipRule: 'never',
    positionRule: 'never',
    mayCorroborate: false,
    dataUse: 'live_identity_only',
    note: 'Search and identity only; Google series labels are not relational evidence.',
  },
  openlibrary: {
    sourceRole: 'open_relational_baseline',
    membershipRule: 'relational_non_singleton',
    positionRule: 'independent_corroboration_required',
    mayCorroborate: true,
    dataUse: 'trial_pending_rights_review',
    note: 'Only structured series_name relationships are eligible; legacy labels are candidates.',
  },
  wikidata: {
    sourceRole: 'open_relational_graph',
    membershipRule: 'relational_non_singleton',
    positionRule: 'independent_corroboration_required',
    mayCorroborate: true,
    dataUse: 'durable_cc0',
    note: 'P179 must belong to the exact author-matched work; P1545 is a separate order claim.',
  },
  inventaire: {
    sourceRole: 'open_relational_extension',
    membershipRule: 'relational_non_singleton',
    positionRule: 'independent_corroboration_required',
    mayCorroborate: true,
    dataUse: 'durable_cc0',
    note: 'The exact work must appear in serie-parts; wd: entities retain Wikidata lineage.',
  },
  bookbrainz: {
    sourceRole: 'open_relational_corroboration',
    membershipRule: 'relational_non_singleton',
    positionRule: 'never',
    mayCorroborate: true,
    dataUse: 'durable_cc0',
    note: 'The exact work must appear in the series roster; order is left unknown.',
  },
  hardcover: {
    sourceRole: 'high_coverage_supplement',
    membershipRule: 'independent_corroboration_required',
    positionRule: 'independent_corroboration_required',
    mayCorroborate: false,
    dataUse: 'decision_input_pending_terms',
    note: 'Exact book_series rows are candidates, but automatic membership requires an independent origin.',
  },
}

const fallbackProfile = {
  sourceRole: 'unprofiled',
  membershipRule: 'never',
  positionRule: 'never',
  mayCorroborate: false,
  dataUse: 'blocked_pending_profile',
  note: 'Unknown providers remain review-only and cannot corroborate another source.',
}

export const providerProfile = (provider) => PROVIDER_PROFILES[provider] ?? fallbackProfile

const clusterKey = (series) =>
  normalize(series)
    .replace(/^the /, '')
    .replace(/ series$/, '')

const originKey = (evidence) => {
  if (evidence.sourceLineage) return lineageKey(evidence.sourceLineage)
  return `${evidence.provider}:${evidence.providerSeriesId ?? evidence.sourceRef ?? evidence.evidenceId}`
}

const isRelational = (evidence) => evidence.evidenceKind === 'relational_membership'

export function gradeMembershipEvidence(target, evidence, identityEvidence = []) {
  const relational = evidence.filter(isRelational)

  return evidence.map((entry) => {
    const riskFlags = []
    const profile = providerProfile(entry.provider)
    const sameSeries = relational.filter(
      (candidate) => clusterKey(candidate.series) === clusterKey(entry.series),
    )
    const origins = new Set(sameSeries.map(originKey))
    const corroborators = sameSeries.filter(
      (candidate) =>
        candidate.evidenceId !== entry.evidenceId &&
        originKey(candidate) !== originKey(entry) &&
        providerProfile(candidate.provider).mayCorroborate,
    )
    const positions = new Set(
      sameSeries
        .map((candidate) => candidate.position)
        .filter((position) => position !== null)
        .map(Number),
    )

    const identityEligible = identityEvidence.some(
      (candidate) =>
        candidate.provider === entry.provider && ['high', 'medium'].includes(candidate.confidence),
    )
    const positionCorroborators = corroborators.filter(
      (candidate) =>
        entry.position !== null &&
        candidate.position !== null &&
        providerProfile(candidate.provider).positionRule !== 'never' &&
        Number(candidate.position) === Number(entry.position),
    )

    if (!identityEligible) riskFlags.push('unverified_work_identity')
    if (!isRelational(entry)) riskFlags.push('not_relational')
    if (profile.membershipRule === 'never') riskFlags.push('membership_source_disallowed')
    if (entry.evidenceKind === 'singleton_relation' || entry.memberCount === 1) {
      riskFlags.push('singleton')
    }
    if (entry.role === 'universe' || /\buniverse\b/i.test(entry.series)) {
      riskFlags.push('possible_universe_not_series')
    }
    if (clusterKey(entry.series) === clusterKey(target.title))
      riskFlags.push('self_titled_relation')
    if (positions.size > 1) riskFlags.push('position_conflict')
    if (
      profile.membershipRule === 'independent_corroboration_required' &&
      corroborators.length === 0
    ) {
      riskFlags.push('independent_corroboration_required')
    }
    if (
      entry.position !== null &&
      profile.positionRule === 'independent_corroboration_required' &&
      positionCorroborators.length === 0
    ) {
      riskFlags.push('position_uncorroborated')
    }
    if (entry.position !== null && profile.positionRule === 'never') {
      riskFlags.push('position_source_disallowed')
    }

    const membershipEligible =
      identityEligible &&
      isRelational(entry) &&
      !riskFlags.includes('singleton') &&
      !riskFlags.includes('possible_universe_not_series') &&
      !riskFlags.includes('independent_corroboration_required') &&
      profile.membershipRule !== 'never'
    const positionEligible =
      membershipEligible &&
      entry.position !== null &&
      !riskFlags.includes('position_conflict') &&
      profile.positionRule !== 'never' &&
      (profile.positionRule !== 'independent_corroboration_required' ||
        positionCorroborators.length > 0)

    return {
      ...entry,
      quality: {
        sourceRole: profile.sourceRole,
        dataUse: profile.dataUse,
        membershipRule: profile.membershipRule,
        positionRule: profile.positionRule,
        independentOriginCount: origins.size,
        corroboratingEvidenceIds: corroborators.map((candidate) => candidate.evidenceId),
        positionCorroboratingEvidenceIds: positionCorroborators.map(
          (candidate) => candidate.evidenceId,
        ),
        riskFlags,
        membershipEligible,
        positionEligible,
      },
    }
  })
}
