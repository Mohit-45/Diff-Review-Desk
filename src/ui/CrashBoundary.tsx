import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { clearAll } from '../app/clear';
import { createStorageAdapter } from '../storage/adapter';
import { crashMessages } from './messages/crash';
import { componentNames, reportUnexpected } from './reportUnexpected';

export type CrashScope = 'root' | 'review';

type CrashBoundaryProps = {
  readonly scope: CrashScope;
  readonly children: ReactNode;
  /** Wipes saved data and returns true when it worked. The root scope has its own default. */
  readonly onClearData?: () => boolean;
  /** Starts the page again. Tests inject one; the browser's reload is the default. */
  readonly onReload?: () => void;
};

type CrashBoundaryState = { readonly failed: boolean };

function reloadPage(): void {
  window.location.reload();
}

/** The root sits outside the app, so it opens the browser's storage itself. */
function clearBrowserData(): boolean {
  try {
    return clearAll(createStorageAdapter()).ok;
  } catch {
    return false;
  }
}

type FallbackProps = Required<Pick<CrashBoundaryProps, 'onClearData' | 'onReload'>> & {
  readonly scope: CrashScope;
};

function CrashFallback({ scope, onClearData, onReload }: FallbackProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const clear = () => {
    const cleared = onClearData();
    setFailed(!cleared);
    if (cleared && scope === 'root') {
      onReload();
    }
  };
  return (
    <section className="crash" aria-labelledby={`crash-title-${scope}`}>
      <h2 id={`crash-title-${scope}`} ref={headingRef} tabIndex={-1}>
        {crashMessages.title}
      </h2>
      <p>{crashMessages.body}</p>
      <div className="button-row">
        <button type="button" className="button button-primary" onClick={onReload}>
          {crashMessages.reload}
        </button>
        <button type="button" className="button button-secondary" onClick={clear}>
          {crashMessages.clear}
        </button>
      </div>
      {failed ? <p role="status">{crashMessages.clearFailed}</p> : null}
    </section>
  );
}

/**
 * RV-RENDER-CRASH: a render error replaces the failed part with a way out instead of a blank
 * page. The error itself goes to reportUnexpected, which keeps its message and stack to itself.
 */
export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  override state: CrashBoundaryState = { failed: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportUnexpected('render-crash', error, { components: componentNames(info.componentStack) });
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    const { scope, onClearData = clearBrowserData, onReload = reloadPage } = this.props;
    return <CrashFallback scope={scope} onClearData={onClearData} onReload={onReload} />;
  }
}
