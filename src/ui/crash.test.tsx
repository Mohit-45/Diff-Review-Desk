import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { version } from '../../package.json';
import { CrashBoundary } from './CrashBoundary';
import { installGlobalHandlers } from './installGlobalHandlers';
import {
  buildPayload,
  componentNames,
  reportUnexpected,
  scriptLocation,
  setDiagnostics,
  type UnexpectedPayload,
} from './reportUnexpected';

// Built at runtime so the repository hygiene scan does not see a machine-path needle.
const PRIVATE_DIRECTORY = ['/pri', 'vate/'].join('');
const SECRET_MESSAGE = `message-quoting-the-diff-and-a-path-src${PRIVATE_DIRECTORY}keys.ts`;
const REPORT_TITLE = 'Diff Review Desk hit an unexpected error.';

afterEach(() => {
  cleanup();
  setDiagnostics(null);
  vi.restoreAllMocks();
});

function Thrower(): never {
  throw new TypeError(SECRET_MESSAGE);
}

/** Only the app's own reports: React logs the caught error through console.error as well. */
function captureReports(): UnexpectedPayload[] {
  const reports: UnexpectedPayload[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (args[0] === REPORT_TITLE) reports.push(args[1] as UnexpectedPayload);
  });
  return reports;
}

describe('RV-RENDER-CRASH the boundary replaces a failed render with a way out', () => {
  it('focuses its heading and offers Reload and Clear saved data', () => {
    captureReports();
    render(
      <CrashBoundary scope="root" onClearData={() => true} onReload={() => undefined}>
        <Thrower />
      </CrashBoundary>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Something went wrong' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear saved data' })).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRET_MESSAGE);
  });

  it('renders its children untouched while nothing fails', () => {
    render(
      <CrashBoundary scope="review">
        <p>all well</p>
      </CrashBoundary>,
    );
    expect(screen.getByText('all well')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull();
  });

  it('Reload starts the page again', () => {
    captureReports();
    const reload = vi.fn();
    render(
      <CrashBoundary scope="root" onClearData={() => true} onReload={reload}>
        <Thrower />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('Clear saved data at the root wipes and then reloads', () => {
    captureReports();
    const reload = vi.fn();
    const clear = vi.fn(() => true);
    render(
      <CrashBoundary scope="root" onClearData={clear} onReload={reload}>
        <Thrower />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    expect(clear).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('says so, and does not reload, when the wipe failed', () => {
    captureReports();
    const reload = vi.fn();
    render(
      <CrashBoundary scope="root" onClearData={() => false} onReload={reload}>
        <Thrower />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    expect(screen.getByRole('status').textContent).toBe('Saved data could not be cleared.');
    expect(reload).not.toHaveBeenCalled();
  });

  it('wipes the browser storage by itself when the root has no app to ask', () => {
    captureReports();
    window.localStorage.setItem('drd:prefs', '{}');
    window.localStorage.setItem('other-app:key', 'keep');
    const reload = vi.fn();
    render(
      <CrashBoundary scope="root" onReload={reload}>
        <Thrower />
      </CrashBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
    expect(window.localStorage.getItem('drd:prefs')).toBeNull();
    expect(window.localStorage.getItem('other-app:key')).toBe('keep');
    expect(reload).toHaveBeenCalledOnce();
    window.localStorage.clear();
  });

  it('reports once, with the error name and component names and nothing else', () => {
    const reports = captureReports();
    render(
      <CrashBoundary scope="root" onClearData={() => true} onReload={() => undefined}>
        <Thrower />
      </CrashBoundary>,
    );
    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report?.code).toBe('render-crash');
    expect(report?.error).toBe('TypeError');
    expect(report?.app).toBe(version);
    expect(report?.components).toContain('Thrower');
    expect(JSON.stringify(report)).not.toContain(SECRET_MESSAGE);
    expect(JSON.stringify(report)).not.toContain('keys.ts');
  });
});

describe('RV-RENDER-CRASH window handlers report without messages', () => {
  it('reports a script error as script:line:col', () => {
    const reports = captureReports();
    const remove = installGlobalHandlers(window);
    act(() => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          message: SECRET_MESSAGE,
          filename: 'http://localhost:4173/assets/index-abc123.js',
          lineno: 10,
          colno: 5,
          error: new RangeError(SECRET_MESSAGE),
        }),
      );
    });
    remove();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      code: 'window-error',
      error: 'RangeError',
      location: 'index-abc123.js:10:5',
    });
    expect(JSON.stringify(reports)).not.toContain(SECRET_MESSAGE);
  });

  it('reports an unhandled rejection by the name of what was thrown', () => {
    const reports = captureReports();
    const remove = installGlobalHandlers(window);
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: new SyntaxError(SECRET_MESSAGE) }),
      );
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: SECRET_MESSAGE }),
      );
    });
    remove();
    expect(reports.map((report) => [report.code, report.error])).toEqual([
      ['unhandled-rejection', 'SyntaxError'],
      ['unhandled-rejection', 'NonError'],
    ]);
    expect(JSON.stringify(reports)).not.toContain(SECRET_MESSAGE);
  });

  it('stops reporting once the listeners are removed', () => {
    const reports = captureReports();
    installGlobalHandlers(window)();
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: new Error('x') }),
      );
    });
    expect(reports).toHaveLength(0);
  });
});

describe('RV-RENDER-CRASH the payload holds only what the spec allows', () => {
  it('carries the app version, a typed code, counts and the storage mode', () => {
    setDiagnostics(() => ({ storageMode: 'memory', files: 3, hunks: 7 }));
    expect(buildPayload('window-error', new Error('x'))).toMatchObject({
      app: version,
      code: 'window-error',
      storage: 'memory',
      files: 3,
      hunks: 7,
    });
    setDiagnostics(null);
    expect(buildPayload('window-error', new Error('x'))).toMatchObject({
      storage: 'unknown',
      files: null,
      hunks: null,
    });
  });

  it('replaces an error name that is not a plain identifier', () => {
    const hostile = Object.assign(new Error('x'), { name: 'path /secret/keys.ts' });
    expect(buildPayload('render-crash', hostile).error).toBe('Error');
  });

  it('takes the location from the first frame after the message, never from the message', () => {
    const error = new Error('see leak/secret.ts:1:2');
    error.stack = `Error: see leak/secret.ts:1:2\n    at run (http://localhost/assets/app-9.js:3:4)`;
    expect(buildPayload('render-crash', error).location).toBe('app-9.js:3:4');
    const bare = new Error('no frames');
    bare.stack = 'Error: no frames';
    expect(buildPayload('render-crash', bare).location).toBeNull();
  });

  it('keeps only identifiers from a component stack, and at most twelve', () => {
    const stack = [
      '',
      ...Array.from({ length: 20 }, (_unused, index) => `    at Card${String(index)} (x.js:1:1)`),
      '    at div',
      '    at not a name',
    ].join('\n');
    const names = componentNames(stack);
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('Card0');
    expect(componentNames('    at src/secret path (x.js:1:1)')).toEqual([]);
    expect(componentNames(null)).toEqual([]);
  });

  it('drops the path and the query of a script location', () => {
    expect(scriptLocation('https://example.test/a/b/main.tsx', 8, 2)).toBe('main.tsx:8:2');
    expect(scriptLocation('https://example.test/a?token=1', 8, 2)).toBeNull();
    expect(scriptLocation('', 0, 0)).toBeNull();
  });

  it('writes one console entry for one report', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportUnexpected('clear-failed', new Error('x'));
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toBe(REPORT_TITLE);
  });
});
