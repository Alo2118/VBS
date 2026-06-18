export const Spinner = ({ label = "Caricamento…" }: { label?: string }) => (
  <div className="flex animate-fade-in flex-col items-center justify-center gap-3 py-12 text-muted" role="status">
    <span className="relative h-9 w-9">
      <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-line border-t-sea" />
      <span className="absolute inset-1.5 animate-pulse rounded-full bg-sea/10" />
    </span>
    <span className="text-base">{label}</span>
  </div>
);
