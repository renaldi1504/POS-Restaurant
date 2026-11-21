import { useState, type ReactNode } from 'react';
import { AppMenuButton, AppMenuSheet, TopBar } from '../common';

/** Header layar admin: judul + tombol menu ☰ (navigasi antar layar admin). */
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <TopBar
        title={title}
        subtitle={subtitle}
        back={back}
        right={
          <>
            {right}
            <AppMenuButton onClick={() => setOpen(true)} />
          </>
        }
      >
        {children}
      </TopBar>
      <AppMenuSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
