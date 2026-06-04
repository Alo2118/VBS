import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { useToast } from "@/shared/ui/toast";
import { registerMember, signIn } from "@/shared/api/auth";

type Mode = "login" | "register";

export const LoginPage = () => {
  const notify = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
        // Il cambio di sessione aggiorna automaticamente lo stato auth.
      } else {
        await registerMember({ email, password, fullName });
        notify(
          "Registrazione inviata. Lo staff confermerà la tua tessera: poi potrai prenotare.",
          "success"
        );
        setMode("login");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore, riprova.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">VBS — Campi Beach Volley</h1>
        <p className="mt-2 text-base text-muted">
          {mode === "login"
            ? "Accedi per prenotare i campi."
            : "Crea il tuo account socio."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <Input
              label="Nome e cognome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
            required
          />

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy
              ? "Attendere…"
              : mode === "login"
                ? "Accedi"
                : "Registrati"}
          </Button>
        </form>

        <div className="mt-6 text-center text-base">
          {mode === "login" ? (
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => setMode("register")}
            >
              Non hai un account? Registrati
            </button>
          ) : (
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => setMode("login")}
            >
              Hai già un account? Accedi
            </button>
          )}
        </div>
      </Card>
    </div>
  );
};
