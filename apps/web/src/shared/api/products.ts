import { supabase, toBusinessError } from "./supabase";

export interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
  active: boolean;
  sortOrder: number;
}

const mapProduct = (r: Record<string, unknown>): Product => ({
  id: r.id as string,
  name: r.name as string,
  price: Number(r.price),
  category: (r.category as string) ?? undefined,
  active: Boolean(r.active),
  sortOrder: Number(r.sort_order)
});

/** Listino prodotti, ordinato. `activeOnly` per il bar. */
export const fetchProducts = async (activeOnly = false): Promise<Product[]> => {
  let q = supabase
    .from("products")
    .select("id, name, price, category, active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  const err = toBusinessError(error);
  if (err) throw err;
  return (data as Record<string, unknown>[]).map(mapProduct);
};

export interface ProductGroup {
  category: string;
  items: Product[];
}

/** Raggruppa i prodotti per categoria, mantenendo l'ordinamento; "Altro" in fondo. */
export const groupByCategory = (products: Product[]): ProductGroup[] => {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.category?.trim() || "Altro";
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return [...map.entries()]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => {
      if (a.category === "Altro") return 1;
      if (b.category === "Altro") return -1;
      const am = Math.min(...a.items.map((i) => i.sortOrder));
      const bm = Math.min(...b.items.map((i) => i.sortOrder));
      return am - bm;
    });
};

export interface ProductInput {
  id?: string;
  name: string;
  price: number;
  category?: string;
  active: boolean;
  sortOrder: number;
}

export const upsertProduct = async (input: ProductInput): Promise<void> => {
  const { error } = await supabase.rpc("upsert_product", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_price: input.price,
    p_category: input.category ?? null,
    p_active: input.active,
    p_sort: input.sortOrder
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

export const deleteProduct = async (id: string): Promise<void> => {
  const { error } = await supabase.rpc("delete_product", { p_id: id });
  const err = toBusinessError(error);
  if (err) throw err;
};
