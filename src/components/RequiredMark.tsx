/** Red asterisk after the label of a field that must be filled before the form can be saved. */
export function RequiredMark() {
  return <span className="ml-0.5 font-bold text-rose-600" aria-hidden="true" title="Required">*</span>;
}

/** One-line note at the top of a form explaining the asterisk. */
export function RequiredNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[11px] text-slate-500 ${className}`}>
      Fields marked <span className="font-bold text-rose-600">*</span> are required.
    </p>
  );
}
