export const Spinner = ({ label = "Caricamento…" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-10 text-muted" role="status">
    <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
    <span className="text-base">{label}</span>
  </div>
);
