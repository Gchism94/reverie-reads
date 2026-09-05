import { createContext } from 'react'
import type { SkinId } from '@reverie/core'

/** A sample room changes structural components without changing the reader's saved preference. */
export const SkinPreviewContext = createContext<SkinId | null>(null)
