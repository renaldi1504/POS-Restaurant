/**
 * Chat driver ↔ pelanggan Telegram untuk satu order (layar penuh). Pesan dikirim lewat bot ke chat
 * Telegram pelanggan; balasan pelanggan (teks, foto, lokasi) masuk realtime.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAT_TEMPLATES,
  mapsDirectionsUrl,
  type ChatTemplate,
  type OrderMessageDto,
  type OrderMessagesResponse,
} from '@pos/shared';
import { Icon, IconButton, cn, useToast } from '../ui';
import { LoadingBlock, timeHM } from '../common';
import { api, errorMessage } from '../../lib/api';
import { beep } from '../../lib/sound';
import { useSocketEvent } from '../../lib/socket';

export const chatKey = (orderId: string) => ['chat', orderId] as const;

/** Jumlah pesan masuk yang belum dibaca per order (dihitung dari event realtime). */
export function useUnreadChats() {
  const [unread, setUnread] = useState<Record<string, number>>({});
  useSocketEvent('order.message', ({ message }) => {
    if (message.direction !== 'in') return;
    setUnread((u) => ({ ...u, [message.orderId]: (u[message.orderId] ?? 0) + 1 }));
  });
  const markRead = (orderId: string) => setUnread((u) => ({ ...u, [orderId]: 0 }));
  return { unread, markRead };
}

export function OrderChat({
  orderId,
  title,
  onClose,
}: {
  orderId: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: chatKey(orderId),
    queryFn: () => api.call('orderMessages', { params: { id: orderId } }),
  });
  const add = (m: OrderMessageDto) =>
    qc.setQueryData<OrderMessagesResponse>(chatKey(orderId), (d) =>
      d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d,
    );
  useSocketEvent('order.message', ({ message }) => {
    if (message.orderId !== orderId) return;
    add(message);
    if (message.direction === 'in') beep('order');
  });
  const messages = q.data?.messages ?? [];
  useEffect(() => endRef.current?.scrollIntoView?.({ block: 'end' }), [messages.length]);

  const send = useMutation({
    mutationFn: (body: { text?: string; template?: ChatTemplate }) =>
      api.call('orderMessageSend', { params: { id: orderId }, body }),
    onSuccess: (r, body) => {
      add(r.message);
      if (body.text) setText('');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const photo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.call('orderMessagePhoto', { params: { id: orderId }, body: fd });
    },
    onSuccess: (r) => add(r.message),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const canChat = q.data?.canChat ?? false;
  const busy = send.isPending || photo.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.title')}
      data-testid="order-chat"
      className="fixed inset-0 z-50 flex flex-col bg-surface"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 bg-surface-container px-2">
        <IconButton icon="arrow_back" label={t('common.close')} onClick={onClose} />
        <div className="flex min-w-0 flex-col">
          <b className="truncate text-title-medium">{title}</b>
          <span className="text-label-medium text-on-surface-variant">{t('chat.viaTelegram')}</span>
        </div>
      </header>
      <main className="flex min-h-0 grow flex-col gap-2 overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.data && !canChat ? (
          <p className="rounded-md bg-warning-container p-3 text-body-medium text-on-warning-container">
            {t('chat.noTelegram')}
          </p>
        ) : null}
        {q.data && canChat && !messages.length ? (
          <p className="py-6 text-center text-body-medium text-on-surface-variant">{t('chat.empty')}</p>
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </main>
      {canChat ? (
        <footer className="flex shrink-0 flex-col gap-2 border-t border-outline-variant bg-surface-container-low p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CHAT_TEMPLATES.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => send.mutate({ template: k })}
                className="state-layer h-10 shrink-0 rounded-full border border-outline px-4 text-label-large text-primary disabled:opacity-50"
              >
                {t(`chat.tpl.${k}`)}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate({ text: text.trim() });
            }}
          >
            <IconButton
              icon="photo_camera"
              label={t('chat.photo')}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) photo.mutate(f);
                e.target.value = '';
              }}
            />
            <textarea
              value={text}
              rows={1}
              maxLength={1000}
              aria-label={t('chat.placeholder')}
              placeholder={t('chat.placeholder')}
              onChange={(e) => setText(e.target.value)}
              className="max-h-32 min-h-12 grow resize-none rounded-3xl border border-outline bg-surface-container-lowest px-4 py-3 text-body-large"
            />
            <IconButton
              icon="send"
              label={t('chat.send')}
              type="submit"
              disabled={busy || !text.trim()}
              className="bg-primary text-on-primary"
            />
          </form>
        </footer>
      ) : null}
    </div>
  );
}

function Bubble({ m }: { m: OrderMessageDto }) {
  const { t } = useTranslation();
  const out = m.direction === 'out';
  return (
    <div
      className={cn('flex max-w-[85%] flex-col gap-1', out ? 'self-end items-end' : 'self-start items-start')}
    >
      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl px-3 py-2 text-body-large',
          out
            ? 'bg-primary-container text-on-primary-container'
            : 'bg-surface-container-high text-on-surface',
        )}
      >
        {m.kind === 'photo' && m.photoUrl ? (
          <a href={m.photoUrl} target="_blank" rel="noreferrer">
            <img src={m.photoUrl} alt={t('chat.photo')} className="max-h-72 rounded-lg object-cover" />
          </a>
        ) : null}
        {m.kind === 'location' && m.lat != null && m.lng != null ? (
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <Icon name="location_on" size={20} />
              {t('chat.location')}
            </span>
            <a
              href={mapsDirectionsUrl({ lat: m.lat, lng: m.lng })}
              target="_blank"
              rel="noreferrer"
              className="state-layer flex h-11 items-center justify-center gap-2 rounded-full bg-tertiary px-4 text-label-large text-on-tertiary"
            >
              <Icon name="navigation" size={20} />
              {t('driver.navigate')}
            </a>
          </div>
        ) : null}
        {m.template ? (
          <span>{t(`chat.tpl.${m.template}`)}</span>
        ) : m.text ? (
          <span className="whitespace-pre-wrap">{m.text}</span>
        ) : null}
      </div>
      <span className="px-1 text-label-small text-on-surface-variant">
        {out && m.staff ? `${m.staff.name} · ` : ''}
        {timeHM(m.createdAt)}
      </span>
    </div>
  );
}
