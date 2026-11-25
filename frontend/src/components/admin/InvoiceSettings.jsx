import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/gst";

const FIELDS = [["legal_name", "Legal business name"], ["brand", "Brand name"], ["gstin", "GSTIN"], ["phone", "Phone"], ["email", "Email"], ["prefix", "Invoice number prefix"]];

export default function InvoiceSettings() {
  const api = useApi();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["invoice-settings"], queryFn: async () => (await api.get("/admin/invoice-settings")).data });
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <Loader2 className="w-5 h-5 animate-spin text-[#B0CB1F]" />;
  const save = async (e) => {
    e.preventDefault();
    try { await api.put("/admin/invoice-settings", f); qc.invalidateQueries({ queryKey: ["invoice-settings"] }); toast.success("Invoice settings saved"); }
    catch (x) { toast.error(errMsg(x)); }
  };
  return (
    <form onSubmit={save} data-testid="invoice-settings-form" className="max-w-2xl rounded-xl border border-[#2A3647] bg-[#1C2635] p-6 space-y-4">
      <p className="text-sm text-zinc-400">These details print on every new GST invoice. If the buyer's state matches your state, CGST + SGST is charged; otherwise IGST.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {FIELDS.map(([k, l]) => (
          <div key={k} className="space-y-1.5"><Label className="text-xs text-zinc-400">{l}</Label>
            <Input data-testid={`inv-${k}-input`} value={f[k] || ""} required={["legal_name", "gstin", "prefix"].includes(k)}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div className="space-y-1.5"><Label className="text-xs text-zinc-400">Registered state</Label>
          <Select value={f.state} onValueChange={(v) => setF({ ...f, state: v })}>
            <SelectTrigger data-testid="inv-state-select"><SelectValue /></SelectTrigger>
            <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs text-zinc-400">Registered address</Label>
          <Textarea data-testid="inv-address-input" rows={3} value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      </div>
      <button data-testid="inv-save-btn" className="px-6 py-2.5 rounded-full bg-[#B0CB1F] text-[#141B26] font-semibold text-sm">Save settings</button>
    </form>
  );
}
