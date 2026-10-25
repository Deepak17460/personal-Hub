import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { useRouteError } from 'react-router';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. the current route path). */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

export function ErrorFallback({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const isChunkError = error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
        <AlertOctagon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {isChunkError
          ? 'A new version of the app is available or you are offline. Reload to continue.'
          : 'This part of the app hit an unexpected error. Your saved data is not affected.'}
      </p>
      <div className="mt-6 flex gap-2">
        {onRetry && !isChunkError && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}

export function RouteErrorElement() {
  const error = useRouteError();
  return <ErrorFallback error={error} />;
}
