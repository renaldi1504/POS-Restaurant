/**
 * Bahasa tampilan staf: satu bahasa global untuk semua layar (kasir, admin, dapur, driver).
 * - Perangkat: `pos.lang` di localStorage (layar login memakai ini).
 * - Akun: `users.lang` lewat `PATCH /api/auth/me/lang`; dipakai lagi setiap login (lib/auth.tsx).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang, StaffUser } from '@pos/shared';
import { useToast } from '../components/ui';
import { api, qk } from './api';
import i18n, { isLang, setLang } from './i18n';

/** Bahasa UI aktif (re-render saat berganti). */
export function useLang(): Lang {
  const { i18n: inst } = useTranslation();
  return isLang(inst.language) ? inst.language : 'id';
}

/** Ganti bahasa: langsung di perangkat, lalu simpan ke akun bila sedang login. */
export function useChangeLang(): (lang: Lang) => Promise<void> {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(
    async (lang: Lang) => {
      setLang(lang);
      const me = qc.getQueryData<StaffUser | null>(qk.me);
      if (!me || me.lang === lang) return;
      try {
        const { user } = await api.call('authMeLang', { body: { lang } });
        qc.setQueryData(qk.me, user);
      } catch {
        toast.error(i18n.getFixedT(lang)('langx.saveFailed'));
      }
    },
    [qc, toast],
  );
}
