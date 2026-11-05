import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { IconLoader2 } from '@/components/ui/icons';
import type { MistralApiKeyImportState } from '../hooks/useMistralApiKeyImport';
import { DialogTitle, SuccessMark, type DialogHeading } from './OAuthFlowDialog';
import dialogStyles from './OAuthFlowDialog.module.scss';
import styles from './MistralApiKeyDialog.module.scss';

export interface MistralApiKeyDialogProps {
  open: boolean;
  heading: DialogHeading;
  state: MistralApiKeyImportState;
  onKeyChange: (value: string) => void;
  onImport: () => void;
  onImportAnother: () => void;
  onViewAuthFiles: () => void;
  onClose: () => void;
}

/**
 * Paste-a-Mistral-API-key dialog: stores the key as a plugin credential file
 * alongside the browser sign-in credential. Mirrors VertexImportDialog.
 */
export function MistralApiKeyDialog({
  open,
  heading,
  state,
  onKeyChange,
  onImport,
  onImportAnother,
  onViewAuthFiles,
  onClose,
}: MistralApiKeyDialogProps) {
  const { t } = useTranslation();
  const hasKey = state.key.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      className={dialogStyles.dialog}
      title={<DialogTitle {...heading} />}
    >
      <div className={dialogStyles.view} key={state.result ? 'result' : 'form'}>
        {state.result ? (
          <div className={dialogStyles.result} role="status">
            <SuccessMark />
            <div className={dialogStyles.resultTitle}>{t('mistral_api_key.result_title')}</div>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>{t('mistral_api_key.result_file')}</dt>
                <dd>{state.result.authFile}</dd>
              </div>
            </dl>
            <div className={dialogStyles.resultActions}>
              <button type="button" className={dialogStyles.secondary} onClick={onViewAuthFiles}>
                {t('auth_login.view_auth_files')}
              </button>
              <button type="button" className={dialogStyles.primary} onClick={onImportAnother}>
                {t('mistral_api_key.import_another')}
              </button>
            </div>
          </div>
        ) : (
          <div className={dialogStyles.stack}>
            <p className={dialogStyles.hint}>{t('mistral_api_key.description')}</p>

            <Input
              label={t('mistral_api_key.key_label')}
              hint={t('mistral_api_key.key_hint')}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              placeholder={t('mistral_api_key.key_placeholder')}
              value={state.key}
              onChange={(event) => onKeyChange(event.target.value)}
            />

            {state.error && (
              <div className={dialogStyles.alert} role="alert">
                {state.error}
              </div>
            )}

            <div>
              <button
                type="button"
                className={dialogStyles.primary}
                onClick={onImport}
                disabled={!hasKey || state.loading}
              >
                {state.loading && (
                  <IconLoader2 size={14} className={dialogStyles.spinning} aria-hidden="true" />
                )}
                {t('mistral_api_key.import_button')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
