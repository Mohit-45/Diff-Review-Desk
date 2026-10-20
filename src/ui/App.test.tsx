import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from './App';
import { immediateFrame } from './frameFixtures';

beforeAll(() => {
  // jsdom has no modal dialog support; the wrapper elements only need to accept the calls.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  // The app now saves progress, so a review must not leak into the next test's first render.
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderApp() {
  return render(
    <StrictMode>
      <App frame={immediateFrame} />
    </StrictMode>,
  );
}

function loadSample(title: string): void {
  fireEvent.click(screen.getByRole('button', { name: title }));
}

describe('wired app review loop', () => {
  it('WIRED-APPROVE approves a hunk of sample 1 and updates the card, heading and rail', () => {
    renderApp();
    loadSample('Sample: agent run 1');

    expect(screen.getByRole('heading', { level: 3, name: /^Hunk 1 of 11, / })).toBeTruthy();
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();

    const approve = screen.getAllByRole('button', { name: 'Approve' })[0];
    expect(approve?.getAttribute('aria-pressed')).toBe('false');
    if (approve === undefined) throw new Error('No Approve button rendered.');
    fireEvent.click(approve);

    expect(
      screen.getAllByRole('button', { name: 'Approve' })[0]?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Hunk 1 of 11, / })).toBeTruthy();
    expect(screen.getByText('Approved 1 · Rejected 0 · Pending 10')).toBeTruthy();
  });

  it('WIRED-REJECT rejects a hunk, opens the comment editor and counts it as decided', () => {
    renderApp();
    loadSample('Sample: agent run 1');

    const reject = screen.getAllByRole('button', { name: 'Reject' })[1];
    if (reject === undefined) throw new Error('No Reject button rendered.');
    fireEvent.click(reject);

    expect(screen.getAllByRole('button', { name: 'Reject' })[1]?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();
    expect(screen.getByText('Approved 0 · Rejected 1 · Pending 10')).toBeTruthy();
    expect(screen.getByLabelText(/^Comment for the AI agent on hunk 2 of 11 in /)).toBeTruthy();
  });

  it('WIRED-TOGGLE clears a decision when the pressed button is pressed again', () => {
    renderApp();
    loadSample('Sample: agent run 1');

    const approve = screen.getAllByRole('button', { name: 'Approve' })[0];
    if (approve === undefined) throw new Error('No Approve button rendered.');
    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(approve.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('0 of 11 hunks decided')).toBeTruthy();
  });

  it('WIRED-RELOAD starts a fresh review with the new diff hunk ids when another sample loads', () => {
    renderApp();
    loadSample('Sample: agent run 1');
    const approve = screen.getAllByRole('button', { name: 'Approve' })[0];
    if (approve === undefined) throw new Error('No Approve button rendered.');
    fireEvent.click(approve);
    expect(screen.getByText('1 of 11 hunks decided')).toBeTruthy();

    // The review header's Load diff button opens the load dialog, which offers the samples.
    fireEvent.click(screen.getAllByRole('button', { name: 'Load diff' })[0] as HTMLElement);
    const dialogSamples = screen.getAllByRole('button', {
      name: 'Sample: agent run 2, after fixes',
    });
    const sampleTwo = dialogSamples[dialogSamples.length - 1];
    if (sampleTwo === undefined) throw new Error('No sample button rendered.');
    fireEvent.click(sampleTwo);
    // Hunk 1 is byte-identical in sample 2 and holds a decision, so the load asks first.
    fireEvent.click(screen.getByRole('radio', { name: 'Start new review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start new review' }));

    expect(screen.getByRole('heading', { level: 3, name: /^Hunk 1 of 9, / })).toBeTruthy();
    expect(screen.getByText('0 of 9 hunks decided')).toBeTruthy();
    const approveTwo = screen.getAllByRole('button', { name: 'Approve' })[0];
    if (approveTwo === undefined) throw new Error('No Approve button rendered.');
    fireEvent.click(approveTwo);
    expect(screen.getByText('1 of 9 hunks decided')).toBeTruthy();
  });
});
