import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useApi, errMsg, fmtDate, inr } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BLANK = { code: "", kind: "percent", value: "", max_uses: 100, min_order: 0, expires_at: "" };

export default function Coupons() {
  const api = useApi();
  const qc = useQueryClient();
  const [f, setF] = useState(BLANK);
  const { data: coupons } = useQuery({ queryKey: ["admin-coupons"], queryFn: async () => (await api.get("/admin/coupons")).data });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-coupons"] });

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/coupons", { ...f, value: Number(f.value), max_uses: Number(f.max_uses), min_order: Number(f.min_order),
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null });
      setF(BLANK); refresh(); toast.success("Coupon created");
    } catch (x) { toast.error(errMsg(x)); }
  };
  const del = async (c) => {
    if (!window.confirm(`Permanently delete coupon ${c.code}?`)) return;
    try { await api.delete(`/admin/coupons/${c.id}`); refresh(); toast.success("Coupon deleted"); } catch (x) { toast.error(errMsg(x)); }
  };
  const toggle = async (c, active) => { await api.patch(`/admin/coupons/${c.id}`, { active }); refresh(); };

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-6" data-testid="admin-coupons">
      <form onSubmit={create} className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-5 space-y-3 h-fit">
        <p className="font-semibold">New coupon</p>
        <Input required placeholder="CODE" data-testid="coupon-code-input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        <div className="flex gap-2">
          <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
            <SelectTrigger data-testid="coupon-kind-select" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="percent">% off</SelectItem><SelectItem value="flat">₹ off</SelectItem></SelectContent>
          </Select>
          <Input required type="number" min="1" placeholder="Value" data-testid="coupon-value-input" value={f.value} onChange={set("value")} />
        </div>
        <div className="flex gap-2">
          <Input type="number" min="1" placeholder="Max uses" data-testid="coupon-max-uses-input" value={f.max_uses} onChange={set("max_uses")} />
          <Input type="number" min="0" placeholder="Min order ₹" data-testid="coupon-min-order-input" value={f.min_order} onChange={set("min_order")} />
        </div>
        <Input type="datetime-local" data-testid="coupon-expires-input" value={f.expires_at} onChange={set("expires_at")} />
        <button data-testid="coupon-create-btn" className="w-full rounded-full py-2.5 bg-[#B0CB1F] text-[#141B26] font-semibold text-sm">Create coupon</button>
      </form>
      <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] divide-y divide-[#2A3647]">
        {coupons?.length === 0 && <p className="p-6 text-zinc-600 text-sm">No coupons</p>}
        {coupons?.map((c) => (
          <div key={c.id} data-testid={`coupon-row-${c.code}`} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="font-mono font-bold">{c.code}</p>
              <p className="text-xs text-zinc-500">
                {c.kind === "percent" ? `${c.value}% off` : `${inr(c.value)} off`} · used {c.used_count}/{c.max_uses}
                {c.min_order > 0 && ` · min ${inr(c.min_order)}`} {c.expires_at && ` · expires ${fmtDate(c.expires_at)}`}
              </p>
            </div>
            <Switch data-testid={`coupon-toggle-${c.code}`} checked={c.active} onCheckedChange={(v) => toggle(c, v)} />
            <button data-testid={`coupon-delete-${c.code}`} onClick={() => del(c)} className="p-2 rounded-full hover:bg-rose-500/10"><Trash2 className="w-4 h-4 text-rose-400" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
