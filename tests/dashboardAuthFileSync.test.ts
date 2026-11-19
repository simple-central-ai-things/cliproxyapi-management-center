import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/features/dashboard/hooks/useDashboardOverview.ts', 'utf8');

function fakeEventTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, handler: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler);
    },
    emit: (type: string) => {
      listeners.get(type)?.forEach((handler) => handler());
    },
    get size() {
      return listeners.size;
    },
  };
}

function harness(connected: boolean) {
  let effectFn: (() => (() => void) | void) | undefined;
  let effectDeps: unknown[] | undefined;
  let loads = 0;
  const window = fakeEventTarget();
  const document = { visibilityState: 'visible', ...fakeEventTarget() };
  const env = {
    connected,
    loadAuthFiles: () => {
      loads += 1;
    },
    useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
      effectFn = fn;
      effectDeps = deps;
    },
    window,
    document,
  };
  const start = source.indexOf('  // A mounted dashboard is not the page where credentials mutate;');
  const end = source.indexOf('  const refresh = useCallback(', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  const js = ts.transpileModule(block, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function(...Object.keys(env), js)(...Object.values(env));
  const cleanup = (effectFn as () => (() => void))();
  return {
    cleanup,
    window,
    document,
    get loads() {
      return loads;
    },
    get deps() {
      return effectDeps;
    },
  };
}

describe('dashboard auth-file sync', () => {
  test('refreshes the auth-file list when the tab becomes visible again', () => {
    const h = harness(true);
    expect(h.deps).toEqual([true, expect.any(Function)]);
    h.document.visibilityState = 'hidden';
    h.document.emit('visibilitychange');
    expect(h.loads).toBe(0);
    h.document.visibilityState = 'visible';
    h.document.emit('visibilitychange');
    expect(h.loads).toBe(1);
    h.window.emit('focus');
    expect(h.loads).toBe(2);
  });

  test('registers nothing while disconnected', () => {
    const h = harness(false);
    expect(h.window.size).toBe(0);
    expect(h.document.size).toBe(0);
  });

  test('cleanup removes both listeners', () => {
    const h = harness(true);
    h.cleanup();
    h.document.visibilityState = 'visible';
    h.document.emit('visibilitychange');
    h.window.emit('focus');
    expect(h.loads).toBe(0);
  });
});
