import React, { useEffect } from 'react';
import { ChevronRight, X, type LucideIcon } from 'lucide-react';

export type MegaTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
export interface MegaBadge { text: string; tone: 'red' | 'amber' | 'blue' | 'emerald' | 'slate' }
export interface MegaItem { id: string; label: string; badge?: MegaBadge; active: boolean; onSelect: () => void }
export interface MegaColumn { title: string; tag?: string; tone: MegaTone; icon: LucideIcon; items: MegaItem[] }
export interface MegaModule {
  id: string;
  title: string;
  subtitle: string;
  chip: string;
  icon: LucideIcon;
  tone: MegaTone;
  columns: MegaColumn[];
  footerNote?: React.ReactNode;
  action?: { label: string; onSelect: () => void };
}

// The app's own palette: slate text, emerald for the current screen, red for "fix" (same as the classic sidebar).
const BADGE: Record<MegaBadge['tone'], string> = {
  red: 'bg-[#B91C1C] text-white',
  amber: 'bg-slate-700 text-white',
  blue: 'bg-slate-100 text-slate-500',
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-500',
};

/** Modules that still have something the user may open. */
export const visibleModules = (modules: MegaModule[]) => modules
  .map(module => ({ ...module, columns: module.columns.filter(column => column.items.length > 0) }))
  .filter(module => module.columns.length > 0);

/** Count shown on a module in the sidebar: the sum of its pending-work badges. */
function pendingCount(module: MegaModule) {
  return module.columns.flatMap(column => column.items)
    .reduce((sum, item) => sum + (item.badge?.tone === 'amber' && /^\d+$/.test(item.badge.text) ? Number(item.badge.text) : 0), 0);
}

/** Sidebar list of modules, in the classic sidebar style; a click opens the module's menu over the page. */
export function MegaNavList({ modules, openId, onOpen, heading }: { modules: MegaModule[]; openId: string | null; onOpen: (id: string | null) => void; heading: string }) {
  return (
    <>
      <div className="sec"><span>{heading}</span></div>
      {modules.map(module => {
        const containsActive = module.columns.some(column => column.items.some(item => item.active));
        const isOpen = openId === module.id;
        const count = pendingCount(module);
        return (
          <button key={module.id} type="button" onClick={() => onOpen(isOpen ? null : module.id)} aria-expanded={isOpen} aria-haspopup="true"
            className={`side-item ${containsActive ? 'on' : ''} ${isOpen && !containsActive ? '!bg-slate-800 !text-white' : ''}`}>
            <span className="min-w-0 leading-tight">{module.title}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {count > 0 && <span className="n">{count}</span>}
              <ChevronRight className={`h-3.5 w-3.5 transition ${isOpen ? 'rotate-90' : 'opacity-60'}`} />
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * The module's sub-menus, floating over the current page (the page stays where it is underneath).
 * Click a screen to open it; ESC, the × or a click outside closes the menu.
 */
export function MegaNavPanel({ module, onClose, closeHint }: { module: MegaModule | null; onClose: () => void; closeHint: string }) {
  useEffect(() => {
    if (!module) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [module, onClose]);
  if (!module) return null;
  const Icon = module.icon;
  const [hintBefore, hintAfter = ''] = closeHint.split('ESC');
  return (
    <div className="absolute inset-0 z-[45] bg-slate-900/10 md:left-[248px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="m-2 max-h-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl sm:m-3 sm:p-5" role="dialog" aria-modal="false" aria-label={module.title}>
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Icon className="h-[18px] w-[18px]" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{module.title}</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">{module.chip}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{module.subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close menu"><X className="h-4 w-4" /></button>
        </header>

        <div className={`mt-4 grid gap-3 ${module.columns.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : module.columns.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {module.columns.map(column => {
            const ColumnIcon = column.icon;
            return (
              <section key={column.title} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600"><ColumnIcon className="h-3.5 w-3.5 text-emerald-600" />{column.title}</h3>
                  {column.tag && <span className="shrink-0 text-[10px] text-slate-400">{column.tag}</span>}
                </div>
                <ul className="space-y-0.5">
                  {column.items.map(item => (
                    <li key={item.id}>
                      <button type="button" onClick={() => { item.onSelect(); onClose(); }}
                        className={`group flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[13px] transition ${item.active ? 'bg-emerald-600 font-semibold text-white' : 'text-slate-700 hover:bg-white hover:text-emerald-700 hover:shadow-sm'}`}>
                        <span className="min-w-0">{item.label}</span>
                        {item.badge
                          ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.active && item.badge.tone !== 'red' ? 'bg-emerald-700 text-white' : BADGE[item.badge.tone]}`}>{item.badge.text}</span>
                          : <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5 ${item.active ? 'text-white' : 'text-slate-400 group-hover:text-emerald-600'}`} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{module.footerNote || <>{hintBefore}<kbd className="mx-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">ESC</kbd>{hintAfter}</>}</span>
          {module.footerNote && <span>{hintBefore}<kbd className="mx-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">ESC</kbd>{hintAfter}</span>}
          {module.action && <button type="button" onClick={() => { module.action?.onSelect(); onClose(); }} className="font-bold text-emerald-700 hover:underline">+ {module.action.label}</button>}
        </footer>
      </div>
    </div>
  );
}
