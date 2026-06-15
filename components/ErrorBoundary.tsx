import React, { Component, ComponentType, PropsWithChildren } from "react";
import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";
import { markJsError } from "@/lib/crash-logger";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  private autoRetryCount = 0;
  private lastErrorKey: string | null = null;

  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    const errorKey = (error as Error).message;
    if (errorKey !== this.lastErrorKey) {
      this.autoRetryCount = 0;
      this.lastErrorKey = errorKey;
    }
    markJsError(error, info.componentStack).catch(() => {});
    import("@/lib/sentry").then(s => s.captureException(error, { componentStack: info.componentStack })).catch(() => {});
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack);
    }
  }

  autoRetry = (): void => {
    this.autoRetryCount += 1;
    this.setState({ error: null });
  };

  resetError = (): void => {
    this.autoRetryCount = 0;
    this.lastErrorKey = null;
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
        autoRetry={this.autoRetry}
        autoRetryCount={this.autoRetryCount}
      />
    ) : (
      this.props.children
    );
  }
}
