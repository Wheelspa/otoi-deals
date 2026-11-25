import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, errMsg, imgUrl } from "@/lib/api";

const BLANK = { name: "", category: "", description: "", images: [], specs: [], original_price: "", slabs: [{ qty: 100, price: "" }], min_qty: 1, max_qty: 2, delivery_charge: 0, gst_rate: 18, hsn_code: "", start_at: "", end_at: "" };
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const toIso = (v) => (v ? new Date(v).toISOString() : null);

export default function ProductForm({ product, onClose, onSaved }) {
  const api = useApi();
  const [f, setF] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (product) setF(product.id ? { ...BLANK, ...product, start_at: toLocal(product.start_at), end_at: toLocal(product.end_at) } : BLANK);
  }, [product]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setRow = (k, i, field) => (e) => setF({ ...f, [k]: f[k].map((r, j) => (j === i ? { ...r, [field]: e.target.value } : r)) });
  const delRow = (k, i) => setF({ ...f, [k]: f[k].filter((_, j) => j !== i) });

  const upload = async (e) => {
    const files = [...e.target.files];
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        urls.push((await api.post("/admin/upload", fd)).data.url);
      }
      setF((cur) => ({ ...cur, images: [...cur.images, ...urls] }));
    } catch (x) { toast.error(errMsg(x, "Upload failed")); } finally { setUploading(false); e.target.value = ""; }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: f.name, category: f.category, description: f.description, images: f.images,
      specs: f.specs.filter((s) => s.label && s.value), original_price: Number(f.original_price),
      slabs: f.slabs.map((s) => ({ qty: Number(s.qty), price: Number(s.price) })),
      min_qty: Number(f.min_qty), max_qty: Number(f.max_qty), delivery_charge: Number(f.delivery_charge || 0), gst_rate: Number(f.gst_rate), hsn_code: f.hsn_code || "", start_at: toIso(f.start_at), end_at: toIso(f.end_at),
    };
    try {
      if (product.id) await api.put(`/admin/products/${product.id}`, body);
      else await api.post("/admin/products", body);
      toast.success("Product saved");
      onSaved();
    } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="product-form-dialog" className="bg-[#1C2635] border-[#2A3647] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{product?.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <F l="Product name" wide><Input required data-testid="pf-name" value={f.name} onChange={set("name")} /></F>
            <F l="Category"><Input data-testid="pf-category" value={f.category} onChange={set("category")} /></F>
            <F l="Original market price (₹)"><Input required type="number" min="1" data-testid="pf-original-price" value={f.original_price} onChange={set("original_price")} /></F>
            <F l="GST slab (added on top)">
              <Select value={String(f.gst_rate)} onValueChange={(v) => setF({ ...f, gst_rate: Number(v) })}>
                <SelectTrigger data-testid="pf-gst-rate"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="5">5% GST</SelectItem><SelectItem value="18">18% GST</SelectItem></SelectContent>
              </Select>
            </F>
            <F l="HSN code"><Input data-testid="pf-hsn-code" value={f.hsn_code || ""} onChange={set("hsn_code")} placeholder="e.g. 6307" /></F>
            <F l="Delivery charges per order (₹)"><Input type="number" min="0" data-testid="pf-delivery-charge" value={f.delivery_charge} onChange={set("delivery_charge")} /></F>
            <F l="Description" wide><Textarea data-testid="pf-description" rows={3} value={f.description} onChange={set("description")} /></F>
          </div>

          <Section title="Discount quantity & price slabs" onAdd={() => setF({ ...f, slabs: [...f.slabs, { qty: 100, price: "" }] })} addId="pf-add-slab">
            {f.slabs.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="font-mono text-xs text-zinc-500 w-12">{i === 0 ? "First" : "Next"}</span>
                <Input type="number" min="1" required data-testid={`pf-slab-qty-${i}`} value={s.qty} onChange={setRow("slabs", i, "qty")} placeholder="Units" />
                <Input type="number" min="1" required data-testid={`pf-slab-price-${i}`} value={s.price} onChange={setRow("slabs", i, "price")} placeholder="Price ₹" />
                {f.slabs.length > 1 && <button type="button" onClick={() => delRow("slabs", i)}><Trash2 className="w-4 h-4 text-zinc-500" /></button>}
              </div>
            ))}
            <p className="text-xs text-zinc-500">Total discounted stock: <b className="font-mono text-zinc-200">{f.slabs.reduce((a, s) => a + Number(s.qty || 0), 0)}</b> units</p>
          </Section>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <F l="Min / customer"><Input type="number" min="1" data-testid="pf-min-qty" value={f.min_qty} onChange={set("min_qty")} /></F>
            <F l="Max / customer"><Input type="number" min="1" data-testid="pf-max-qty" value={f.max_qty} onChange={set("max_qty")} /></F>
            <F l="Offer start"><Input type="datetime-local" data-testid="pf-start-at" value={f.start_at} onChange={set("start_at")} /></F>
            <F l="Offer expiry"><Input type="datetime-local" data-testid="pf-end-at" value={f.end_at} onChange={set("end_at")} /></F>
          </div>

          <Section title="Images">
            <div className="flex flex-wrap gap-3">
              {f.images.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#2A3647]">
                  <img src={imgUrl(src)} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => delRow("images", i)} className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border border-dashed border-zinc-700 grid place-items-center cursor-pointer hover:border-[#B0CB1F]">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-zinc-500" />}
                <input type="file" accept="image/*" multiple hidden data-testid="pf-image-upload" onChange={upload} />
              </label>
            </div>
            <div className="flex gap-2">
              <Input placeholder="…or paste an image URL" data-testid="pf-image-url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="button" data-testid="pf-add-image-url" className="px-3 rounded-md border border-zinc-700 text-sm"
                onClick={() => { if (url) { setF({ ...f, images: [...f.images, url] }); setUrl(""); } }}>Add</button>
            </div>
          </Section>

          <Section title="Specifications" onAdd={() => setF({ ...f, specs: [...f.specs, { label: "", value: "" }] })} addId="pf-add-spec">
            {f.specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Label" data-testid={`pf-spec-label-${i}`} value={s.label} onChange={setRow("specs", i, "label")} />
                <Input placeholder="Value" data-testid={`pf-spec-value-${i}`} value={s.value} onChange={setRow("specs", i, "value")} />
                <button type="button" onClick={() => delRow("specs", i)}><Trash2 className="w-4 h-4 text-zinc-500" /></button>
              </div>
            ))}
          </Section>

          <button data-testid="pf-save-btn" disabled={busy || uploading} className="w-full rounded-full py-3 font-semibold bg-[#B0CB1F] text-[#141B26] disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save product"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const F = ({ l, children, wide }) => <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label className="text-xs text-zinc-400">{l}</Label>{children}</div>;
const Section = ({ title, children, onAdd, addId }) => (
  <div className="space-y-2.5 rounded-xl border border-[#2A3647] p-4">
    <div className="flex justify-between items-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{title}</p>
      {onAdd && <button type="button" data-testid={addId} onClick={onAdd} className="text-xs text-[#B0CB1F] flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
    </div>
    {children}
  </div>
);
