export function isHouseholdAddContext(pathname: string, search: Record<string, unknown>): boolean {
  return (pathname === '/library' || pathname === '/add') && search.scope === 'household'
}
