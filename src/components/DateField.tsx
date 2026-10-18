import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDisplayDate, parseDisplayDate } from '../utils/dateFormat';

type DateFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

// Width/flex utilities belong on the wrapper so the field sizes exactly like the native input it replaces.
const LAYOUT = /^(?:w-|min-w-|max-w-|flex-|grow|shrink|basis-|col-span-|self-|order-)/;

/**
 * Date input that shows and accepts DD-MMM-YYYY (16-Oct-2026) regardless of the browser locale, with the
 * native calendar as a picker. The value and onChange event stay ISO (YYYY-MM-DD), so existing
 * `e.target.value` handlers keep working unchanged.
 */
export function DateField({ value = '', onChange, className = '', min, max, name, disabled, required, readOnly, ...rest }: DateFieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(null); setInvalid(false); }, [value]);

  const classes = className.split(/\s+/).filter(Boolean);
  const wrapperClasses = classes.filter(item => LAYOUT.test(item)).join(' ');
  const inputClasses = classes.filter(item => !LAYOUT.test(item)).join(' ');

  const emit = (iso: string) => {
    const target = { value: iso, name: name || '' } as HTMLInputElement;
    onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLInputElement>);
  };
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    if (!text) { if (!required) emit(''); setDraft(null); return; }
    const iso = parseDisplayDate(text);
    if (!iso || (min && iso < String(min)) || (max && iso > String(max))) { setInvalid(true); return; }
    setInvalid(false);
    setDraft(null);
    if (iso !== value) emit(iso);
  };
  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker || disabled || readOnly) return;
    try { picker.showPicker(); } catch { picker.focus(); picker.click(); }
  };

  return (
    <span className={`relative block ${wrapperClasses}`}>
      <input
        {...rest}
        type="text"
        inputMode="text"
        autoComplete="off"
        name={name}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        placeholder={rest.placeholder || 'DD-MMM-YYYY'}
        value={draft ?? formatDisplayDate(value)}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }}
        onBlur={event => { commit(); rest.onBlur?.(event); }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); openPicker(); }
          rest.onKeyDown?.(event);
        }}
        aria-invalid={invalid || rest['aria-invalid']}
        title={invalid ? `Enter a date as DD-MMM-YYYY${min ? `, not before ${formatDisplayDate(String(min))}` : ''}${max ? `, not after ${formatDisplayDate(String(max))}` : ''}` : rest.title}
        className={`${inputClasses} w-full pr-9 ${invalid ? '!border-rose-500 ring-1 ring-rose-300' : ''}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled || readOnly}
        onClick={openPicker}
        aria-label="Open calendar"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-current opacity-60 hover:opacity-100 disabled:opacity-30"
      >
        <CalendarDays size={15} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={event => onChange?.(event)}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}
