import { Search, X } from 'lucide-react';

type ListSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Rows before filtering; with `shown`, a "Showing x of y" line appears while searching. */
  total?: number;
  shown?: number;
  className?: string;
};

/** Search box used above every list: Esc or the clear button resets it. */
export default function ListSearch({ value, onChange, placeholder, total, shown, className = '' }: ListSearchProps) {
  const searching = value.trim().length > 0;
  return (
    <div className={`flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 ${className}`}>
      <label className="relative block w-full sm:w-80">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape' && value) { event.stopPropagation(); onChange(''); } }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button type="button" onClick={() => onChange('')} aria-label="Clear search" title="Clear search (Esc)" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={14} />
          </button>
        )}
      </label>
      {searching && total !== undefined && shown !== undefined && (
        <p className="text-xs text-slate-500" aria-live="polite">Showing {shown} of {total}</p>
      )}
    </div>
  );
}

/** Row shown in place of an empty table body while a search hides every row. */
export function NoSearchResults({ query, colSpan, onClear }: { query: string; colSpan?: number; onClear: () => void }) {
  const content = (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold text-slate-700">No results for “{query.trim()}”</p>
      <button type="button" onClick={onClear} className="mt-2 text-xs font-bold text-emerald-700 hover:underline">Clear search</button>
    </div>
  );
  return colSpan ? <tr><td colSpan={colSpan}>{content}</td></tr> : content;
}
