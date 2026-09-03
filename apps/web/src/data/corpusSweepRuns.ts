import { useQuery } from '@tanstack/react-query'

export type CorpusSweepStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface CorpusSweepRun {
  id: string
  workflowRunId: string | null
  status: CorpusSweepStatus
  phase: 'queued' | 'recovering' | 'classifying' | 'complete'
  total: number
  scanned: number
  filled: number
  nothing: number
  failed: number
  recoveryScanned: number
  recoveryFailed: number
  recoveryFailedBatches: number
  recoveredCovers: number
  recoveredOptions: number
  errorMessage: string | null
  cancelRequestedAt: string | null
  createdAt: string
  completedAt: string | null
}

interface CorpusSweepRow {
  id: string
  workflow_run_id: string | null
  status: CorpusSweepStatus
  phase: CorpusSweepRun['phase']
  total_count: number
  scanned_count: number
  filled_count: number
  nothing_count: number
  failed_count: number
  recovery_scanned_count: number
  recovery_failed_count: number
  recovery_failed_batch_count: number
  recovered_cover_count: number
  recovered_option_count: number
  error_message: string | null
  cancel_requested_at: string | null
  created_at: string
  completed_at: string | null
}

const corpusSweepRunKey = ['corpus-sweep-run'] as const

const fromRow = (row: CorpusSweepRow): CorpusSweepRun => ({
  id: row.id,
  workflowRunId: row.workflow_run_id,
  status: row.status,
  phase: row.phase,
  total: row.total_count,
  scanned: row.scanned_count,
  filled: row.filled_count,
  nothing: row.nothing_count,
  failed: row.failed_count,
  recoveryScanned: row.recovery_scanned_count,
  recoveryFailed: row.recovery_failed_count,
  recoveryFailedBatches: row.recovery_failed_batch_count,
  recoveredCovers: row.recovered_cover_count,
  recoveredOptions: row.recovered_option_count,
  errorMessage: row.error_message,
  cancelRequestedAt: row.cancel_requested_at,
  createdAt: row.created_at,
  completedAt: row.completed_at,
})

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { statusMessage?: string } | null
    throw new Error(body?.statusMessage || `Corpus sweep request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export async function fetchCurrentCorpusSweep(token: string): Promise<CorpusSweepRun | null> {
  const result = await request<{ run: CorpusSweepRow | null }>('/api/corpus-sweeps/current', token)
  return result.run ? fromRow(result.run) : null
}

export async function startCorpusSweep(token: string): Promise<string> {
  const result = await request<{ runId: string }>('/api/corpus-sweeps', token, { method: 'POST' })
  return result.runId
}

export async function cancelCorpusSweep(token: string, runId: string): Promise<void> {
  await request('/api/corpus-sweeps/cancel', token, {
    method: 'POST',
    body: JSON.stringify({ runId }),
  })
}

export function useCurrentCorpusSweep(enabled: boolean, token?: string) {
  return useQuery({
    queryKey: corpusSweepRunKey,
    enabled: enabled && !!token,
    queryFn: () => fetchCurrentCorpusSweep(token ?? ''),
    refetchInterval: (query) => {
      const run = query.state.data
      return run?.status === 'queued' || run?.status === 'running' ? 2_000 : false
    },
    staleTime: 1_000,
  })
}

export function corpusSweepStatusText(run: CorpusSweepRun): string | null {
  const recovery = [
    run.recoveryScanned ? `${run.recoveryScanned} cover sources checked` : '',
    run.recoveredCovers ? `${run.recoveredCovers} corpus covers recovered` : '',
    run.recoveredOptions ? `${run.recoveredOptions} cover options published` : '',
    run.recoveryFailed ? `${run.recoveryFailed} cover sources deferred` : '',
    run.recoveryFailedBatches ? `${run.recoveryFailedBatches} cover recovery batches deferred` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const failures = run.failed ? ` · ${run.failed} works remain eligible to retry` : ''
  const detail = `checked ${run.scanned} of ${run.total} · filled ${run.filled} · ${run.nothing} had nothing new${recovery ? ` · ${recovery}` : ''}${failures}`
  if (run.status === 'completed') {
    const remaining = run.total - run.scanned - run.failed
    return remaining > 0
      ? `Corpus sweep paused at the per-run limit — ${detail} · ${remaining} works not reached. Run it again to continue.`
      : `Corpus sweep complete — ${detail}.`
  }
  if (run.status === 'cancelled') return `Corpus sweep stopped — ${detail}.`
  if (run.status === 'failed') {
    return `Corpus sweep needs attention — ${detail}${run.errorMessage ? ` · ${run.errorMessage}` : ''}.`
  }
  return run.cancelRequestedAt ? 'Stopping safely after the current work…' : null
}
