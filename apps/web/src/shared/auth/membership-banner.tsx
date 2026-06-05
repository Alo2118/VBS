import { useAuth } from "./auth-context";

/** Avviso chiaro quando il socio non può prenotare (tessera non valida). */
export const MembershipBanner = () => {
  const { profile } = useAuth();
  if (!profile || profile.membershipStatus === "VALID") return null;

  const messages: Record<string, string> = {
    PENDING:
      "Il tuo account è in attesa di conferma da parte dello staff. Potrai prenotare dopo la validazione della tessera.",
    EXPIRED: "La tua tessera è scaduta. Rinnovala in segreteria per poter prenotare.",
    SUSPENDED: "La tua tessera è sospesa. Contatta lo staff per maggiori informazioni."
  };

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-800"
    >
      {messages[profile.membershipStatus] ?? "Tessera non valida: non puoi prenotare."}
    </div>
  );
};
