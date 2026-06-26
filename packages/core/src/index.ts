/**
 * @reverie/core — shared types and the prototype's tested domain logic, ported (not
 * rewritten) as pure functions: the merge engine, the Goodreads/StoryGraph CSV importer,
 * the spoiler gate, cover-URL helpers, and the boyfriend-archetype derivation.
 */

/** The product name. Kept in one place so a rename touches a single line. */
export const APP_NAME = 'Reverie'

export * from './types'
export * from './normalize'
export * from './id'
export * from './boyfriend'
export * from './spoiler'
export * from './covers'
export * from './merge'
export * from './csv'
export * from './filters'
export * from './ownership'
export * from './match'
export * from './buyLinks'
export * from './labels'
export * from './matcher'
export * from './skins'
export * from './adaptive'
export * from './enrich'
