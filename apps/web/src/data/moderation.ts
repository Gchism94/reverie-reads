import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type ReportTarget = 'review' | 'club_comment'

/**
 * File a content report (Phase 7 H3). Any signed-in user can report a review or club comment; a
 * repeat report on the same item is a no-op (one per user per item). The owner reviews reports
 * out-of-band and hides content via the service role; authors can also hide their own.
 */
export function useReportContent() {
  return useMutation({
    mutationFn: async ({ targetType, targetId, reason }: { targetType: ReportTarget; targetId: string; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { error } = await supabase
        .from('content_reports')
        .insert({ reporter_id: uid, target_type: targetType, target_id: targetId, reason: reason ?? null })
      // A duplicate (already reported) is fine — treat as success.
      if (error && error.code !== '23505') throw error
    },
  })
}
