import { useRef, useState } from 'react'
import { createRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { findDuplicateGroups, richness, type Book } from '@reverie/core'
import { rootRoute } from './RootRoute'
import { useBooks } from '../data/books'
import { useProfile, useUpdateProfile } from '../data/profile'
import { usePerformMerge } from '../data/mergeBooks'
import { buildBackup, importCsvToBackend, restoreBackup } from '../data/importExport'
import { useTheme, type Theme } from '../theme/useTheme'
import { useAuth } from '../auth/AuthProvider'

const YEAR = new Date().getFullYear()

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-5" style={{ background: 'var(--card)' }}>
      <h2 className="mb-3 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </div>
  )
}

const fieldClass = 'h-10 w-full rounded-xl border border-line px-3 text-[14px] text-ink outline-none'
const fieldStyle = { background: 'var(--field)' } as const

function SettingsScreen() {
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const { data: books } = useBooks()
  const updateProfile = useUpdateProfile()
  const performMerge = usePerformMerge()
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const { session } = useAuth()

  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [primed, setPrimed] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [showDupes, setShowDupes] = useState(false)
  const restoreRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  // Prime the form fields once the profile loads.
  if (profile && !primed) {
    setName(profile.displayName)
    setGoal(profile.goalYear === YEAR && profile.goalTarget ? String(profile.goalTarget) : '')
    setPrimed(true)
  }

  const all = books ?? []
  const dupes = findDuplicateGroups(all)

  const saveProfile = () =>
    updateProfile.mutate(
      { displayName: name.trim(), goalYear: YEAR, goalTarget: Math.max(0, parseInt(goal) || 0) },
      { onSuccess: () => setStatus('Saved') },
    )

  const exportBackup = async () => {
    const json = await buildBackup()
    const a = document.createElement('a')
    a.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
    a.download = `reverie-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const readFile = (input: HTMLInputElement, handler: (text: string) => Promise<void>) => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await handler(String(reader.result))
        void qc.invalidateQueries()
      } catch (e) {
        setStatus(`Failed: ${(e as Error).message}`)
      }
    }
    reader.readAsText(file)
    input.value = ''
  }

  async function mergeOneGroup(group: Book[]) {
    const sorted = [...group].sort((a, b) => richness(b) - richness(a))
    const primary = sorted[0]
    if (!primary) return
    for (const loser of sorted.slice(1)) {
      await performMerge.mutateAsync({ primary, loser })
    }
  }

  async function mergeGroup(group: Book[]) {
    const primary = [...group].sort((a, b) => richness(b) - richness(a))[0]
    if (!primary) return
    if (!window.confirm(`Merge ${group.length} copies of “${primary.title}” into one entry?`)) return
    try {
      await mergeOneGroup(group)
      setStatus('Merged')
    } catch (e) {
      setStatus(`Merge failed — nothing was lost (the merge is atomic). ${(e as Error).message}`)
    }
  }

  // Each pair-merge is an atomic RPC, so a failure leaves earlier groups merged and the rest
  // untouched — re-running "Merge all" simply continues from the still-duplicated groups.
  async function mergeAllGroups() {
    if (!window.confirm(`Review and merge all ${dupes.length} duplicate groups into one entry each?`)) return
    let merged = 0
    for (const g of dupes) {
      try {
        await mergeOneGroup(g)
        merged++
      } catch (e) {
        setStatus(
          `Merged ${merged} of ${dupes.length}; stopped at a failure (${(e as Error).message}). Nothing was lost — re-run “Merge all” to continue.`,
        )
        return
      }
    }
    setStatus(`Merged ${merged} duplicate groups`)
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-[22px] italic text-ink" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Settings
      </h1>

      <div className="flex flex-col gap-4">
        <Section title="Account">
          <p className="text-[13px] text-muted">
            Signed in as <span className="text-ink">{session?.user.email}</span>. Your library is stored
            in your account and follows you across devices — sign in anywhere to see the same shelves.
          </p>
        </Section>

        <Section title="Profile & goal">
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown in clubs & shared lists" className={fieldClass} style={fieldStyle} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted">Reading goal for {YEAR}</span>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} type="number" min={0} placeholder="e.g. 50" className={fieldClass} style={fieldStyle} />
          </label>
          <button
            type="button"
            onClick={saveProfile}
            className="h-10 rounded-xl px-5 text-[14px] font-semibold"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
          >
            Save
          </button>
        </Section>

        <Section title="Theme">
          <div className="flex gap-2">
            {(
              [
                ['nocturne', '☾ Nocturne'],
                ['dawn', '☀ Magnolia Dawn'],
              ] as [Theme, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className="flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold"
                style={
                  theme === value
                    ? { background: 'var(--accent-fill)', color: 'var(--on-primary)', borderColor: 'transparent' }
                    : { background: 'var(--field)', color: 'var(--ink)', borderColor: 'var(--line)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Library tools">
          <button
            type="button"
            onClick={() => setShowDupes((v) => !v)}
            className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink"
            style={{ background: 'var(--field)' }}
          >
            🔗 Merge duplicates{dupes.length ? ` (${dupes.length})` : ''}
          </button>
          {showDupes && (
            <div className="mt-3 flex flex-col gap-2">
              {dupes.length > 1 && (
                <button
                  type="button"
                  onClick={() => void mergeAllGroups()}
                  disabled={performMerge.isPending}
                  className="self-start rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
                >
                  Merge all {dupes.length} groups
                </button>
              )}
              {dupes.length ? (
                dupes.map((g, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3" style={{ background: 'var(--field)' }}>
                    <span className="text-[14px] font-semibold text-ink">
                      {g[0]?.title} <span className="text-[12px] font-normal text-muted">· {g.length} copies</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void mergeGroup(g)}
                      disabled={performMerge.isPending}
                      className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                      style={{ background: 'var(--accent-fill)', color: 'var(--on-primary)' }}
                    >
                      Merge these {g.length}
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-muted">No likely duplicates found ✨ — your library’s clean.</p>
              )}
            </div>
          )}
        </Section>

        <Section title="Backup & import">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportBackup()} className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
              ⬇ Export library (JSON)
            </button>
            <button type="button" onClick={() => restoreRef.current?.click()} className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
              ⬆ Restore backup
            </button>
            <button type="button" onClick={() => csvRef.current?.click()} className="rounded-full border border-line px-4 py-2 text-[13px] font-semibold text-ink" style={{ background: 'var(--field)' }}>
              📚 Import Goodreads / StoryGraph CSV
            </button>
            <input
              ref={restoreRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) =>
                readFile(e.currentTarget, async (text) => {
                  const r = await restoreBackup(text)
                  setStatus(`Restored ${r.books} books, ${r.lists} lists, ${r.reads} reads`)
                })
              }
            />
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) =>
                readFile(e.currentTarget, async (text) => {
                  const r = await importCsvToBackend(all, text)
                  setShowDupes(true)
                  setStatus(
                    `Imported ${r.added} new · updated ${r.updated}. If duplicates appear below, use “Merge all”.`,
                  )
                })
              }
            />
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            CSV import merges by title + author, bringing ratings, shelves, and <b>real read dates</b>.
          </p>
        </Section>

        {status && <p className="text-center text-[13px] text-primary">{status}</p>}
      </div>
    </section>
  )
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'settings',
  component: SettingsScreen,
})
