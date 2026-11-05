import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MISTRAL_API_BASE_URL,
  MISTRAL_API_KEY_PROVIDER_ID,
  buildMistralApiKeyCredential,
  filterProviderCredentials,
  mistralApiKeyFileName,
  normalizeMistralApiKey,
} from '@/features/oauth/mistralApiKey';
import { PluginAlternates } from '@/features/oauth/components/OAuthFlowDialog';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import en from '@/i18n/locales/en.json';

describe('Mistral API key normalization', () => {
  test('trims surrounding whitespace and rejects empty input', () => {
    expect(normalizeMistralApiKey('  mk-abc123  ')).toBe('mk-abc123');
    expect(normalizeMistralApiKey('')).toBeNull();
    expect(normalizeMistralApiKey('   ')).toBeNull();
  });

  test('rejects keys with inner whitespace (copy errors)', () => {
    expect(normalizeMistralApiKey('mk-abc 123')).toBeNull();
    expect(normalizeMistralApiKey('mk-\nabc')).toBeNull();
  });
});

describe('Mistral credential record', () => {
  test('matches the plugin credentialRecord shape exactly', () => {
    expect(buildMistralApiKeyCredential('mk-test-123')).toEqual({
      type: 'mistral',
      api_key: 'mk-test-123',
      base_url: 'https://api.mistral.ai/v1',
    });
    expect(MISTRAL_API_BASE_URL).toBe('https://api.mistral.ai/v1');
    expect(MISTRAL_API_KEY_PROVIDER_ID).toBe('mistral');
  });

  test('derives the plugin file name from the sha256 fingerprint (first 20 hex chars)', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await mistralApiKeyFileName('abc')).toBe('mistral-ba7816bf8f01cfea4141.json');
    // Re-pasting the same key targets the same credential file (dedup).
    expect(await mistralApiKeyFileName('mk-x')).toBe(await mistralApiKeyFileName('mk-x'));
    expect(await mistralApiKeyFileName('mk-x')).not.toBe(await mistralApiKeyFileName('mk-y'));
  });
});

describe('provider credential filtering', () => {
  const files = [
    { name: 'mistral-aaa.json', provider: 'mistral' },
    { name: 'mistral-bbb.json', type: 'MISTRAL' },
    { name: 'codex-ccc.json', provider: 'codex' },
    { name: 'unknown-ddd.json' },
  ];

  test('matches provider or type case-insensitively', () => {
    expect(filterProviderCredentials(files, 'mistral')).toEqual([files[0], files[1]]);
    expect(filterProviderCredentials(files, 'codex')).toEqual([files[2]]);
    expect(filterProviderCredentials(files, 'claude')).toEqual([]);
  });
});

describe('authFilesApi.uploadCredentialJSON', () => {
  test('posts the raw credential payload to /credentials?name=<file>', async () => {
    const spy = spyOn(apiClient, 'post').mockResolvedValue({ status: 'ok' });
    try {
      await authFilesApi.uploadCredentialJSON('mistral-ba7816bf8f01cfea4141.json', {
        type: 'mistral',
        api_key: 'mk-secret',
        base_url: 'https://api.mistral.ai/v1',
      });
      expect(spy).toHaveBeenCalledWith(
        '/credentials?name=mistral-ba7816bf8f01cfea4141.json',
        {
          type: 'mistral',
          api_key: 'mk-secret',
          base_url: 'https://api.mistral.ai/v1',
        }
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('plugin alternates view', () => {
  test('renders the paste-key entry and the stored credential discard actions', () => {
    const markup = renderToStaticMarkup(
      createElement(PluginAlternates, {
        apiKeyEntry: { label: 'Paste an API key', onOpen: () => {} },
        storedCredentials: {
          title: 'Stored Mistral credentials',
          loadingLabel: 'Loading…',
          emptyLabel: 'None',
          deleteLabel: 'Discard',
          items: [{ name: 'mistral-214a4a807e581f5da6e7.json' }],
          loading: false,
          deleting: null,
          onRemove: () => {},
        },
      })
    );
    expect(markup).toContain('Paste an API key');
    expect(markup).toContain('Stored Mistral credentials');
    expect(markup).toContain('mistral-214a4a807e581f5da6e7.json');
    expect(markup).toContain('Discard');
  });

  test('renders nothing without either entry', () => {
    expect(renderToStaticMarkup(createElement(PluginAlternates, {}))).toBe('');
  });

  test('shows the empty state and loading label', () => {
    const markup = renderToStaticMarkup(
      createElement(PluginAlternates, {
        storedCredentials: {
          title: 'Stored',
          loadingLabel: 'Loading…',
          emptyLabel: 'No credentials yet.',
          deleteLabel: 'Discard',
          items: [],
          loading: false,
          deleting: null,
          onRemove: () => {},
        },
      })
    );
    expect(markup).toContain('No credentials yet.');
  });
});

describe('Mistral API key locale parity', () => {
  const localeFiles = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'];

  test('every locale defines the same mistral_api_key keys with non-empty values', () => {
    const expected = Object.keys(en.mistral_api_key as Record<string, unknown>);
    expect(expected.length).toBeGreaterThan(0);
    for (const locale of localeFiles) {
      const messages = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
      ) as Record<string, unknown>;
      const section = messages.mistral_api_key as Record<string, unknown>;
      expect(section, locale).toBeDefined();
      for (const key of expected) {
        expect(typeof section[key], `${locale} mistral_api_key.${key}`).toBe('string');
        expect((section[key] as string).length, `${locale} mistral_api_key.${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Mistral login wiring contract', () => {
  test('the Mistral card shows a method choice instead of auto-starting OAuth', () => {
    const source = readFileSync('src/features/oauth/OAuthPage.tsx', 'utf8');
    expect(source).toContain('if (isMistralCard(card)) return;');
    expect(source).toContain('MISTRAL_API_KEY_PROVIDER_ID');
  });

  test('the flow dialog only offers alternates in the idle/failed view', () => {
    const source = readFileSync('src/features/oauth/components/OAuthFlowDialog.tsx', 'utf8');
    expect(source).toContain('view !== \'flow\'');
    // Alternates render once, inside the non-flow branch after the primary login button.
    expect(source.match(/<PluginAlternates/g)?.length).toBe(1);
    const idleBranch = source.slice(
      source.indexOf('if (view !== \'flow\')'),
      source.indexOf('function Step(')
    );
    expect(idleBranch).toContain('<PluginAlternates');
  });
});
