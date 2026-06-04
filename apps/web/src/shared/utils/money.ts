// Formattazione importi centralizzata (DEV_BEST_PRACTICE §4.3).

const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR"
});

/** 16 -> "16,00 €" */
export const formatEur = (amount: number): string => eur.format(amount);
