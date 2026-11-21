import { useTranslation } from 'react-i18next';
import { LangSwitcher } from '../ui';
import { useChangeLang, useLang } from '../../lib/useLang';

/**
 * Pemilih bahasa tampilan (ID / EN / ខ្មែរ / 中文) untuk semua staf: lembar Lainnya & layar login.
 * Saat login, pilihan juga disimpan ke akun (`PATCH /api/auth/me/lang`).
 */
export function LangPicker({ hint }: { hint?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const change = useChangeLang();
  return (
    <div className="flex flex-col gap-2" data-testid="lang-picker">
      <span className="flex items-center justify-between gap-2 text-label-large text-on-surface-variant">
        {t('langx.title')}
      </span>
      <LangSwitcher block label={t('langx.title')} value={lang} onChange={(l) => void change(l)} />
      {hint ? <span className="text-body-medium text-on-surface-variant">{hint}</span> : null}
    </div>
  );
}
