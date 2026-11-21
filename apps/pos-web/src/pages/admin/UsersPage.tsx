/** Pengguna & role — acuan: docs/mockups/Users.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  LANGS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type AdminUserDto,
  type Lang,
  type PermissionKey,
  type RoleDto,
} from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';
import { AdminBar } from '../../components/admin/AdminBar';
import {
  ExtendedFab,
  ConfirmSheet,
  ErrorBlock,
  LoadingBlock,
  Screen,
  SelectField,
  Switch,
  Tabs,
  TextField,
} from '../../components/common';
import { Button, Icon, Sheet, cn, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';

const UQK = ['admin', 'users'] as const;
const RQK = ['admin', 'roles'] as const;

export function roleColors(name: string): { av: string; badge: string } {
  const n = name.toLowerCase();
  if (n.includes('owner') || n.includes('admin'))
    return {
      av: 'bg-inverse-surface text-inverse-on-surface',
      badge: 'bg-inverse-surface text-inverse-on-surface',
    };
  if (n.includes('kasir'))
    return { av: 'bg-primary text-on-primary', badge: 'bg-secondary-container text-on-secondary-container' };
  if (n.includes('dapur'))
    return { av: 'bg-warning text-on-warning', badge: 'bg-warning-container text-on-warning-container' };
  if (n.includes('driver'))
    return { av: 'bg-tertiary text-on-tertiary', badge: 'bg-tertiary-container text-on-tertiary-container' };
  if (n.includes('bot'))
    return { av: 'bg-tertiary text-on-tertiary', badge: 'bg-tertiary-container text-on-tertiary-container' };
  return { av: 'bg-on-surface-variant text-surface', badge: 'bg-surface-container-high text-on-surface' };
}
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

interface UserForm {
  id?: number;
  name: string;
  roleId: number | null;
  lang: Lang;
  pin: string;
  active: boolean;
  locked: boolean;
}

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const users = useQuery({ queryKey: UQK, queryFn: () => api.call('adminUsersList') });
  const roles = useQuery({ queryKey: RQK, queryFn: () => api.call('adminRolesList') });
  const [uf, setUf] = useState<UserForm | null>(null);
  const [rf, setRf] = useState<{
    id?: number;
    name: string;
    permissions: PermissionKey[];
    system: boolean;
    userCount: number;
  } | null>(null);
  const [delRole, setDelRole] = useState(false);
  const permLang = i18n.language === 'id' ? 'id' : 'en';
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: UQK });
    void qc.invalidateQueries({ queryKey: RQK });
    void qc.invalidateQueries({ queryKey: qk.loginUsers });
  };

  const saveUser = useMutation({
    mutationFn: (f: UserForm) =>
      f.id
        ? api.call('adminUserUpdate', {
            params: { id: f.id },
            body: {
              name: f.name.trim(),
              roleId: f.roleId!,
              lang: f.lang,
              active: f.active,
              ...(f.pin ? { pin: f.pin } : {}),
            },
          })
        : api.call('adminUserCreate', {
            body: { name: f.name.trim(), roleId: f.roleId!, lang: f.lang, active: f.active, pin: f.pin },
          }),
    onSuccess: () => {
      setUf(null);
      refresh();
      toast.success(t('userx.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const unlock = useMutation({
    mutationFn: (id: number) => api.call('adminUserUpdate', { params: { id }, body: { unlock: true } }),
    onSuccess: () => {
      refresh();
      setUf((f) => (f ? { ...f, locked: false } : f));
      toast.success(t('userx.unlocked'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const saveRole = useMutation({
    mutationFn: (f: NonNullable<typeof rf>) =>
      f.id
        ? api.call('adminRoleUpdate', {
            params: { id: f.id },
            body: { name: f.name.trim(), permissions: f.permissions },
          })
        : api.call('adminRoleCreate', { body: { name: f.name.trim(), permissions: f.permissions } }),
    onSuccess: () => {
      setRf(null);
      refresh();
      toast.success(t('userx.roleSaved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const removeRole = useMutation({
    mutationFn: (id: number) => api.call('adminRoleDelete', { params: { id } }),
    onSuccess: () => {
      setDelRole(false);
      setRf(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const userInfo = (u: AdminUserDto) => {
    if (u.system) return t('userx.system');
    const parts = [u.active ? t('admin.active') : t('userx.inactive')];
    if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) parts.push(t('userx.locked'));
    if (u.lang !== 'id')
      parts.push(`${t('common.language').toLowerCase()}: ${dictionaries[u.lang].lang[u.lang]}`);
    return parts.join(' · ');
  };
  const pinValid = (p: string, required: boolean) =>
    required ? /^\d{4}$/.test(p) : p === '' || /^\d{4}$/.test(p);

  return (
    <Screen testId="users-screen">
      <AdminBar
        title={t('admin.users')}
        back={{ label: t('admin.settings'), onClick: () => navigate('/admin/settings') }}
      >
        <Tabs
          label={t('admin.users')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'users', label: `${t('userx.users')} (${users.data?.users.length ?? 0})` },
            { value: 'roles', label: t('userx.rolesTab') },
          ]}
        />
      </AdminBar>
      <main className="flex min-h-0 grow flex-col gap-2 overflow-y-auto px-4 pb-24 pt-3">
        {tab === 'users' ? (
          <>
            {users.isLoading ? <LoadingBlock /> : null}
            {users.isError ? <ErrorBlock error={users.error} onRetry={() => void users.refetch()} /> : null}
            {users.data?.users.map((u) => {
              const c = roleColors(u.role.name);
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={u.system}
                  onClick={() =>
                    setUf({
                      id: u.id,
                      name: u.name,
                      roleId: u.role.id,
                      lang: u.lang,
                      pin: '',
                      active: u.active,
                      locked: !!u.lockedUntil && new Date(u.lockedUntil) > new Date(),
                    })
                  }
                  className={cn(
                    'state-layer flex min-h-[72px] shrink-0 items-center gap-3 rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-2 text-left disabled:cursor-default',
                    !u.active && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full text-label-large',
                      c.av,
                    )}
                  >
                    {initials(u.name)}
                  </span>
                  <span className="flex min-w-0 grow flex-col gap-[3px]">
                    <b className="text-title-medium">{u.name}</b>
                    <span className="text-body-medium text-on-surface-variant">{userInfo(u)}</span>
                  </span>
                  <span className={cn('shrink-0 rounded-sm px-2 py-1 text-label-medium', c.badge)}>
                    {u.role.name}
                  </span>
                </button>
              );
            })}
            <span className="px-0.5 py-1 text-label-medium text-on-surface-variant">{t('userx.hint')}</span>
          </>
        ) : (
          <>
            {roles.isLoading ? <LoadingBlock /> : null}
            {roles.data?.roles.map((r: RoleDto) => {
              const c = roleColors(r.name);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setRf({
                      id: r.id,
                      name: r.name,
                      permissions: r.permissions,
                      system: r.system,
                      userCount: r.userCount,
                    })
                  }
                  className="state-layer flex shrink-0 flex-col gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest p-4 text-left"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className={cn('rounded-sm px-2.5 py-1 text-label-medium', c.badge)}>{r.name}</span>
                    <span className="text-label-medium text-on-surface-variant">
                      {t('userx.userCount', { count: r.userCount })}
                    </span>
                  </div>
                  {PERMISSION_KEYS.map((k) => {
                    const yes = r.permissions.includes(k);
                    if (!yes && r.permissions.length > 8) return null;
                    return (
                      <div key={k} className="flex items-center gap-2 text-body-medium">
                        <Icon
                          name={yes ? 'check_circle' : 'remove'}
                          filled={yes}
                          size={20}
                          className={yes ? 'text-primary' : 'text-outline'}
                        />
                        <span className={yes ? 'text-on-surface' : 'text-on-surface-variant'}>
                          {PERMISSION_LABELS[k][permLang]}
                        </span>
                      </div>
                    );
                  })}
                </button>
              );
            })}
          </>
        )}
      </main>
      <ExtendedFab
        label={tab === 'users' ? t('userx.addUser') : t('userx.addRole')}
        onClick={() =>
          tab === 'users'
            ? setUf({
                name: '',
                roleId: roles.data?.roles.find((r) => !r.system || r.name === 'Kasir')?.id ?? null,
                lang: 'id',
                pin: '',
                active: true,
                locked: false,
              })
            : setRf({ name: '', permissions: [], system: false, userCount: 0 })
        }
      />

      <Sheet
        open={!!uf}
        onClose={() => setUf(null)}
        title={uf?.id ? t('userx.editUser') : t('userx.addUser')}
        closeLabel={t('common.close')}
        tablet="side"
        footer={
          <Button
            block
            disabled={!uf || !uf.name.trim() || !uf.roleId || !pinValid(uf.pin, !uf.id)}
            loading={saveUser.isPending}
            onClick={() => uf && saveUser.mutate(uf)}
          >
            {t('common.save')}
          </Button>
        }
      >
        {uf ? (
          <div className="flex flex-col gap-3">
            <TextField
              label={t('common.name')}
              value={uf.name}
              maxLength={50}
              onChange={(e) => setUf({ ...uf, name: e.target.value })}
            />
            <SelectField
              label={t('admin.role')}
              value={uf.roleId ?? ''}
              onChange={(e) => setUf({ ...uf, roleId: Number(e.target.value) })}
            >
              {roles.data?.roles
                .filter((r) => r.name !== 'Bot Telegram')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </SelectField>
            <SelectField
              label={t('common.language')}
              value={uf.lang}
              onChange={(e) => setUf({ ...uf, lang: e.target.value as Lang })}
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {dictionaries[l].lang[l]}
                </option>
              ))}
            </SelectField>
            <TextField
              label={uf.id ? t('admin.resetPin') : t('admin.pin')}
              hint={uf.id ? `(${t('userx.pinKeep')})` : undefined}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={uf.pin}
              onChange={(e) => setUf({ ...uf, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              error={uf.pin && !/^\d{4}$/.test(uf.pin) ? t('userx.pin4') : null}
            />
            <Switch
              checked={uf.active}
              onChange={(v) => setUf({ ...uf, active: v })}
              label={t('admin.active')}
              description={t('userx.activeHint')}
            />
            {uf.id && uf.locked ? (
              <Button variant="warning" loading={unlock.isPending} onClick={() => unlock.mutate(uf.id!)}>
                {t('admin.unlock')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <Sheet
        open={!!rf}
        onClose={() => setRf(null)}
        title={rf?.id ? t('userx.editRole') : t('userx.addRole')}
        closeLabel={t('common.close')}
        tablet="side"
        footer={
          <div className="flex gap-2">
            {rf?.id && !rf.system ? (
              <Button
                variant="outlined"
                className="text-error"
                disabled={rf.userCount > 0}
                onClick={() => setDelRole(true)}
              >
                {t('common.delete')}
              </Button>
            ) : null}
            <Button
              className="grow"
              disabled={!rf?.name.trim()}
              loading={saveRole.isPending}
              onClick={() => rf && saveRole.mutate(rf)}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {rf ? (
          <div className="flex flex-col gap-2">
            <TextField
              label={t('common.name')}
              value={rf.name}
              disabled={rf.system}
              onChange={(e) => setRf({ ...rf, name: e.target.value })}
            />
            <b className="mt-1">{t('admin.permissions')}</b>
            {PERMISSION_KEYS.map((k) => (
              <Switch
                key={k}
                checked={rf.permissions.includes(k)}
                onChange={(v) =>
                  setRf({
                    ...rf,
                    permissions: v ? [...rf.permissions, k] : rf.permissions.filter((x) => x !== k),
                  })
                }
                label={PERMISSION_LABELS[k][permLang]}
                description={k}
              />
            ))}
          </div>
        ) : null}
      </Sheet>
      <ConfirmSheet
        open={delRole}
        title={t('userx.deleteRole')}
        message={rf?.name}
        confirmLabel={t('common.delete')}
        danger
        loading={removeRole.isPending}
        onClose={() => setDelRole(false)}
        onConfirm={() => rf?.id && removeRole.mutate(rf.id)}
      />
    </Screen>
  );
}
