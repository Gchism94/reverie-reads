import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '@reverie/core'

interface Props {
  children: ReactNode
  /** What renders instead. Defaults to nothing — the surrounding page simply ends early. */
  fallback?: ReactNode
  /** Distinguishes one boundary from another in the error report. */
  label: string
}
interface State {
  failed: boolean
}

/**
 * A LOCAL boundary for a lazily-imported chunk that could not be fetched.
 *
 * Without one, a single failed dynamic import takes the whole page down: React unwinds to the
 * nearest boundary, which is the app-wide one, and the reader gets "Something went wrong!" instead
 * of the content that had already rendered above it.
 *
 * Two ways to arrive here, and both are real. Offline, a chunk the service worker never cached
 * simply cannot be fetched — the landing's below-fold section is exactly that for a reader who
 * signed in and went straight to their library, so it was never fetched and never cached. And
 * after a deploy, an old client's hashed chunks are gone from the CDN; `installPreloadErrorReload`
 * handles that by reloading once, but a second failure is meant to surface, and surfacing should
 * not mean erasing the page.
 */
export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, {
      kind: 'chunk-load',
      label: this.props.label,
      // Whether the network was up separates "stale deploy" from "offline", which are the same
      // symptom with different causes and different fixes.
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      componentStack: info.componentStack,
    })
  }

  render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
