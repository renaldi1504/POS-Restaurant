/** Bot Telegram — status integrasi & cara kerja (pratinjau percakapan: docs/mockups/Telegram.dc.html). */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AdminBar } from '../../components/admin/AdminBar';
import { ErrorBlock, LoadingBlock, Screen, Section, TextField } from '../../components/common';
import { Badge, Button, Icon, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';

export default function TelegramPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: qk.adminSettings, queryFn: () => api.call('adminSettingsGet') });
  const integ = q.data?.integrations;
  const toast = useToast();
  const [question, setQuestion] = useState('');
  const test = useMutation({
    mutationFn: () => api.call('adminAiTest', { body: { question: question.trim() || t('tg.testPh') } }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const r = test.data;
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
                  className="state-layer flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-label-large text-on-primary"
                >
                  <Icon name="send" size={20} />@{integ.telegramBotUsername}
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
            <Section title={t('tg.testTitle')}>
              <TextField
                label={t('tg.testPh')}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button size="md" icon="smart_toy" loading={test.isPending} onClick={() => test.mutate()}>
                {t('tg.testBtn')}
              </Button>
              {r ? (
                <div
                  className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3"
                  data-testid="ai-test-result"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">GEMINI_API_KEY</span>
                    <Badge tone={r.keySet ? 'primary' : 'warn'}>
                      {r.keySet ? t('tg.testKeyOk') : t('tg.testKeyMissing')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>{t('tg.testEnabled')}</span>
                    <Badge tone={r.aiEnabled ? 'primary' : 'warn'}>
                      {r.aiEnabled ? t('admin.integrationOn') : t('tg.aiOff')}
                    </Badge>
                  </div>
                  <span className="text-label-medium text-on-surface-variant">
                    {r.model} · {r.reason} · {r.lang}
                  </span>
                  <b className="text-label-large">{t('tg.testResult')}</b>
                  <p className="whitespace-pre-wrap text-body-medium">{r.answer}</p>
                  {r.forwarded ? (
                    <span className="text-label-medium text-warning">{t('tg.testForwarded')}</span>
                  ) : null}
                  {r.error ? (
                    <div className="rounded-sm bg-error-container p-2 text-on-error-container">
                      <b className="text-label-large">{t('tg.testError')}</b>
                      <p className="break-words text-label-medium">{r.error}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Section>
            <Section title={t('tg.how')}>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-medium">
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
