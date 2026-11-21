import type { ReactNode } from 'react';
import { TopBar } from '../common';

/** Top app bar layar admin. Navigasi antar layar lewat navigation bar bawah / lembar "Lainnya". */
export function AdminBar({
  title,
  subtitle,
  back,
  right,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { label: string; onClick: () => void };
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <TopBar title={title} subtitle={subtitle} back={back} right={right}>
      {children}
    </TopBar>
  );
}
