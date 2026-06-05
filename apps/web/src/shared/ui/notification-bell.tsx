import { useCallback, useEffect, useRef, useState } from "react";
import type { AppNotification } from "@vbs/shared";
import { useAuth } from "@/shared/auth/auth-context";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchNotifications, markNotificationsRead } from "@/shared/api/notifications";
import { disablePush, enablePush, getPushState, type PushState } from "@/shared/push/push";

const REFRESH_MS = 60_000;

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

export const NotificationBell = () => {
  const { profile } = useAuth();
  const notify = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>();

  const unread = items.filter((n) => !n.readAt).length;

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      setItems(await fetchNotifications());
    } catch {
      // Silenzioso: gli avvisi non devono rompere la navigazione.
    }
  }, [profile]);

  useEffect(() => {
    void load();
    void getPushState().then(setPushState);
    timer.current = window.setInterval(load, REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const openPanel = async () => {
    setOpen(true);
    const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length > 0) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      try {
        await markNotificationsRead(unreadIds);
      } catch {
        // poco grave: verrà ritentato al prossimo caricamento
      }
    }
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushState === "on") {
        await disablePush();
        notify("Avvisi sul telefono disattivati.", "info");
      } else {
        await enablePush();
        notify("Avvisi sul telefono attivati.", "success");
      }
      setPushState(await getPushState());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!profile) return null;

  const pushRow = () => {
    if (pushState === "unsupported") return null;
    if (pushState === "unconfigured") {
      return <p className="text-xs text-muted">Avvisi sul telefono non ancora disponibili.</p>;
    }
    if (pushState === "denied") {
      return (
        <p className="text-xs text-muted">
          Avvisi bloccati dal browser: abilitali dalle impostazioni del sito.
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => void togglePush()}
        disabled={busy}
        className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
      >
        {pushState === "on" ? "Disattiva avvisi sul telefono" : "Attiva avvisi sul telefono"}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Avvisi"
        onClick={() => (open ? setOpen(false) : void openPanel())}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-100 hover:bg-slate-800"
      >
        <span className="text-xl leading-none" aria-hidden>
          🔔
        </span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <span className="text-sm font-semibold text-slate-100">Avvisi</span>
              {pushRow()}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Nessun avviso.</p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "border-b border-slate-800/60 px-4 py-3",
                      !n.readAt && "bg-slate-800/40"
                    )}
                  >
                    <p className="text-sm font-medium text-slate-100">{n.title}</p>
                    <p className="mt-0.5 text-sm text-slate-300">{n.body}</p>
                    <p className="mt-1 text-xs text-muted">{formatWhen(n.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
