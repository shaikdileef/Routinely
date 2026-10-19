import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './Feedback';

interface ErrorBoundaryState {
  error: unknown;
}

/** Catches render errors so a crash shows a message and a reload button instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 480, margin: '15vh auto', padding: 16 }}>
          <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return this.props.children;
  }
}
