import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './Landing';
import { LoadDialog } from '../components/LoadDialog';

afterEach(() => {
  cleanup();
});

function landingProps() {
  return {
    onLoadText: vi.fn(),
    onLoadFile: vi.fn(),
    onLoadSample: vi.fn(),
  };
}

describe('landing intake', () => {
  it('IN-PASTE loads textarea text and advertises the keyboard submit path', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const textarea = screen.getByLabelText('Paste a unified diff');
    fireEvent.change(textarea, { target: { value: 'diff --git a/a b/a' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(props.onLoadText).toHaveBeenCalledWith('diff --git a/a b/a');
    expect(textarea.getAttribute('spellcheck')).toBe('false');
    expect(textarea.getAttribute('autocomplete')).toBe('off');
    expect(screen.getByText(/Private by design\./u)).toBeTruthy();
  });

  it('IN-SAMPLE calls the callback with a built-in sample object', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 1' }));
    expect(props.onLoadSample).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-run-1' }));
  });

  it('IN-OVERLIMIT-FILE rejects a file before invoking the file callback', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const input = screen.getByLabelText('Choose a text diff file');
    const file = new File(['x'], 'oversized.diff', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onLoadFile).not.toHaveBeenCalled();
    expect(screen.getByText('This diff is too large')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('IN-DROP-PREVENTED accepts the first dropped file and reports ignored files', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const dropZone = screen.getByLabelText('Drop a unified diff');
    const first = new File(['diff'], 'first.diff', { type: 'text/plain' });
    const second = new File(['diff'], 'second.diff', { type: 'text/plain' });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [first, second] } });
    fireEvent(dropZone, drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(props.onLoadFile).toHaveBeenCalledWith(first, 1);
  });

  it('IN-ERROR keeps hostile values in text/value sinks and offers a sample recovery', () => {
    const props = landingProps();
    render(
      <Landing
        {...props}
        error={{
          code: 'not-a-diff',
          title: '"><img src=x onerror=x()>',
          detail: '</textarea><script>alert(1)</script>',
          hint: 'generic',
          suggestion: 'git diff HEAD',
        }}
      />,
    );
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByDisplayValue('git diff HEAD')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(props.onLoadSample).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-run-1' }));
  });
});

describe('load dialog intake', () => {
  it('IN-DIALOG exposes the same labelled controls and close callback', () => {
    const onClose = vi.fn();
    const props = landingProps();
    render(<LoadDialog open onClose={onClose} {...props} />);
    expect(screen.getByRole('dialog', { name: 'Load a diff' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Paste a unified diff')).toBeTruthy();
  });
});
