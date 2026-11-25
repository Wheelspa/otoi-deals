import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";

export default function EraseAll() {
  const api = useApi();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const erase = async () => {
    if (!window.confirm("Erase ALL data? This permanently deletes every product, order, coupon, customer account, drop alert and message. Admin accounts are kept. This cannot be undone.")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/erase-all");
      qc.invalidateQueries();
      toast.success(`All data erased (${data.deleted.products} products, ${data.deleted.orders} orders, ${data.deleted.customers} customers)`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button data-testid="admin-erase-all-btn" onClick={erase} disabled={busy}
      className="flex items-center gap-2 px-4 py-2 rounded-full border border-rose-500/50 text-rose-300 text-sm hover:bg-rose-500/10 transition-colors disabled:opacity-50">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TriangleAlert className="w-4 h-4" />} Erase all data
    </button>
  );
}
