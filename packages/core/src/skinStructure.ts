import type { SkinId } from './skins'

// The STRUCTURE lever of the Skin Character System. Tokens carry VALUES (radius, type, colour,
// texture, border, inset ornament) — they cannot express COMPOSITION: which parts a region has, how
// it's labeled, what emblem appears. That's why every skin rendered the same boxes in the same places
// (paint, not bone). This is the missing layer: a small per-skin STRUCTURAL config (filled per skin,
// same pattern as the token registry) that generic slot components read to render a different bone.
//
// Hybrid: the common slots are PARAMETERS (a section rule is a tick-rule vs a fleuron hairline; a tag
// is squared-bracket vs round) — declarative here. The one genuinely-bespoke emblem per skin (Aphelion's
// radar cycle-ring, Tryst's fleuron) is a registered component (apps/web SignatureMotif), selected by
// `motif`. Neutral defaults render plain, so unset skins don't regress.

export interface SkinStructure {
  /** the rule drawn across a section header, between the label and the readout */
  sectionRule: 'hairline' | 'fleuron' | 'tick-rule'
  /** how a panel / hero card is framed */
  frame: 'none' | 'gilt-plate' | 'corner-bracket'
  /** status-tag / mark silhouette + treatment */
  tag: 'round' | 'squared-bracket'
  /** progress meter form */
  progress: 'bar' | 'dots' | 'segmented'
  /** the big signature emblem (and the goal-ring treatment) — see SignatureMotif */
  motif: 'none' | 'fleuron' | 'radar'
}

/** Plain bones — what every not-yet-structured skin renders, so nothing regresses. */
export const NEUTRAL_STRUCTURE: SkinStructure = {
  sectionRule: 'hairline',
  frame: 'none',
  tag: 'round',
  progress: 'bar',
  motif: 'none',
}

// Tryst + Aphelion: structures extracted from the /lab/skins specimen + decoded export. The other
// seven inherit NEUTRAL_STRUCTURE until their stage (fill this table to give a skin bones).
export const SKIN_STRUCTURE: Record<SkinId, SkinStructure> = {
  tryst: { sectionRule: 'fleuron', frame: 'gilt-plate', tag: 'round', progress: 'dots', motif: 'fleuron' },
  aphelion: { sectionRule: 'tick-rule', frame: 'corner-bracket', tag: 'squared-bracket', progress: 'segmented', motif: 'radar' },
  grimoire: NEUTRAL_STRUCTURE,
  marrow: NEUTRAL_STRUCTURE,
  umbra: NEUTRAL_STRUCTURE,
  folio: NEUTRAL_STRUCTURE,
  hearth: NEUTRAL_STRUCTURE,
  almanac: NEUTRAL_STRUCTURE,
  bloom: NEUTRAL_STRUCTURE,
}
