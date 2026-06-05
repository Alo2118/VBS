import { supabase, toBusinessError } from "./supabase";

export type LedgerKind =
  | "COURT"
  | "BAR"
  | "PENALTY"
  | "PAYMENT"
  | "TOPUP"
  | "WAIVER"
  | "ADJUST";
export type PayMethod = "CASH" | "SATISPAY";

export interface LedgerEntry {
  id: string;
  memberId: string;
  kind: LedgerKind;
  amount: number;
  method?: PayMethod;
  description?: string;
  bookingId?: string;
  createdAt: string;
}

export interface MemberAccount {
  memberId: string;
  fullName: string;
  nickname?: string;
  balance: number;
  lastAt: string;
}

/** I tipi che il socio "deve" (DARE) vs quelli che entrano (AVERE). */
export const isDebit = (kind: LedgerKind): boolean =>
  kind === "COURT" || kind === "BAR" || kind === "PENALTY";

/** Importo con segno per la visualizzazione (negativo = il socio deve). */
export const signedAmount = (e: { kind: LedgerKind; amount: number }): number =>
  isDebit(e.kind) ? -e.amount : e.amount;

/** Etichette dei movimenti e dei metodi di pagamento (riuso UI). */
export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  COURT: "Quota campo",
  BAR: "Bar",
  PENALTY: "Penale",
  PAYMENT: "Pagamento",
  TOPUP: "Ricarica",
  WAIVER: "Storno",
  ADJUST: "Rettifica"
};

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  CASH: "contanti",
  SATISPAY: "Satispay"
};

const mapEntry = (r: Record<string, unknown>): LedgerEntry => ({
  id: r.id as string,
  memberId: r.member_id as string,
  kind: r.kind as LedgerKind,
  amount: Number(r.amount),
  method: (r.method as PayMethod) ?? undefined,
  description: (r.description as string) ?? undefined,
  bookingId: (r.booking_id as string) ?? undefined,
  createdAt: r.created_at as string
});

const fetchEntriesFor = async (memberId: string): Promise<LedgerEntry[]> => {
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id, member_id, kind, amount, method, description, booking_id, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  const err = toBusinessError(error);
  if (err) throw err;
  return (data as Record<string, unknown>[]).map(mapEntry);
};

/** Conto del socio corrente: saldo + movimenti. */
export const fetchMyAccount = async (): Promise<{ balance: number; entries: LedgerEntry[] }> => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { balance: 0, entries: [] };
  const { data, error } = await supabase.rpc("account_balance", { p_member: uid });
  const err = toBusinessError(error);
  if (err) throw err;
  return { balance: Number(data ?? 0), entries: await fetchEntriesFor(uid) };
};

/** Movimenti di un socio (vista staff/cassa). */
export const fetchMemberLedger = async (
  memberId: string
): Promise<{ balance: number; entries: LedgerEntry[] }> => {
  const { data, error } = await supabase.rpc("account_balance", { p_member: memberId });
  const err = toBusinessError(error);
  if (err) throw err;
  return { balance: Number(data ?? 0), entries: await fetchEntriesFor(memberId) };
};

/** Elenco conti con saldo (Cassa). */
export const fetchMemberAccounts = async (): Promise<MemberAccount[]> => {
  const { data, error } = await supabase.rpc("list_member_accounts");
  const err = toBusinessError(error);
  if (err) throw err;
  return (data as Record<string, unknown>[]).map((r) => ({
    memberId: r.member_id as string,
    fullName: r.full_name as string,
    nickname: (r.nickname as string) ?? undefined,
    balance: Number(r.balance),
    lastAt: r.last_at as string
  }));
};

/** Addebito sul conto (quota campo, bar, penale). */
export const postCharge = async (
  memberId: string,
  kind: Extract<LedgerKind, "COURT" | "BAR" | "PENALTY">,
  amount: number,
  description?: string,
  bookingId?: string
): Promise<void> => {
  const { error } = await supabase.rpc("post_account_charge", {
    p_member: memberId,
    p_kind: kind,
    p_amount: amount,
    p_description: description ?? null,
    p_booking: bookingId ?? null
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

/** Incasso/ricarica sul conto col metodo (contanti/Satispay). */
export const postPayment = async (
  memberId: string,
  amount: number,
  method: PayMethod,
  kind: Extract<LedgerKind, "PAYMENT" | "TOPUP"> = "PAYMENT",
  description?: string
): Promise<void> => {
  const { error } = await supabase.rpc("post_account_payment", {
    p_member: memberId,
    p_amount: amount,
    p_method: method,
    p_kind: kind,
    p_description: description ?? null,
    p_booking: null
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

/** Addebita la quota campo divisa tra i giocatori della prenotazione. */
export const postCourtFees = async (bookingId: string): Promise<number> => {
  const { data, error } = await supabase.rpc("post_court_fees", { p_booking_id: bookingId });
  const err = toBusinessError(error);
  if (err) throw err;
  return Number(data ?? 0);
};

/** Vendita bar: una riga (movimento BAR) per prodotto del carrello. */
export const postBarSale = async (
  memberId: string,
  items: { name: string; amount: number }[]
): Promise<number> => {
  const { data, error } = await supabase.rpc("post_bar_sale", {
    p_member: memberId,
    p_items: items
  });
  const err = toBusinessError(error);
  if (err) throw err;
  return Number(data ?? 0);
};

export interface Takings {
  cash: number;
  satispay: number;
}

/** Incassi di oggi per metodo (contanti / Satispay). */
export const fetchTakingsToday = async (): Promise<Takings> => {
  const { data, error } = await supabase.rpc("takings_today");
  const err = toBusinessError(error);
  if (err) throw err;
  const row = (Array.isArray(data) ? data[0] : data) as { cash?: number; satispay?: number } | null;
  return { cash: Number(row?.cash ?? 0), satispay: Number(row?.satispay ?? 0) };
};

/** Storno/esonero di un importo dovuto (solo gestione: ADMIN/MANAGER). */
export const postWaiver = async (
  memberId: string,
  amount: number,
  reason: string
): Promise<void> => {
  const { error } = await supabase.rpc("post_account_payment", {
    p_member: memberId,
    p_amount: amount,
    p_method: null,
    p_kind: "WAIVER",
    p_description: reason,
    p_booking: null
  });
  const err = toBusinessError(error);
  if (err) throw err;
};
