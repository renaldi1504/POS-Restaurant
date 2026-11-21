/** Bot Telegram — status integrasi & cara kerja (pratinjau percakapan: docs/mockups/Telegram.dc.html). */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AdminBar } from '../../components/admin/AdminBar';
import { ErrorBlock, LoadingBlock, Screen, Section } from '../../components/common';
import { Badge } from '../../components/ui';
import { api, qk } from '../../lib/api';

export default function TelegramPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: qk.adminSettings, queryFn: () => api.call('adminSettingsGet') });
  const integ = q.data?.integrations;
  return (
    <Screen testId="telegram-screen">
      <AdminBar
        title={t('admin.telegramBot')}
        back={{ label: t('admin.settings'), onClick: () => navigate('/admin/settings') }}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {integ ? (
          <>
            <Section title={t('tg.status')}>
              <div className="flex items-center justify-between">
                <span>{t('admin.telegramBot')}</span>
                <Badge tone={integ.telegram ? 'primary' : 'warn'}>
                  {integ.telegram ? t('setx.connected') : t('admin.integrationOff')}
                </Badge>
              </div>
              {integ.telegramBotUsername ? (
                <a
                  href={`https://t.me/${integ.telegramBotUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center justify-center rounded-xl bg-primary font-extrabold text-white"
                >
                  @{integ.telegramBotUsername} ›
                </a>
              ) : null}
              <div className="flex items-center justify-between">
                <span>{t('setx.aiAnswers')}</span>
                <Badge tone={integ.gemini && q.data?.settings.ai.enabled ? 'primary' : 'warn'}>
                  {integ.gemini
                    ? q.data?.settings.ai.enabled
                      ? t('admin.integrationOn')
                      : t('tg.aiOff')
                    : t('admin.integrationOff')}
                </Badge>
              </div>
            </Section>
            <Section title={t('tg.how')}>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
                <li>{t('tg.p1')}</li>
                <li>{t('tg.p2')}</li>
                <li>{t('tg.p3')}</li>
                <li>{t('tg.p4')}</li>
              </ul>
            </Section>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
