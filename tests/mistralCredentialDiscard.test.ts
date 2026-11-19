import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/features/oauth/hooks/useMistralCredentials.ts', 'utf8');

function harness() {
  let confirmation: { onConfirm: () => Promise<void> } | undefined;
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const deleteCalls: unknown[][] = [];
  const clearQuotaCalls: unknown[][] = [];
  let notifications = 0;
  let changed = 0;
  let deleting: string | null = null;
  let items: Array<{ name: string }> = [{ name: 'one.json' }, { name: 'two.json' }];
  const env = {
    showConfirmation: (options: { onConfirm: () => Promise<void> }) => {
      confirmation = options;
    },
    showNotification: () => {
      notifications += 1;
    },
    t: (key: string) => key,
    setDeleting: (value: string | null) => {
      deleting = value;
    },
    setItems: (update: unknown) => {
      items = typeof update === 'function' ? (update as (prev: typeof items) => typeof items)(items) : update;
    },
    notifyAuthFilesChanged: () => {
      changed += 1;
    },
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : ''),
    authFilesApi: {
      deleteFile: (name: string) => {
        deleteCalls.push([name]);
        return new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
      },
    },
    useQuotaStore: {
      getState: () => ({
        clearQuotaCache: (names?: string[]) => {
          clearQuotaCalls.push([names]);
        },
      }),
    },
    useCallback: (fn: unknown) => fn,
  };
  const start = source.indexOf('  const remove = useCallback(');
  const end = source.indexOf('  return { items, loading, deleting, refresh, remove };');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  const js = ts.transpileModule(`${block}\nreturn { remove };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { remove } = new Function(...Object.keys(env), js)(...Object.values(env));
  return {
    remove,
    confirm: () => confirmation?.onConfirm(),
    resolve: (value: unknown) => resolve(value),
    reject: (error: Error) => reject(error),
    get deleting() {
      return deleting;
    },
    get items() {
      return items;
    },
    get notifications() {
      return notifications;
    },
    get changed() {
      return changed;
    },
    get deleteCalls() {
      return deleteCalls;
    },
    get clearQuotaCalls() {
      return clearQuotaCalls;
    },
  };
}

describe('mistral stored-credential discard', () => {
  test('a confirmed discard clears the quota cache for the removed file', async () => {
    const h = harness();
    h.remove('one.json');
    expect(h.deleteCalls).toHaveLength(0);
    const pending = h.confirm();
    h.resolve({ status: 'ok' });
    await pending;
    expect(h.deleteCalls).toEqual([['one.json']]);
    expect(h.clearQuotaCalls).toEqual([[['one.json']]]);
    expect(h.items).toEqual([{ name: 'two.json' }]);
    expect(h.notifications).toBe(1);
    expect(h.changed).toBe(1);
    expect(h.deleting).toBeNull();
  });

  test('a failed discard keeps the quota cache intact', async () => {
    const h = harness();
    h.remove('one.json');
    const pending = h.confirm();
    h.reject(new Error('boom'));
    await pending;
    expect(h.clearQuotaCalls).toHaveLength(0);
    expect(h.items).toEqual([{ name: 'one.json' }, { name: 'two.json' }]);
    expect(h.notifications).toBe(1);
    expect(h.deleting).toBeNull();
  });
});
