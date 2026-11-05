/**
 * Mistral plugin provider: paste-an-API-key credential entry.
 *
 * The first-party `easycliproxyapi-mistral-provider` plugin accepts a single
 * credential record `{"type":"mistral","api_key":"<key>","base_url":"https://api.mistral.ai/v1"}`
 * (see the plugin's internal/mistral/types.go credentialRecord). The same shape
 * is produced by the browser PKCE sign-in exchange, so a pasted account key and
 * the OAuth-exchanged key coexist as separate auth-dir credentials.
 */

import type { AuthFilesResponse } from '@/types/authFile';

/** Plugin provider key (`mistral`, internal/mistral types.go ProviderID). */
export const MISTRAL_API_KEY_PROVIDER_ID = 'mistral';

/** Mistral API base URL; the plugin rejects any non-standard base_url. */
export const MISTRAL_API_BASE_URL = 'https://api.mistral.ai/v1';

export interface MistralApiKeyCredential {
  type: 'mistral';
  api_key: string;
  base_url: string;
}

/** Normalize a pasted key: trim both ends; inner whitespace signals a copy error. */
export const normalizeMistralApiKey = (key: string): string | null => {
  const trimmed = key.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  return trimmed;
};

export const buildMistralApiKeyCredential = (key: string): MistralApiKeyCredential => ({
  type: 'mistral',
  api_key: key,
  base_url: MISTRAL_API_BASE_URL,
});

/**
 * Auth-file name matching the plugin's own convention (`mistral-<sha256hex20>.json`):
 * re-pasting the same key replaces that credential instead of adding a duplicate.
 */
export const mistralApiKeyFileName = async (key: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `mistral-${fingerprint.slice(0, 20)}.json`;
};

/** Credentials owned by one provider (backend `provider`/`type` fields, case-insensitive). */
export const filterProviderCredentials = (
  files: AuthFilesResponse['files'],
  providerId: string
): AuthFilesResponse['files'] => {
  const target = providerId.toLowerCase();
  return files.filter(
    (file) =>
      file.provider?.toLowerCase() === target || file.type?.toLowerCase() === target
  );
};
