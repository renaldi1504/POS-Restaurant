import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { hasAnyPermission, type PermissionKey, type StaffUser } from '@pos/shared';
import { api, isApiError, qk, UNAUTHORIZED_EVENT } from './api';
import { setLang, storedLang } from './i18n';
import { resetNavSession } from './navSession';
import { disconnectSocket, reconnectSocket } from './socket';

/** Halaman awal sesuai permission (routing berdasarkan role). */
export function homePathFor(perms: readonly PermissionKey[]): string {
  if (perms.includes('order.create')) return '/kasir';
  if (perms.includes('kitchen.view')) return '/dapur';
  if (perms.includes('driver.deliver')) return '/driver';
  if (perms.includes('reports.view') || perms.includes('settings.manage')) return '/admin';
  return '/login';
}

/** User staf yang login (null = belum login). */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        const user = (await api.call('authMe')).user;
        // Sesi yang berlanjut di perangkat yang belum pernah memilih bahasa → pakai bahasa akun.
        if (!storedLang()) setLang(user.lang);
        return user;
      } catch (e) {
        if (isApiError(e) && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useAuthActions() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return {
    /** Setelah POST /auth/pin berhasil. */
    onLoggedIn(user: StaffUser) {
      qc.setQueryData(qk.me, user);
      resetNavSession();
      // Bahasa milik akun (dipilih sendiri di Lainnya, atau default dari admin) berlaku setiap login.
      setLang(user.lang);
      reconnectSocket();
      navigate(homePathFor(user.permissions), { replace: true });
    },
    async logout() {
      try {
        await api.call('authLogout');
      } finally {
        disconnectSocket();
        resetNavSession();
        qc.clear();
        navigate('/login', { replace: true });
      }
    },
  };
}

/** Redirect ke /login saat API membalas 401 di tengah sesi. */
export function UnauthorizedListener() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    const fn = () => {
      qc.setQueryData(qk.me, null);
      navigate('/login', { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, fn);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, fn);
  }, [qc, navigate]);
  return null;
}

/** Bungkus route yang butuh login (+ salah satu permission). */
export function RequireAuth({ any, children }: { any?: PermissionKey[]; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <div className="p-6 text-on-surface-variant">…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (any && any.length && !hasAnyPermission(me.permissions, any))
    return <Navigate to={homePathFor(me.permissions)} replace />;
  return <>{children}</>;
}
