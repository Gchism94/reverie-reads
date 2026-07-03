import { createRoute } from '@tanstack/react-router'
import { type SkinId } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { Frame, ProgressMeter, SectionHeader, SignatureEmblem, SignatureRing, StatusTag } from '../components/Structure'
import { Spine } from '../components/Spine'
import { BookmarkGlyph } from '../components/BookmarkGlyph'

// Spine shelf — real-style titles of varying length so the variable-length handling + size variation
// show, NOT the specimen's tidy samples: a one-word, a medium, a long, and a monster (title+subtitle).
const SHELF: { id: string; title: string; first: string; last: string }[] = [
  { id: 'sp-a', title: 'Vacuum', first: 'K', last: 'Voss' },
  { id: 'sp-b', title: 'Crimson Letters', first: 'D', last: 'Marchand' },
  { id: 'sp-c', title: 'Apogee', first: 'I', last: 'Mar' },
  { id: 'sp-d', title: 'The Lamplighter’s Unspoken Promise', first: 'D', last: 'Marchand' },
  { id: 'sp-e', title: 'Signal Lost', first: 'T', last: 'Reyes' },
  { id: 'sp-f', title: 'The Exhaustively Complete Chronicle of Everything: A Subtitle', first: 'L', last: 'Stern' },
  { id: 'sp-g', title: 'Lure', first: 'J', last: 'Okafor' },
]

/**
 * Structural-character preview (STEP 3 eyeball aid). Renders the SAME composed surfaces the real
 * Home/Library/empty screens now use — framed hero + signature ring + status tags, a section header,
 * a progress meter, an empty-state emblem — Tryst vs Aphelion, both modes, so the BONES can be
 * compared, not just the paint. Reachable at `/lab/structure` without auth (RootRoute's /lab gate).
 *
 * This is a preview of the real components (each takes `skin`), NOT the final verdict — that is Greg
 * on the authenticated app. See the structural-character task.
 */
const CELLS: { skin: SkinId; mode: 'dark' | 'light'; label: string }[] = [
  { skin: 'tryst', mode: 'dark', label: 'Tryst · dark' },
  { skin: 'tryst', mode: 'light', label: 'Tryst · light' },
  { skin: 'aphelion', mode: 'dark', label: 'Aphelion · dark' },
  { skin: 'aphelion', mode: 'light', label: 'Aphelion · light' },
]

function MiniCard({ skin }: { skin: SkinId }) {
  return (
    <div className="w-[120px] shrink-0">
      <div className="skin-card aspect-[2/3] overflow-hidden border border-line" style={{ background: 'linear-gradient(150deg, var(--card-2), var(--bg1))' }}>
        <div className="grid h-full w-full place-items-center italic" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.4rem', color: 'var(--ink)' }}>
          CL
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <StatusTag skin={skin} glyph="✓">Read</StatusTag>
        <StatusTag skin={skin} tone="muted">Own</StatusTag>
      </div>
    </div>
  )
}

function Cell({ skin, mode, label }: { skin: SkinId; mode: 'dark' | 'light'; label: string }) {
  return (
    <div data-skin={skin} data-mode={mode} className="overflow-hidden rounded-2xl border border-line p-5" style={{ background: 'var(--bg0)', color: 'var(--ink)' }}>
      <div className="skin-label mb-4 text-[10px] text-muted">{label}</div>

      {/* hero — Frame + signature goal ring + status tags */}
      <Frame skin={skin} className="flex items-center gap-4 p-4">
        <SignatureRing skin={skin} value={42} max={60} size={84} />
        <div className="min-w-0 flex-1">
          <div className="text-[18px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Good evening.
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusTag skin={skin} tone="muted">248 books</StatusTag>
            <StatusTag skin={skin} glyph="♥">17 faves</StatusTag>
            <StatusTag skin={skin} glyph={<BookmarkGlyph />}>3 priority</StatusTag>
          </div>
        </div>
      </Frame>

      {/* section header + a couple cards */}
      <SectionHeader skin={skin} className="mt-5" label="Your library" readout="248 / 290" />
      <div className="mt-3 flex gap-3">
        <MiniCard skin={skin} />
        <div className="flex-1">
          <div className="text-[13px] text-muted">Currently reading · 62%</div>
          <ProgressMeter skin={skin} value={62} max={100} className="mt-2" />
        </div>
      </div>

      {/* spine shelf — varying title lengths on real-style data */}
      <SectionHeader skin={skin} className="mt-5" label="On the shelf" readout={SHELF.length} />
      <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SHELF.map((b, i) => (
          <Spine key={b.id} book={b} skin={skin} active={i === 1} />
        ))}
      </div>

      {/* empty-state emblem */}
      <div className="mt-6 flex flex-col items-center gap-2 border-t border-line pt-5 text-center">
        <SignatureEmblem skin={skin} fallback="✦" size={36} />
        <div className="text-[15px] italic text-ink" style={{ fontFamily: 'var(--font-display)' }}>
          Your shelves wait in the dark.
        </div>
      </div>
    </div>
  )
}

function StructureLab() {
  return (
    <div className="mx-auto min-h-dvh max-w-[1120px] px-6 py-10" style={{ background: 'var(--bg0)' }}>
      <h1 className="text-[24px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        Structural character — bones, not paint
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        The same composed surfaces the real Home / Library / empty screens now use — framed hero +
        signature ring + tags, section header, progress meter, empty emblem. Tryst vs Aphelion, both
        modes. Final verdict is on the authenticated app, not here.
      </p>
      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        {CELLS.map((c) => (
          <Cell key={`${c.skin}/${c.mode}`} {...c} />
        ))}
      </div>
    </div>
  )
}

export const labStructureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'lab/structure',
  component: StructureLab,
})
