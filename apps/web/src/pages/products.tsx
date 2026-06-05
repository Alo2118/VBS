import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import {
  deleteProduct,
  fetchProducts,
  groupByCategory,
  upsertProduct,
  type Product
} from "@/shared/api/products";
import { formatEur, parseAmount } from "@/shared/utils/money";

const empty = { name: "", price: "", category: "", active: true, sortOrder: "0" };

export const ProductsPage = () => {
  const notify = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await fetchProducts());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page
      title="Listino"
      description="I prodotti del bar da aggiungere al conto dei soci."
      actions={<Button onClick={() => setEditing("new")}>Nuovo prodotto</Button>}
    >
      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <p className="text-base text-muted">Nessun prodotto. Aggiungi il primo col pulsante in alto.</p>
        </Card>
      ) : (
        <Card className="space-y-4">
          {groupByCategory(products).map((g) => (
            <div key={g.category}>
              <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{g.category}</p>
              <ul className="divide-y divide-line">
                {g.items.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-sand/40"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate text-base font-medium",
                          !p.active && "text-muted line-through"
                        )}
                      >
                        {p.name}
                        {!p.active && <span className="ml-2 text-sm no-underline">(non in vendita)</span>}
                      </span>
                      <span className="shrink-0 text-base font-semibold">{formatEur(p.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          notify={notify}
        />
      )}
    </Page>
  );
};

const ProductModal = ({
  product,
  onClose,
  onSaved,
  notify
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
  notify: (m: string, t?: "success" | "error" | "info") => void;
}) => {
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          price: String(product.price),
          category: product.category ?? "",
          active: product.active,
          sortOrder: String(product.sortOrder)
        }
      : empty
  );
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const price = parseAmount(form.price);
    if (!form.name.trim()) {
      notify("Indica il nome del prodotto.", "error");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      notify("Inserisci un prezzo valido.", "error");
      return;
    }
    setBusy(true);
    try {
      await upsertProduct({
        id: product?.id,
        name: form.name.trim(),
        price,
        category: form.category.trim() || undefined,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 0
      });
      notify(product ? "Prodotto aggiornato." : "Prodotto aggiunto.", "success");
      onSaved();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    setBusy(true);
    try {
      await deleteProduct(product.id);
      notify("Prodotto eliminato.", "info");
      onSaved();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={product ? "Modifica prodotto" : "Nuovo prodotto"}
      onClose={onClose}
      footer={
        <>
          {product && (
            <Button variant="danger" size="lg" onClick={() => void remove()} disabled={busy}>
              Elimina
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button size="lg" onClick={() => void save()} disabled={busy}>
            {busy ? "…" : "Salva"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nome" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <Input
          label="Prezzo (€)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          value={form.price}
          onChange={(e) => set("price", e.target.value)}
        />
        <Input
          label="Categoria (facoltativa)"
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
          placeholder="es. Bar, Bibite"
        />
        <Input
          label="Ordinamento"
          type="number"
          value={form.sortOrder}
          onChange={(e) => set("sortOrder", e.target.value)}
        />
        <label className="flex items-center gap-2 text-base">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          In vendita
        </label>
      </div>
    </Modal>
  );
};
