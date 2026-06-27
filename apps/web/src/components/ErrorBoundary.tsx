import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '@reverie/core'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/** Catches render-time errors, reports them, and shows a calm fallback instead of a white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError(error, { kind: 'react', componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="relative z-[1] flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <h1
          className="text-[28px] italic text-ink"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Something went sideways
        </h1>
        <p className="mt-3 max-w-[40ch] text-[14px] text-muted">
          An unexpected error interrupted the page. Reloading usually clears it — your library is safe.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-6 h-11 rounded-full px-6 text-[14px] font-semibold"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))', color: 'var(--on-primary)' }}
        >
          Reload
        </button>
      </div>
    )
  }
}
