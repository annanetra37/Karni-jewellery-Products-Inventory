'use client';
import { useState } from 'react';
import { BirthdayPicker } from './BirthdayPicker';

/** BirthdayPicker wired into a plain HTML form via a hidden input. */
export function BirthdayField({ name, defaultValue = '' }: { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <BirthdayPicker value={value} onChange={setValue} />
    </>
  );
}
