import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

interface OptionItem { value: string; label: string; disabled: boolean; group?: string }

type NativeSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value?: string | number | readonly string[];
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children?: React.ReactNode;
};

const textOf = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
};

/** Reads the <option> / <optgroup> children a native <select> would have. */
function collectOptions(children: React.ReactNode, group?: string, out: OptionItem[] = []): OptionItem[] {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: React.ReactNode; disabled?: boolean; label?: string };
    if (child.type === 'option') {
      const label = textOf(props.children);
      out.push({ value: props.value === undefined ? label : String(props.value), label, disabled: Boolean(props.disabled), group });
    } else if (child.type === 'optgroup') {
      collectOptions(props.children, props.label, out);
    } else if (child.type === React.Fragment) {
      collectOptions(props.children, group, out);
    }
  });
  return out;
}

const MAX_SHOWN = 200;

/**
 * Drop-in for a native <select> with a long list (employees, branches, users…): same props and <option> children,
 * but it opens a list with a search box. onChange receives an event whose target.value is the chosen value, so
 * existing `e => set(e.target.value)` handlers work unchanged. `required` still blocks form submission.
 */
export function SearchableSelect({ value, defaultValue, onChange, children, className = '', disabled, required, id, name, 'aria-label': ariaLabel, title, onBlur }: NativeSelectProps) {
  const options = useMemo(() => collectOptions(children), [children]);
  // Uncontrolled use (defaultValue, no value) keeps its own choice, like a native <select>.
  const controlled = value !== undefined;
  const [ownValue, setOwnValue] = useState(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = controlled ? String(value ?? '') : ownValue;
  const selected = options.find(option => option.value === current);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter(option => { const text = `${option.label} ${option.value} ${option.group || ''}`.toLowerCase(); return words.every(word => text.includes(word)); });
  }, [options, query]);
  const shown = filtered.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, shown.findIndex(option => option.value === current));
    setHighlight(index);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' }); }, [highlight]);

  const choose = (option: OptionItem) => {
    if (option.disabled) return;
    setOpen(false); setQuery('');
    if (option.value === current) return;
    if (!controlled) setOwnValue(option.value);
    const target = { value: option.value, name: name || '', id: id || '' } as unknown as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight(index => Math.min(shown.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight(index => Math.max(0, index - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (shown[highlight]) choose(shown[highlight]); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur as unknown as React.FocusEventHandler<HTMLDivElement>}>
      <button type="button" id={id} disabled={disabled} title={title} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        onClick={() => setOpen(previous => !previous)}
        onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setOpen(true); } }}
        className={`${className} flex w-full items-center justify-between gap-2 text-left`}>
        <span className={`min-w-0 truncate ${selected && selected.value !== '' ? '' : 'text-slate-400'}`}>{selected ? selected.label : (options[0]?.value === '' ? options[0].label : 'Select…')}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {/* Keeps native "required" validation and FormData (by name) working. */}
      {(required || name) && <input tabIndex={-1} aria-hidden="true" required={required} value={current} onChange={() => undefined} name={name}
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" />}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" onKeyDown={onKeyDown}>
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} value={query} onChange={event => { setQuery(event.target.value); setHighlight(0); }} placeholder="Type to search…" aria-label="Search the list"
              className="w-full rounded-md border border-slate-200 py-1.5 pl-7 pr-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1 text-sm">
            {shown.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">No match.</li>}
            {shown.map((option, index) => (
              <li key={`${option.value}-${index}`} role="option" aria-selected={option.value === current} aria-disabled={option.disabled} data-index={index}
                onMouseEnter={() => setHighlight(index)} onMouseDown={event => { event.preventDefault(); choose(option); }}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${option.disabled ? 'cursor-not-allowed text-slate-300' : index === highlight ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}>
                <span className="min-w-0 truncate">{option.group ? <span className="text-slate-400">{option.group} · </span> : null}{option.label}</span>
                {option.value === current && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </li>
            ))}
            {filtered.length > MAX_SHOWN && <li className="px-3 py-1.5 text-[11px] text-slate-400">{(filtered.length - MAX_SHOWN).toLocaleString()} more: type to narrow the list.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
