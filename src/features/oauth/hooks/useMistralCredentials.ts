import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import { getErrorMessage } from '@/utils/helpers';
import { AUTH_FILES_CHANGED_EVENT, notifyAuthFilesChanged } from '@/features/authFiles/authFilesEvents';
import { MISTRAL_API_KEY_PROVIDER_ID, filterProviderCredentials } from '../mistralApiKey';

export interface MistralCredentialItem {
  name: string;
  disabled?: boolean;
}

/**
 * Stored credentials of the Mistral plugin provider (browser sign-in or pasted
 * API key). Refreshes while the login dialog is open and on auth-file change
 * events; discard is a confirmed DELETE /credentials by file name.
 */
export function useMistralCredentials(enabled: boolean) {
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const [items, setItems] = useState<MistralCredentialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await authFilesApi.list();
      if (id !== requestId.current) return;
      setItems(
        filterProviderCredentials(response.files, MISTRAL_API_KEY_PROVIDER_ID).map((file) => ({
          name: file.name,
          disabled: file.disabled,
        }))
      );
    } catch {
      // The list is supplementary: an unreadable backend answer must not break the dialog.
      if (id === requestId.current) setItems([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setItems([]);
      setDeleting(null);
      return;
    }
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(AUTH_FILES_CHANGED_EVENT, listener);
    return () => window.removeEventListener(AUTH_FILES_CHANGED_EVENT, listener);
  }, [enabled, refresh]);

  const remove = useCallback(
    (name: string) => {
      showConfirmation({
        title: t('mistral_api_key.delete_title'),
        message: t('mistral_api_key.delete_confirm', { name }),
        variant: 'danger',
        confirmText: t('mistral_api_key.delete_button'),
        onConfirm: async () => {
          setDeleting(name);
          try {
            await authFilesApi.deleteFile(name);
            showNotification(t('mistral_api_key.delete_success'), 'success');
            setItems((prev) => prev.filter((item) => item.name !== name));
            notifyAuthFilesChanged();
          } catch (err: unknown) {
            const message = getErrorMessage(err);
            showNotification(
              message
                ? `${t('mistral_api_key.delete_failed')}: ${message}`
                : t('mistral_api_key.delete_failed'),
              'error'
            );
          } finally {
            setDeleting(null);
          }
        },
      });
    },
    [showConfirmation, showNotification, t]
  );

  return { items, loading, deleting, refresh, remove };
}
