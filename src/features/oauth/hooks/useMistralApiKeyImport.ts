import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import { getErrorMessage } from '@/utils/helpers';
import { notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import {
  buildMistralApiKeyCredential,
  mistralApiKeyFileName,
  normalizeMistralApiKey,
} from '../mistralApiKey';

export interface MistralApiKeyImportState {
  key: string;
  loading: boolean;
  error?: string;
  result?: { authFile: string };
}

/**
 * Paste-a-Mistral-API-key import: builds the plugin credential record and stores it
 * through POST /credentials?name=mistral-<hash>.json (raw JSON upload path).
 * Mirrors useVertexImport.
 */
export function useMistralApiKeyImport(options: {
  /** The dialog is open: result is shown inline, no toast; toast only when closed. */
  isFocused: () => boolean;
  onCredentialAdded: () => void;
}) {
  const { isFocused, onCredentialAdded } = options;
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [state, setState] = useState<MistralApiKeyImportState>({ key: '', loading: false });

  const setKey = (key: string) =>
    setState((prev) => ({ ...prev, key, error: undefined, result: undefined }));

  const importCredential = async () => {
    const apiKey = normalizeMistralApiKey(state.key);
    if (!apiKey) {
      setState((prev) => ({ ...prev, error: t('mistral_api_key.key_required') }));
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const name = await mistralApiKeyFileName(apiKey);
      await authFilesApi.uploadCredentialJSON(name, buildMistralApiKeyCredential(apiKey));
      setState((prev) => ({ ...prev, loading: false, result: { authFile: name } }));
      notifyAuthFilesChanged();
      onCredentialAdded();
      if (!isFocused()) showNotification(t('mistral_api_key.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed'),
      }));
      if (!isFocused()) {
        showNotification(
          message
            ? `${t('notification.upload_failed')}: ${message}`
            : t('notification.upload_failed'),
          'error'
        );
      }
    }
  };

  /** After a successful import, add another: clear key and result. */
  const resetForAnother = () => setState({ key: '', loading: false });

  return { state, setKey, importCredential, resetForAnother };
}
