import type { MemberProfile } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

/** Auto-registrazione socio: crea l'account (nasce PENDING, validato poi dallo staff). */
export const registerMember = async (params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}) => {
  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    // full_name e phone finiscono nei metadati: il trigger handle_new_user
    // li copia nel profilo socio (members).
    options: { data: { full_name: params.fullName, phone: params.phone } }
  });
  const err = toBusinessError(error as never);
  if (err) throw err;
};

export const signIn = async (email: string, password: string) => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

/** Profilo del socio loggato (con stato tessera per pilotare la UI). */
export const fetchMyProfile = async (): Promise<MemberProfile | null> => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("members")
    .select(
      "id, full_name, email, phone, role, membership_status, membership_start_date, membership_end_date, aics_number"
    )
    .eq("id", auth.user.id)
    .single();
  const err = toBusinessError(error);
  if (err) throw err;

  return {
    id: data!.id,
    fullName: data!.full_name,
    email: data!.email ?? undefined,
    phone: data!.phone ?? undefined,
    role: data!.role,
    membershipStatus: data!.membership_status,
    membershipStartDate: data!.membership_start_date ?? undefined,
    membershipEndDate: data!.membership_end_date ?? undefined,
    aicsNumber: data!.aics_number ?? undefined
  };
};
