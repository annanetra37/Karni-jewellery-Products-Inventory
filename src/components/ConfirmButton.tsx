'use client';

import type { ReactNode } from 'react';

/**
 * A submit button that asks for confirmation before letting the form submit.
 * Drop it into any `<form action={serverAction}>` in place of a plain submit
 * button — if the user cancels the browser confirm, the submit is prevented.
 */
export function ConfirmButton({ message, className, children }: {
  message?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => { if (!window.confirm(message || 'Are you sure?')) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
