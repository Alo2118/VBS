// Calcolo del costo diviso tra i giocatori (regola del circolo):
//  - fino alla soglia (default 8): il prezzo del campo è fisso e diviso tra i presenti
//  - oltre la soglia: ognuno paga una quota fissa a testa (per_head)

export type CostParams = {
  players: number;
  courtPrice: number;
  perHeadPrice: number;
  threshold: number;
};

/** Costo totale dello slot in base al numero di giocatori. */
export const totalCost = ({ players, courtPrice, perHeadPrice, threshold }: CostParams): number =>
  players > threshold ? players * perHeadPrice : courtPrice;

/** Quota a carico di ciascun giocatore. */
export const perPlayerShare = (p: CostParams): number => {
  if (p.players <= 0) return 0;
  if (p.players > p.threshold) return p.perHeadPrice;
  return p.courtPrice / p.players;
};
