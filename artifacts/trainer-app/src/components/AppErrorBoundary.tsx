import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort UI guard for unexpected render/lifecycle errors.
 * The original error stays in the browser console for diagnosis; users only see
 * recovery actions rather than a blank application root.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Trainer Panel recovered from an application error", {
      error,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
    });
  }

  private tryAgain = () => {
    this.setState({ hasError: false });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8">
        <section
          className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <h1 className="text-lg font-semibold text-foreground">
            Coś poszło nie tak
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nie udało się wyświetlić tej części panelu. Spróbuj ponownie albo
            odśwież stronę.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.tryAgain}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Spróbuj ponownie
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Odśwież stronę
            </button>
          </div>
        </section>
      </main>
    );
  }
}