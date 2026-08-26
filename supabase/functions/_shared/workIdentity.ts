/** Edge-function twin of packages/core/src/normalize.ts's workIdentityPart. */
export const workIdentityPart = (value: string): string =>
  (value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
