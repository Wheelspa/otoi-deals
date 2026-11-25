import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, inr, imgUrl, errMsg, fmtDate } from "@/lib/api";
import StatusBadge from "@/components/deal/StatusBadge";
import ProductForm from "./ProductForm";

const ACTIONS = {
  draft: [["queue", "Add to queue"], ["make_next", "Make next"], ["activate_now", "Activate now"]],
  queued: [["make_next", "Make next"], ["activate_now", "Activate now"], ["unqueue", "Back to draft"]],
  live: [["pause", "Pause"], ["stop", "Stop offer"]],
  paused: [["resume", "Resume"], ["stop", "Stop offer"]],
};
const STATUS_TEXT = { draft: "Draft", queued: "Queued", live: "Live", paused: "Paused", sold_out: "Sold out", expired: "Expired", stopped: "Stopped" };

export default function Products() {
  const api = useApi();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(null);
  const { data: items } = useQuery({ queryKey: ["admin-products"], queryFn: async () => (await api.get("/admin/products")).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-products"] }); qc.invalidateQueries({ queryKey: ["deal"] }); qc.invalidateQueries({ queryKey: ["admin-analytics"] }); };

  const act = async (p, action) => {
    if (["stop", "activate_now"].includes(action) && !window.confirm(action === "stop" ? "Stop this offer permanently?" : "This will stop the current live deal and launch this one. Continue?")) return;
    try { await api.post(`/admin/products/${p.id}/action`, { action }); toast.success("Updated"); refresh(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (p) => {
    if (!window.confirm(`Permanently delete "${p.name}"?${p.sold || p.reserved ? " All of its orders will be deleted too." : ""} This cannot be undone.`)) return;
    try {
      const { data } = await api.delete(`/admin/products/${p.id}`);
      toast.success(`Product deleted${data.orders_deleted ? ` with ${data.orders_deleted} orders` : ""}`);
      refresh(); qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) { toast.error(errMsg(e)); }
  };

  if (!items) return <Loader2 className="w-5 h-5 animate-spin text-[#B0CB1F]" />;
  return (
    <div className="space-y-4" data-testid="admin-products">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">Only one deal is live at a time. When it sells out or expires, the top queued product goes live automatically.</p>
        <button data-testid="admin-add-product-btn" onClick={() => setEdit({})}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#B0CB1F] text-[#141B26] text-sm font-semibold shrink-0"><Plus className="w-4 h-4" /> New product</button>
      </div>
      {items.map((p) => (
        <div key={p.id} data-testid={`admin-product-${p.id}`}
          className={`rounded-xl border bg-[#1C2635] p-4 flex flex-col md:flex-row gap-4 md:items-center ${p.status === "live" ? "border-[#B0CB1F]/50" : "border-[#2A3647]"}`}>
          <img src={imgUrl(p.images?.[0])} alt="" className="w-20 h-20 rounded-lg object-cover bg-[#101620]" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span data-testid={`admin-product-status-${p.id}`} className="font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded border border-zinc-700">{STATUS_TEXT[p.status]}</span>
              {["live", "paused"].includes(p.status) && <StatusBadge status={p.display_status} testId={`admin-product-badge-${p.id}`} />}
              {p.status === "queued" && <span className="font-mono text-[10px] text-zinc-500">#{p.queue_position}{p.start_at && ` · starts ${fmtDate(p.start_at)}`}</span>}
            </div>
            <p className="font-semibold truncate">{p.name}</p>
            <p className="font-mono text-xs text-zinc-500">
              {inr(p.original_price)} → {p.slabs.map((s) => `${s.qty}@${inr(s.price)}`).join(" · ")} · GST {p.gst_rate ?? 18}% · delivery {inr(p.delivery_charge || 0)} · sold {p.sold}/{p.total_qty} · reserved {p.reserved}
              {p.end_at && ` · ends ${fmtDate(p.end_at)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {p.status === "queued" && <>
              <Icon onClick={() => act(p, "move_up")} testId={`admin-move-up-${p.id}`}><ArrowUp className="w-3.5 h-3.5" /></Icon>
              <Icon onClick={() => act(p, "move_down")} testId={`admin-move-down-${p.id}`}><ArrowDown className="w-3.5 h-3.5" /></Icon>
            </>}
            {(ACTIONS[p.status] || []).map(([a, l]) => (
              <button key={a} data-testid={`admin-action-${a}-${p.id}`} onClick={() => act(p, a)}
                className={`px-3 py-1.5 rounded-full text-xs border ${a === "stop" ? "border-rose-500/40 text-rose-300" : a === "activate_now" || a === "resume" ? "border-[#B0CB1F] text-[#B0CB1F]" : "border-zinc-700"} hover:bg-white/5`}>{l}</button>
            ))}
            <Icon onClick={() => setEdit(p)} testId={`admin-edit-${p.id}`}><Pencil className="w-3.5 h-3.5" /></Icon>
            <Icon onClick={() => del(p)} testId={`admin-delete-${p.id}`}><Trash2 className="w-3.5 h-3.5 text-rose-400" /></Icon>
          </div>
        </div>
      ))}
      <ProductForm product={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />
    </div>
  );
}

const Icon = ({ children, onClick, testId }) => (
  <button data-testid={testId} onClick={onClick} className="p-2 rounded-full border border-zinc-700 hover:bg-white/5">{children}</button>
);
