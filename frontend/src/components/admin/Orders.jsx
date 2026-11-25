import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Trash2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApi, inr, fmtDate, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["all", "paid", "pending", "failed", "cancelled", "expired"];
const FULFIL = ["placed", "packed", "shipped", "delivered"];
const TONE = { paid: "text-emerald-400", pending: "text-amber-400", failed: "text-rose-400", cancelled: "text-zinc-500", expired: "text-zinc-500" };

export default function Orders() {
  const api = useApi();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const params = { ...(status !== "all" && { status }), ...(q && { q }) };
  const { data: orders } = useQuery({ queryKey: ["admin-orders", params], queryFn: async () => (await api.get("/admin/orders", { params })).data, refetchInterval: 15000 });

  const exportFile = async (fmt) => {
    try {
      const res = await api.get("/admin/orders/export", { params: { fmt, ...(status !== "all" && { status }) }, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = `dealwills_orders.${fmt}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast.error("Export failed"); }
  };
  const fulfil = async (o, fulfillment) => {
    try { await api.patch(`/admin/orders/${o.id}`, { fulfillment }); qc.invalidateQueries({ queryKey: ["admin-orders"] }); toast.success("Order updated"); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const sendInvoice = async (o) => {
    try {
      const { data } = await api.post(`/admin/orders/${o.id}/invoice`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success(`Invoice ${data.number} ${data.whatsapp_status === "sent" ? "sent on WhatsApp" : data.whatsapp_status === "mocked" ? "ready (WhatsApp not connected yet)" : "ready, WhatsApp send failed"}`);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (o) => {
    if (!window.confirm(`Permanently delete order ${o.order_number}?${o.status === "paid" ? " Its units will be removed from the sold count." : ""} This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/orders/${o.id}`);
      ["admin-orders", "admin-analytics", "admin-products", "deal"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success("Order deleted");
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4" data-testid="admin-orders">
      <div className="flex flex-wrap gap-3 items-center">
        <Input data-testid="admin-orders-search" placeholder="Search order #, name, phone, email" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="admin-orders-status-filter" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <button data-testid="admin-btn-export-orders-csv" onClick={() => exportFile("csv")} className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-700 text-sm"><Download className="w-4 h-4" /> CSV</button>
          <button data-testid="admin-btn-export-orders-xlsx" onClick={() => exportFile("xlsx")} className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#B0CB1F] text-[#141B26] text-sm font-semibold"><Download className="w-4 h-4" /> Excel</button>
        </div>
      </div>
      <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] overflow-x-auto">
        {!orders ? <Loader2 className="w-5 h-5 animate-spin m-6 text-[#B0CB1F]" /> : (
          <table className="w-full text-sm min-w-[900px]" data-testid="admin-orders-table">
            <thead className="text-left font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-[#2A3647]">
              <tr>{["Order", "Date", "Customer", "Product", "Qty", "Delivery", "GST", "Total", "Payment", "Fulfilment", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#2A3647]">
              {orders.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-zinc-600">No orders</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} data-testid={`admin-order-row-${o.order_number}`}>
                  <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3"><p>{o.customer_name || "—"}</p><p className="text-xs text-zinc-500">{o.phone} · {o.email}</p></td>
                  <td className="px-4 py-3 max-w-[180px] truncate">{o.product_name}</td>
                  <td className="px-4 py-3 font-mono">{o.qty}</td>
                  <td data-testid={`admin-order-delivery-${o.order_number}`} className="px-4 py-3 font-mono">{inr(o.delivery_charge || 0)}</td>
                  <td data-testid={`admin-order-gst-${o.order_number}`} className="px-4 py-3 font-mono">{inr(o.gst_amount || 0)}<p className="text-[10px] text-zinc-500">{o.gst_rate ?? "—"}%</p></td>
                  <td className="px-4 py-3 font-mono">{inr(o.total)}{o.coupon_code && <p className="text-[10px] text-zinc-500">{o.coupon_code}</p>}</td>
                  <td className={`px-4 py-3 font-mono text-xs uppercase ${TONE[o.status]}`}>{o.status}<p className="text-zinc-500">{o.payment_method}</p></td>
                  <td className="px-4 py-3">
                    {o.status === "paid" ? (
                      <Select value={o.fulfillment} onValueChange={(v) => fulfil(o, v)}>
                        <SelectTrigger data-testid={`admin-fulfil-${o.order_number}`} className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FULFIL.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.status === "paid" && (o.invoice_token ? (
                      <Link to={`/invoice/${o.invoice_token}`} target="_blank" data-testid={`admin-view-invoice-${o.order_number}`} className="p-2 inline-block rounded-full hover:bg-white/5" title={o.invoice?.number}>
                        <FileText className="w-3.5 h-3.5 text-[#B0CB1F]" />
                      </Link>
                    ) : null)}
                    {o.status === "paid" && (
                      <button data-testid={`admin-send-invoice-${o.order_number}`} onClick={() => sendInvoice(o)} className="text-[10px] font-mono uppercase px-2 py-1 rounded-full border border-[#2A3647] hover:border-[#B0CB1F]" title={`WhatsApp: ${o.whatsapp_status || "not sent"}`}>
                        {o.invoice_token ? "Resend" : "Invoice"}
                      </button>
                    )}
                    <button data-testid={`admin-delete-order-${o.order_number}`} onClick={() => del(o)} className="p-2 rounded-full hover:bg-rose-500/10">
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
