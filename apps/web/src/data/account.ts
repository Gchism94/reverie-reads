import { supabase } from '../lib/supabase'

/**
 * Irreversibly delete the signed-in account and ALL its data. Calls the delete-account Edge
 * Function, which (using the caller's own token to identify them) deletes the auth user — cascading
 * every owned row across all tables — and cleans up the user's capability-shared docs. The caller
 * should sign out afterward.
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
  if (error) throw error
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
}
