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
  /** binding surface (CSS/SVG only): leather sheen · brushed metal · tooled tome (raised cords) ·
   *  ash cloth box · fog-cloth ledger (typed paper strip) · proof-paper galley · oat-linen volume ·
   *  buff field manual · the dawn sky (Firstlight's one gradient, night at the head) */
  binding:
    | 'plain'
    | 'leather'
    | 'brushed'
    | 'tome'
    | 'cloth'
    | 'ledger'
    | 'galley'
    | 'linen'
    | 'manual'
    | 'sky'
  /** head + tail decorative bands ('bone-rule' = Marrow's single bone hairline at the head;
   *  'pencil' = Marginalia's double graphite hairlines; 'stitched' = Hearth's thread runs;
   *  'ink-block' = Almanac's solid ink band blocks (the tail block carries the REF №);
   *  'gel' = Firstlight's violet gel strip at the head only) */
  band: 'plain' | 'gilt' | 'tick' | 'bone-rule' | 'pencil' | 'stitched' | 'ink-block' | 'gel'
  /** tail mark — fleuron seal · status LED · gilt sigil ❖ · oxblood dip · brass eyelet ·
   *  proofreader's caret ‸ · sewn wooden button · double index rule · the small rising sun */
  colophon:
    | 'none'
    | 'fleuron'
    | 'led'
    | 'sigil'
    | 'dip'
    | 'eyelet'
    | 'caret'
    | 'button'
    | 'rule'
    | 'sun'
  /** optional head label — gilt title panel · callsign chip · pasted № label · typed case number ·
   *  REF № set in the tail ink block (Almanac) */
  label: 'none' | 'panel' | 'callsign' | 'pasted-no' | 'case-no' | 'ref-no'
  /** condensed-label skins set the title uppercase */
  titleUpper: boolean
}

export interface SkinStructure {
  /** the rule drawn across a section header: plain hairline · fleuron-centred gilt · ticked ·
   *  rubricated thick-thin pair (¶) · fractured-at-midpoint · typed docket (RE: + stamped count) ·
   *  red-caret + pencil rule (Marginalia) · stitched thread leader (Hearth) · orange tick + double
   *  rule with a unit-labelled tabular count (Almanac) · gel sparkle + dotted leader (Firstlight) */
  sectionRule:
    | 'hairline'
    | 'fleuron'
    | 'tick-rule'
    | 'double-rule'
    | 'fractured'
    | 'docket'
    | 'caret-rule'
    | 'stitched'
    | 'index-rule'
    | 'dotted'
  /** how a panel / hero card is framed: … · a bond leaf with the red margin rule (Marginalia) ·
   *  a linen placemat with a dashed thread frame stitched inside the edge (Hearth) · a buff record
   *  card, band + double rule (Almanac) · an opaque white sticker with a 3px ring (Firstlight) */
  frame:
    | 'none'
    | 'gilt-plate'
    | 'corner-bracket'
    | 'illuminated-border'
    | 'chamfer-tray'
    | 'case-folder'
    | 'margin-rule'
    | 'stitched-inset'
    | 'record-card'
    | 'sticker-ring'
  /** status-tag / mark silhouette + treatment: … · drawn proof marks, never boxed (Marginalia) ·
   *  jar labels with dashed-thread stitching (Hearth) · index tabs, squared with a rounded outer
   *  edge (Almanac) · puffy stickers with a gel ring (Firstlight) */
  tag:
    | 'round'
    | 'squared-bracket'
    | 'lozenge'
    | 'chamfer-chip'
    | 'stamp-ring'
    | 'drawn-mark'
    | 'jar-label'
    | 'index-tab'
    | 'puffy-sticker'
  /** progress meter form: bar · dots · etched segments · tally strokes (5s) · vertebra column ·
   *  tack board with the red thread strung · a pencil rule written over in graphite, red caret at
   *  the full stop (Marginalia) · a hem of jam cross-stitches (Hearth) · a measuring rule with an
   *  orange pointer (Almanac) · the sun climbing to the horizon line (Firstlight) */
  progress:
    | 'bar'
    | 'dots'
    | 'segmented'
    | 'tally'
    | 'vertebrae'
    | 'thread-board'
    | 'page-lines'
    | 'cross-stitch'
    | 'rule-ticks'
    | 'sun-rise'
  /** the big signature emblem (and the goal-ring treatment) — see SignatureMotif */
  motif:
    | 'none'
    | 'fleuron'
    | 'radar'
    | 'sigil'
    | 'crack'
    | 'window'
    | 'caret'
    | 'button'
    | 'tab'
    | 'sun'
  /** the book-spine treatment (Structural Character signature component) */
  spine: SpineStyle
  /** the designed coverless plate (Fable 5 slot 9, placeholderCover): each skin gets a bespoke plate
   *  treatment in CoverPlaceholder, selected here — the same registered-component pattern as `motif`.
   *  'plain' renders the neutral title/author plate, so unset skins don't regress. Chunk 3 adds the
   *  uncorrected proof (Marginalia) · the linen board with its paper label (Hearth) · the buff manual
   *  with the band block + tab (Almanac) · the sky mock-up, a sticker on the dawn (Firstlight). */
  placeholder:
    | 'plain'
    | 'cloth-boards'
    | 'specimen-plate'
    | 'vellum-boards'
    | 'box-lid'
    | 'case-file'
    | 'proof-sheet'
    | 'linen-board'
    | 'buff-manual'
    | 'sky-mockup'
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
    spine: {
      binding: 'leather',
      band: 'gilt',
      colophon: 'fleuron',
      label: 'panel',
      titleUpper: false,
    },
    placeholder: 'cloth-boards',
  },
  aphelion: {
    sectionRule: 'tick-rule',
    frame: 'corner-bracket',
    tag: 'squared-bracket',
    progress: 'segmented',
    motif: 'radar',
    spine: {
      binding: 'brushed',
      band: 'tick',
      colophon: 'led',
      label: 'callsign',
      titleUpper: true,
    },
    placeholder: 'specimen-plate',
  },
  // Fable 5 chunk 2 — the working spellbook · the specimen archive · the unsolved case ("Gaslight";
  // the live id stays `umbra`, the stored profile key).
  grimoire: {
    sectionRule: 'double-rule',
    frame: 'illuminated-border',
    tag: 'lozenge',
    progress: 'tally',
    motif: 'sigil',
    spine: { binding: 'tome', band: 'gilt', colophon: 'sigil', label: 'none', titleUpper: false },
    placeholder: 'vellum-boards',
  },
  marrow: {
    sectionRule: 'fractured',
    frame: 'chamfer-tray',
    tag: 'chamfer-chip',
    progress: 'vertebrae',
    motif: 'crack',
    spine: {
      binding: 'cloth',
      band: 'bone-rule',
      colophon: 'dip',
      label: 'pasted-no',
      titleUpper: true,
    },
    placeholder: 'box-lid',
  },
  umbra: {
    sectionRule: 'docket',
    frame: 'case-folder',
    tag: 'stamp-ring',
    progress: 'thread-board',
    motif: 'window',
    spine: {
      binding: 'ledger',
      band: 'gilt',
      colophon: 'eyelet',
      label: 'case-no',
      titleUpper: true,
    },
    placeholder: 'case-file',
  },
  // Fable 5 chunk 3 — the working proof ("Marginalia"; live id stays `folio`) · the kitchen-table
  // library (Hearth) · the field reference (Almanac) · dawn on the last page ("Firstlight"; live id
  // stays `bloom`). Extracted from the chunk-3 sheets — same slot table, new answers.
  folio: {
    sectionRule: 'caret-rule',
    frame: 'margin-rule',
    tag: 'drawn-mark',
    progress: 'page-lines',
    motif: 'caret',
    spine: {
      binding: 'galley',
      band: 'pencil',
      colophon: 'caret',
      label: 'none',
      titleUpper: false,
    },
    placeholder: 'proof-sheet',
  },
  hearth: {
    sectionRule: 'stitched',
    frame: 'stitched-inset',
    tag: 'jar-label',
    progress: 'cross-stitch',
    motif: 'button',
    spine: {
      binding: 'linen',
      band: 'stitched',
      colophon: 'button',
      label: 'none',
      titleUpper: false,
    },
    placeholder: 'linen-board',
  },
  almanac: {
    sectionRule: 'index-rule',
    frame: 'record-card',
    tag: 'index-tab',
    progress: 'rule-ticks',
    motif: 'tab',
    spine: {
      binding: 'manual',
      band: 'ink-block',
      colophon: 'rule',
      label: 'ref-no',
      titleUpper: true,
    },
    placeholder: 'buff-manual',
  },
  bloom: {
    sectionRule: 'dotted',
    frame: 'sticker-ring',
    tag: 'puffy-sticker',
    progress: 'sun-rise',
    motif: 'sun',
    spine: { binding: 'sky', band: 'gel', colophon: 'sun', label: 'none', titleUpper: false },
    placeholder: 'sky-mockup',
  },
}
