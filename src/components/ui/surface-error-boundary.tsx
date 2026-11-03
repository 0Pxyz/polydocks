import { Component, type ReactNode } from "react";

/**
 * Visual error boundary for dock surfaces (#319). A crashing surface must
 * show an explicit error, never collapse into blank space.
 */
export class SurfaceErrorBoundary extends Component<
  { toolId: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[surface:${this.props.toolId}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full max-w-2xl px-4 py-8" aria-label={`Surface error: ${this.props.toolId}`}>
          <p className="text-sm font-medium text-white/90">
            This view crashed instead of rendering.
          </p>
          <p className="mt-1 text-xs text-white/50">
            Surface &ldquo;{this.props.toolId}&rdquo; threw: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
