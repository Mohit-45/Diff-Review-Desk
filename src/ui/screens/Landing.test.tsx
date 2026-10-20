import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from './Landing';
import { LoadDialog } from '../components/LoadDialog';
import { BUILT_IN_SAMPLES } from '../../samples';

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

describe('landing accessibility tree', () => {
  it('IN-SAMPLE-NAME exposes each built-in sample as a named button with plain text content', () => {
    render(<Landing {...landingProps()} />);
    expect(BUILT_IN_SAMPLES.map((sample) => sample.title)).toEqual([
      'Sample: agent run 1',
      'Sample: agent run 2, after fixes',
    ]);
    for (const sample of BUILT_IN_SAMPLES) {
      const button = screen.getByRole('button', { name: sample.title });
      // A SafeText wrapper would add a nested span; trusted constants need none.
      expect(button.children).toHaveLength(0);
      expect(button.querySelector('span')).toBeNull();
      expect(button.textContent).toBe(sample.title);
    }
  });

  it('IN-SAMPLE-NAME keeps the sample buttons named while loading disables them', () => {
    render(<Landing {...landingProps()} loading />);
    const button = screen.getByRole('button', { name: 'Sample: agent run 1' });
    expect(button).toHaveProperty('disabled', true);
  });

  it('IN-ROLES gives every labelled wrapper an explicit role', () => {
    const { container } = render(<Landing {...landingProps()} />);
    expect(screen.getByRole('group', { name: 'Built-in samples' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Drop a unified diff' })).toBeTruthy();
    const unnamedWrappers = container.querySelectorAll(
      'div[aria-label]:not([role]), span[aria-label]:not([role]), p[aria-label]:not([role]), div[aria-labelledby]:not([role]), span[aria-labelledby]:not([role])',
    );
    expect(unnamedWrappers).toHaveLength(0);
  });

  it('IN-ROLES keeps the error state free of named generic elements too', () => {
    const { container } = render(
      <Landing
        {...landingProps()}
        status="Loaded a.diff."
        error={{
          code: 'not-a-diff',
          title: 'This does not look like a diff',
          detail: 'No file or hunk headers were found.',
          hint: 'generic',
          suggestion: 'git diff HEAD',
        }}
      />,
    );
    expect(screen.getByRole('region', { name: 'This does not look like a diff' })).toBeTruthy();
    const namedGenerics = Array.from(
      container.querySelectorAll('[aria-label], [aria-labelledby]'),
    ).filter(
      (element) =>
        (element.tagName === 'DIV' || element.tagName === 'SPAN') && !element.hasAttribute('role'),
    );
    expect(namedGenerics).toHaveLength(0);
  });

  it('IN-DROP-PRESENTATION keeps the drag-event target out of the accessibility tree', () => {
    render(<Landing {...landingProps()} />);
    const group = screen.getByRole('group', { name: 'Drop a unified diff' });
    expect(group.parentElement?.getAttribute('role')).toBe('presentation');
    expect(group.getAttribute('aria-label')).toBe('Drop a unified diff');
  });

  it('IN-PRIVACY renders the privacy line as plain paragraph text', () => {
    render(<Landing {...landingProps()} />);
    const line = screen.getByText(/Private by design\./u);
    expect(line.tagName).toBe('P');
    expect(line.textContent).toBe(
      "Private by design. Your diff, comments and decisions never leave this browser. This page makes no network requests. Diff text is kept in this tab's session storage. Decisions and comments are saved in this browser.",
    );
  });
});

describe('intake behaviour', () => {
  it('IN-EMPTY reports a blank textarea instead of loading it', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.change(screen.getByLabelText('Paste a unified diff'), { target: { value: '  \n ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load diff' }));
    expect(props.onLoadText).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Nothing to review' })).toBeTruthy();
    expect(screen.getByLabelText('Paste a unified diff').getAttribute('aria-invalid')).toBe('true');
  });

  it('IN-OVERLIMIT-FILE states the observed size and the limit in bytes', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const file = new File(['x'], 'oversized.diff', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('Choose a text diff file'), {
      target: { files: [file] },
    });
    expect(
      screen.getByText('The input is 10485761 bytes; the limit is 10485760 bytes.'),
    ).toBeTruthy();
  });

  it('IN-EMPTY-FILE rejects a zero byte file by name', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const file = new File([], 'nothing.diff', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Choose a text diff file'), {
      target: { files: [file] },
    });
    expect(props.onLoadFile).not.toHaveBeenCalled();
    expect(screen.getByText('The selected file nothing.diff is empty.')).toBeTruthy();
  });

  it('IN-MULTI-FILE loads the first picked file and says how many were ignored', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const files = ['a.diff', 'b.diff', 'c.diff'].map(
      (name) => new File(['diff'], name, { type: 'text/plain' }),
    );
    fireEvent.change(screen.getByLabelText('Choose a text diff file'), { target: { files } });
    expect(props.onLoadFile).toHaveBeenCalledWith(files[0], 2);
    expect(screen.getByText('Loaded a.diff. Ignored 2 other files.')).toBeTruthy();
  });

  it('IN-SINGLE-FILE announces a plain load without an ignored count', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const file = new File(['diff'], 'only.diff', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Choose a text diff file'), {
      target: { files: [file] },
    });
    expect(props.onLoadFile).toHaveBeenCalledWith(file, 0);
    expect(screen.getByText('Loaded only.diff.')).toBeTruthy();
  });

  it('IN-DROP-UNREADABLE reports a drop that carries no file', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.drop(screen.getByRole('group', { name: 'Drop a unified diff' }), {
      dataTransfer: { files: [] },
    });
    expect(props.onLoadFile).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: "That file isn't text" })).toBeTruthy();
  });

  it('IN-DROP-NO-TRANSFER survives a drop event without a DataTransfer', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('group', { name: 'Drop a unified diff' }), drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(props.onLoadFile).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: "That file isn't text" })).toBeTruthy();
  });

  it('IN-DROP-HOVER shows the release hint while dragging and resets on leave and drop', () => {
    render(<Landing {...landingProps()} />);
    const group = screen.getByRole('group', { name: 'Drop a unified diff' });
    expect(group.getAttribute('data-dragging')).toBeNull();
    expect(screen.getByText('Drop a diff here')).toBeTruthy();

    fireEvent.dragEnter(group);
    expect(group.getAttribute('data-dragging')).toBe('true');
    expect(screen.getByText('Release to load the diff')).toBeTruthy();

    fireEvent.dragLeave(group);
    expect(group.getAttribute('data-dragging')).toBeNull();

    fireEvent.dragOver(group);
    expect(group.getAttribute('data-dragging')).toBe('true');
    fireEvent.drop(group, { dataTransfer: { files: [] } });
    expect(group.getAttribute('data-dragging')).toBeNull();
  });

  it('IN-SAMPLE-STATUS announces which sample is loading', () => {
    render(<Landing {...landingProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sample: agent run 2, after fixes' }));
    expect(screen.getByText('Loading Sample: agent run 2, after fixes.')).toBeTruthy();
  });

  it('IN-DOC-PASTE loads pasted plain text outside any field', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.paste(document.body, { clipboardData: { getData: () => 'diff --git a/a b/a' } });
    expect(props.onLoadText).toHaveBeenCalledWith('diff --git a/a b/a');
  });

  it('IN-DOC-PASTE announces a clipboard without text and opens nothing', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.paste(document.body, { clipboardData: { getData: () => '   ' } });
    expect(props.onLoadText).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Clipboard has no text' })).toBeTruthy();
  });

  it('IN-DOC-PASTE leaves a paste inside the textarea to the textarea', () => {
    const props = landingProps();
    render(<Landing {...props} />);
    fireEvent.paste(screen.getByLabelText('Paste a unified diff'), {
      clipboardData: { getData: () => 'diff --git a/a b/a' },
    });
    expect(props.onLoadText).not.toHaveBeenCalled();
  });
});

describe('load dialog frame', () => {
  it('IN-DIALOG-EMBEDDED renders a plain block, with no second landmark, when the parent owns the dialog', () => {
    render(<LoadDialog open embedded onClose={vi.fn()} {...landingProps()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Load a diff' }).id).toBe(
      'load-dialog-title',
    );
    expect(screen.getByLabelText('Paste a unified diff')).toBeTruthy();
  });

  it('IN-DIALOG-CLOSED renders nothing', () => {
    const { container } = render(<LoadDialog open={false} onClose={vi.fn()} {...landingProps()} />);
    expect(container.childElementCount).toBe(0);
  });

  it('IN-DIALOG-BUSY marks the dialog busy and disables the controls while loading', () => {
    render(<LoadDialog open loading onClose={vi.fn()} {...landingProps()} />);
    expect(screen.getByRole('dialog', { name: 'Load a diff' }).getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Load diff' })).toHaveProperty('disabled', true);
  });
});
