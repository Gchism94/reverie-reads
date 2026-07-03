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

/** The spine slot — a spine is its own object (a kit of slots every skin fills), NOT a rotated cover.
 *  Anatomy: a binding surface, head + tail bands, a vertical title, an author, an optional head label,
 *  and a tail colophon. Declarative params here; the per-skin specifics are in the Spine component. */
export interface SpineStyle {
  /** binding surface texture (CSS/SVG only — leather sheen vs brushed metal) */
  binding: 'plain' | 'leather' | 'brushed'
  /** head + tail decorative bands */
  band: 'plain' | 'gilt' | 'tick'
  /** tail mark — Tryst fleuron, Aphelion status LED (pulses on .rv-anim) */
  colophon: 'none' | 'fleuron' | 'led'
  /** optional head label — Tryst folds it into a gilt title panel; Aphelion shows a callsign code */
  label: 'none' | 'panel' | 'callsign'
  /** Aphelion sets the title in mono uppercase */
  titleUpper: boolean
}

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
  /** the book-spine treatment (Structural Character signature component) */
  spine: SpineStyle
  /** the designed coverless plate (Fable 5 slot 9, placeholderCover): each skin gets a bespoke plate
   *  treatment in CoverPlaceholder, selected here — the same registered-component pattern as `motif`.
   *  'plain' renders the neutral title/author plate, so unset skins don't regress. */
  placeholder: 'plain' | 'cloth-boards' | 'specimen-plate'
}

/** Plain bones — what every not-yet-structured skin renders, so nothing regresses. */
export const NEUTRAL_STRUCTURE: SkinStructure = {
  sectionRule: 'hairline',
  frame: 'none',
  tag: 'round',
  progress: 'bar',
  motif: 'none',
  spine: { binding: 'plain', band: 'plain', colophon: 'none', label: 'none', titleUpper: false },
  placeholder: 'plain',
}

// Tryst + Aphelion: structures extracted from the /lab/skins specimen + decoded export. The other
// seven inherit NEUTRAL_STRUCTURE until their stage (fill this table to give a skin bones).
export const SKIN_STRUCTURE: Record<SkinId, SkinStructure> = {
  tryst: {
    sectionRule: 'fleuron',
    frame: 'gilt-plate',
    tag: 'round',
    progress: 'dots',
    motif: 'fleuron',
    spine: { binding: 'leather', band: 'gilt', colophon: 'fleuron', label: 'panel', titleUpper: false },
    placeholder: 'cloth-boards',
  },
  aphelion: {
    sectionRule: 'tick-rule',
    frame: 'corner-bracket',
    tag: 'squared-bracket',
    progress: 'segmented',
    motif: 'radar',
    spine: { binding: 'brushed', band: 'tick', colophon: 'led', label: 'callsign', titleUpper: true },
    placeholder: 'specimen-plate',
  },
  grimoire: NEUTRAL_STRUCTURE,
  marrow: NEUTRAL_STRUCTURE,
  umbra: NEUTRAL_STRUCTURE,
  folio: NEUTRAL_STRUCTURE,
  hearth: NEUTRAL_STRUCTURE,
  almanac: NEUTRAL_STRUCTURE,
  bloom: NEUTRAL_STRUCTURE,
}
