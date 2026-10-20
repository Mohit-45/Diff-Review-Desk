import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within, type RenderResult } from '@testing-library/react';
import { smallDiff } from '../../app/appFixtures';
import { createStorageAdapter, type ReviewStorageAdapter } from '../../storage/adapter';
import { ScriptedArea } from '../../storage/areaFixtures';
import { DEFAULT_PREFS } from '../../storage/validator';
import { App } from '../App';
import type { Clock } from '../clock';
import type { FrameScheduler } from '../frame';
import { immediateFrame } from '../frameFixtures';

export { smallDiff };

export const BANNER = "Progress isn't being saved in this browser. Export your review to keep it.";

export type Areas = {
  readonly local: ScriptedArea;
  readonly session: ScriptedArea;
};

export function newAreas(): Areas {
  return { local: new ScriptedArea(), session: new ScriptedArea() };
}

/** A new adapter over the same areas is what a reload is: the browser keeps the storage. */
export function adapterOver(areas: Areas): ReviewStorageAdapter {
  return createStorageAdapter({ local: areas.local, session: areas.session });
}

/** Remembering diff text is on by default; this says so out loud for journeys that depend on it. */
export function rememberingAdapter(areas: Areas): ReviewStorageAdapter {
  const adapter = adapterOver(areas);
  adapter.setPrefs({ ...DEFAULT_PREFS, rememberDiff: true });
  return adapter;
}

/** A browser whose user turned remember-diff off: only decisions rest in storage. */
export function forgetfulAdapter(areas: Areas): ReviewStorageAdapter {
  const adapter = adapterOver(areas);
  adapter.setPrefs({ ...DEFAULT_PREFS, rememberDiff: false });
  return adapter;
}

export function stubDialogs(): void {
  // jsdom has no modal dialog support. close() fires a close event like the browser does.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

export function resetBrowserState(): void {
  for (const key of Object.keys(window.localStorage)) {
    window.localStorage.removeItem(key);
  }
  window.sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
}

export const FIXED_NOW = '2026-10-20T09:05:00.000Z';

/** A fixed clock keeps exports and saved records deterministic. */
export function fixedClock(iso: string = FIXED_NOW): Clock {
  return () => iso;
}

export function renderApp(
  adapter: ReviewStorageAdapter,
  clock?: Clock,
  frame: FrameScheduler = immediateFrame,
): RenderResult {
  return render(
    <StrictMode>
      <App frame={frame} storage={adapter} {...(clock === undefined ? {} : { clock })} />
    </StrictMode>,
  );
}

export function pasteAndLoad(text: string): void {
  fireEvent.change(screen.getByLabelText('Paste a unified diff'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Load diff' }));
}

export function articles(): HTMLElement[] {
  return screen.getAllByRole('article');
}

export function approveFirst(): void {
  const approve = screen.getAllByRole('button', { name: 'Approve' })[0];
  if (approve === undefined) throw new Error('No Approve button rendered.');
  fireEvent.click(approve);
}

export function statusLine(): string {
  return document.querySelector('main .status-line')?.textContent ?? '';
}

export function openSettings(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Settings/ }));
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog === null) throw new Error('Settings did not open.');
  return dialog;
}

export function toggleSetting(dialog: HTMLElement, name: string): void {
  fireEvent.click(within(dialog).getByRole('checkbox', { name }));
}

export function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
  });
}

export function keysOf(area: ScriptedArea, prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < area.length; index += 1) {
    const key = area.key(index);
    if (key?.startsWith(prefix) === true) keys.push(key);
  }
  return keys;
}
