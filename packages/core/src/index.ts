/**
 * @reverie/core — shared types and ported domain logic.
 *
 * Step 3 fills this in: the merge engine, the Goodreads/StoryGraph CSV importer,
 * and the spoiler-gate rule (`comment.unit <= myProgress`), all moved here from the
 * prototype with unit tests. For now it owns the one piece of identity we deliberately
 * keep out of UI strings: the app name.
 */

/** The product name. Kept in one place so a rename touches a single line. */
export const APP_NAME = 'Reverie'
