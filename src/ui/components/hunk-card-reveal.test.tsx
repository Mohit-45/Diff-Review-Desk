import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsedFiles } from '../../app/appFixtures';
import type { DiffFile, Hunk } from '../../core/types';
import { FAKE, longHunkDiff, secretsDiff } from '../diffFixtures';
import { HunkCard } from './HunkCard';

afterEach(() => {
  cleanup();
});

function hunkOf(text: string, path?: string): { file: DiffFile; hunk: Hunk } {
  const files = parsedFiles(text).files;
  const file = path === undefined ? files[0] : files.find((item) => item.displayPath === path);
  const hunk = file?.hunks[0];
  if (file === undefined || hunk === undefined) throw new Error('The fixture has no such hunk.');
  return { file, hunk };
}

const BINARY = [
  'diff --git a/assets/logo.png b/assets/logo.png',
  'index 1111111..2222222 100644',
  'Binary files a/assets/logo.png and b/assets/logo.png differ',
  '',
].join('\n');

const MODE = [
  'diff --git a/scripts/release.sh b/scripts/release.sh',
  'old mode 100644',
  'new mode 100755',
  '',
].join('\n');

const DELETED = [
  'diff --git a/src/gone.ts b/src/gone.ts',
  'deleted file mode 100644',
  'index 1111111..0000000',
  '--- a/src/gone.ts',
  '+++ /dev/null',
  '@@ -1,3 +0,0 @@',
  '-one',
  '-two',
  '-three',
  '',
].join('\n');

const MODIFIED = [
  'diff --git a/src/m.ts b/src/m.ts',
  'index 1111111..2222222 100644',
  '--- a/src/m.ts',
  '+++ b/src/m.ts',
  '@@ -5,3 +5,4 @@',
  ' keep',
  '-old',
  '+new',
  '+extra',
  ' tail',
  '',
].join('\n');

function reveal(): HTMLElement | null {
  return screen.queryByRole('button', { name: /^(Reveal|Hide) secrets/ });
}

describe('HUNK-REVEAL the per-hunk Reveal button', () => {
  it('HUNK-REVEAL-TOGGLE masks first, reveals on press and hides again', () => {
    const { file, hunk } = hunkOf(secretsDiff(), 'src/config.ts');
    const { container } = render(<HunkCard hunk={hunk} file={file} />);

    const button = screen.getByRole('button', { name: 'Reveal secrets' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(container.innerHTML).not.toContain(FAKE.awsKey);

    fireEvent.click(button);

    const pressed = screen.getByRole('button', { name: 'Hide secrets' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain(FAKE.awsKey);
    expect(container.textContent).toContain(FAKE.assignValue);

    fireEvent.click(pressed);

    expect(
      screen.getByRole('button', { name: 'Reveal secrets' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(container.innerHTML).not.toContain(FAKE.awsKey);
  });

  it('HUNK-REVEAL-ABSENT shows no Reveal button when nothing is masked', () => {
    const { file, hunk } = hunkOf(secretsDiff(), 'docs/readme.txt');
    render(<HunkCard hunk={hunk} file={file} />);

    expect(reveal()).toBeNull();
  });

  it('HUNK-REVEAL-SENSITIVE offers Reveal for a sensitive file and a pem key', () => {
    for (const path of ['.env', 'old/.env', 'certs/deploy.txt']) {
      const { file, hunk } = hunkOf(secretsDiff(), path);
      const { unmount } = render(<HunkCard hunk={hunk} file={file} />);

      expect(reveal()?.textContent).toBe('Reveal secrets');
      unmount();
    }
  });

  it('HUNK-REVEAL-CONTROLLED follows the revealed prop and reports presses', () => {
    const { file, hunk } = hunkOf(secretsDiff(), '.env');
    const onRevealChange = vi.fn();
    const { container, rerender } = render(
      <HunkCard hunk={hunk} file={file} revealed={false} onRevealChange={onRevealChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reveal secrets' }));

    expect(onRevealChange).toHaveBeenCalledWith(true);
    expect(container.textContent).not.toContain(FAKE.envValue);
    rerender(<HunkCard hunk={hunk} file={file} revealed onRevealChange={onRevealChange} />);
    expect(container.textContent).toContain(FAKE.envValue);
  });

  it('HUNK-REVEAL-COLLAPSED keeps the toolbar, and its Reveal button, when the table is folded', () => {
    const { file, hunk } = hunkOf(secretsDiff(), 'src/config.ts');
    render(<HunkCard hunk={hunk} file={file} collapsed />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(reveal()).not.toBeNull();
  });

  it('HUNK-REVEAL-FLAGS never shows the raw value in the evidence or any attribute', () => {
    const { file, hunk } = hunkOf(secretsDiff(), 'src/config.ts');
    const { container } = render(<HunkCard hunk={hunk} file={file} />);
    const values = [container, ...container.querySelectorAll('*')].flatMap((element) =>
      Array.from(element.attributes).map((attribute) => attribute.value),
    );

    expect(values.join('\n')).not.toContain(FAKE.awsKey);
    expect(values.join('\n')).not.toContain(FAKE.assignValue);
  });
});

describe('HUNK-COPY card copy', () => {
  it('HUNK-NO-COMMENT tells a rejected hunk without a comment what happens next', () => {
    const { file, hunk } = hunkOf(MODIFIED);
    const text = 'No comment yet. The agent will be told to revert or rework this hunk.';
    const { rerender } = render(
      <HunkCard hunk={hunk} file={file} decision="rejected" comment="" />,
    );

    expect(screen.getByText(text)).toBeTruthy();

    rerender(<HunkCard hunk={hunk} file={file} decision="rejected" comment="Please redo." />);
    expect(screen.queryByText(text)).toBeNull();
    expect(screen.getByText('Please redo.')).toBeTruthy();

    rerender(<HunkCard hunk={hunk} file={file} decision="approved" comment="" />);
    expect(screen.queryByText(text)).toBeNull();

    rerender(<HunkCard hunk={hunk} file={file} decision={null} comment="" />);
    expect(screen.queryByText(text)).toBeNull();

    rerender(<HunkCard hunk={hunk} file={file} decision="rejected" comment="" editing />);
    expect(screen.queryByText(text)).toBeNull();
  });

  it('HUNK-NO-FLAGS says zero flags is not a security assessment', () => {
    const { file, hunk } = hunkOf(MODIFIED);
    render(<HunkCard hunk={hunk} file={file} flags={[]} />);

    expect(
      screen.getByText('No heuristic flags matched. This is not a security assessment.'),
    ).toBeTruthy();
  });

  it('HUNK-META-HEADING titles a meta hunk by its reason, not by lines 0–0', () => {
    const binary = hunkOf(BINARY);
    const { unmount } = render(<HunkCard hunk={binary.hunk} file={binary.file} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Hunk 1 of 1, binary file');
    unmount();

    const mode = hunkOf(MODE);
    render(<HunkCard hunk={mode.hunk} file={mode.file} hunkNumber={2} totalHunks={5} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Hunk 2 of 5, mode change');
  });

  it('HUNK-RANGE names the lines a hunk covers without a zero from the empty side', () => {
    const deleted = hunkOf(DELETED);
    const first = render(<HunkCard hunk={deleted.hunk} file={deleted.file} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Hunk 1 of 1, lines 1–3');
    first.unmount();

    const added = hunkOf(longHunkDiff('src/new.ts', 4));
    const second = render(<HunkCard hunk={added.hunk} file={added.file} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Hunk 1 of 1, lines 1–4');
    second.unmount();

    const modified = hunkOf(MODIFIED);
    render(<HunkCard hunk={modified.hunk} file={modified.file} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Hunk 1 of 1, lines 5–8');
  });
});

describe('HUNK-FOLD a folded diff opens behind Show diff', () => {
  it('HUNK-SHOW-DIFF replaces a folded table with a button that opens it and focuses the first row', () => {
    const { file, hunk } = hunkOf(MODIFIED);
    const { container } = render(<HunkCard hunk={hunk} file={file} defaultCollapsed />);

    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show diff (5 lines)' }));

    const table = within(container).getByRole('table');
    expect(table).toBeTruthy();
    expect(document.activeElement).toBe(container.querySelector('tr.diff-line'));
    expect(screen.queryByRole('button', { name: /^Show diff/ })).toBeNull();
  });

  it('HUNK-SHOW-DIFF-KEY does not steal focus when the toolbar toggle opens the table', () => {
    const { file, hunk } = hunkOf(MODIFIED);
    render(<HunkCard hunk={hunk} file={file} defaultCollapsed />);
    const toggle = screen.getByRole('button', { name: 'Expand hunk' });
    toggle.focus();

    fireEvent.click(toggle);

    expect(screen.getByRole('table')).toBeTruthy();
    expect(document.activeElement).toBe(toggle);
  });
});
