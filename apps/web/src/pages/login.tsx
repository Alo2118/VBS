import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { BrandFooter, BrandMark } from "@/shared/ui/brand";
import { useToast } from "@/shared/ui/toast";
import { registerMember, signIn } from "@/shared/api/auth";

type Mode = "login" | "register";

export const LoginPage = () => {
  const notify = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
        await registerMember({ email, password, fullName, phone, nickname });
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-sand-fade p-4">
      <Card className="w-full max-w-md overflow-hidden p-0">
        <div className="bg-brand-gradient px-6 py-7">
          <BrandMark size="lg" tone="light" />
        </div>
        <div className="p-6">
          <h1 className="text-xl font-semibold">
            {mode === "login" ? "Accedi" : "Crea il tuo account socio"}
          </h1>
          <p className="mt-1 text-base text-muted">
            {mode === "login"
              ? "Entra per prenotare i campi."
              : "Lo staff confermerà la tessera prima di poter prenotare."}
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
          {mode === "register" && (
            <Input
              label="Soprannome"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="es. «Cobra» — utile in caso di omonimia"
              autoComplete="nickname"
            />
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
          {mode === "register" && (
            <Input
              label="Telefono"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="es. 333 1234567"
              required
            />
          )}
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
        </div>
      </Card>
      <BrandFooter className="mt-2 max-w-md" />
    </div>
  );
};
