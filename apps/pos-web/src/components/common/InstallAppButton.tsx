/** Tombol "Pasang aplikasi" (PWA): prompt bawaan di Android, petunjuk langkah di iPhone / browser lain. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, Sheet } from '../ui';
import { isNativeApp } from '../../lib/printer/nativeBle';
import { promptInstall, useInstallState } from '../../lib/install';

export function InstallAppButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const state = useInstallState();
  const [help, setHelp] = useState(false);
  // Sudah di aplikasi iPad (native) / sudah terpasang → tidak perlu tombol pasang.
  if (state === 'installed' || isNativeApp()) return null;
  return (
    <>
      <Button
        variant="tonal"
        icon="install_mobile"
        className={className}
        onClick={() => {
          if (state === 'prompt') void promptInstall();
          else setHelp(true);
        }}
      >
        {t('install.button')}
      </Button>
      <Sheet
        open={help}
        onClose={() => setHelp(false)}
        title={t('install.title')}
        closeLabel={t('common.close')}
      >
        <ol className="flex list-decimal flex-col gap-3 pl-6 text-body-large">
          {(state === 'ios' ? ['ios1', 'ios2', 'ios3'] : ['and1', 'and2', 'and3']).map((k) => (
            <li key={k}>{t(`install.${k}`)}</li>
          ))}
        </ol>
        <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-container-low p-3 text-body-medium">
          <Icon name="info" size={20} className="mt-0.5 shrink-0 text-primary" />
          {t('install.why')}
        </p>
      </Sheet>
    </>
  );
}
