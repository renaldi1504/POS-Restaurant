import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '../components/ui';

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
}

/** Render dengan QueryClient baru + Toast + router memori. `path` = pola route, `route` = URL awal. */
export function renderApp(ui: ReactElement, { route = '/', path = '*', qc = newQueryClient() }: { route?: string; path?: string; qc?: QueryClient } = {}) {
  const utils = render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="*" element={<div data-testid="other-route" />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}
