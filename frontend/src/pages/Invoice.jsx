import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Printer } from "lucide-react";
import { API, publicApi } from "@/lib/api";
import BrandLogo from "@/components/layout/BrandLogo";

const n = (v) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Row = ({ l, v, bold }) => (
  <div className={`flex justify-between py-1.5 ${bold ? "font-bold" : ""}`}><span>{l}</span><span className="font-mono">{v}</span></div>
);

export default function Invoice() {
  const { token } = useParams();
  const { data: inv, isError } = useQuery({ queryKey: ["invoice", token], queryFn: async () => (await publicApi.get(`/invoices/${token}`)).data });
  if (isError) return <p data-testid="invoice-not-found" className="text-center py-24 text-zinc-400">Invoice not found.</p>;
  if (!inv) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" /></div>;
  const s = inv.seller, b = inv.buyer, a = b.address || {};
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 print:p-0">
      <div className="flex justify-end gap-2 mb-4 print:hidden">
        <button data-testid="invoice-print-btn" onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#2A3647] text-sm"><Printer className="w-4 h-4" /> Print</button>
        <a data-testid="invoice-download-pdf-btn" href={`${API}/invoices/${token}/pdf`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#B0CB1F] text-[#141B26] text-sm font-semibold"><Download className="w-4 h-4" /> Download PDF</a>
      </div>
      <div data-testid="invoice-document" className="bg-white text-[#303D4E] rounded-2xl p-6 sm:p-10 text-sm shadow-2xl print:shadow-none print:rounded-none">
        <div className="flex flex-wrap justify-between gap-6">
          <div>
            <div className="[&_span]:!text-[#303D4E]"><BrandLogo size="text-3xl" tagline={false} /></div>
            <p className="mt-3 font-bold">{s.legal_name}</p>
            <p>GSTIN: <span data-testid="invoice-seller-gstin" className="font-mono">{s.gstin}</span></p>
            {s.address && <p className="max-w-xs">{s.address}</p>}
            <p>State: {s.state}</p>
            {(s.phone || s.email) && <p>{[s.phone, s.email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tight">TAX INVOICE</p>
            <p className="mt-2">Invoice No: <b data-testid="invoice-number" className="font-mono">{inv.number}</b></p>
            <p>Date: {new Date(inv.date).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
            <p>Order: <span className="font-mono">{inv.order_number}</span></p>
          </div>
        </div>
        <div className="mt-8 grid sm:grid-cols-2 gap-6 border-t border-zinc-200 pt-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Bill to / Ship to</p>
            <p className="mt-1 font-semibold">{b.name}</p>
            <p>{a.line1}{a.line2 && `, ${a.line2}`}</p>
            <p>{a.city}, {a.state} – {a.pincode}</p>
            <p>Phone: {b.phone}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Place of supply</p>
            <p className="mt-1">{inv.place_of_supply} {b.state_code && `(${b.state_code})`}</p>
            <p>Payment: {(inv.payment_method || "").toUpperCase()}</p>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead className="bg-[#303D4E] text-white text-left text-xs">
              <tr><th className="p-2">Description</th><th className="p-2">HSN/SAC</th><th className="p-2">Qty</th><th className="p-2">Rate</th><th className="p-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-b border-zinc-200">
                  <td className="p-2">{it.description}</td><td className="p-2 font-mono">{it.hsn || "—"}</td><td className="p-2 font-mono">{it.qty}</td>
                  <td className="p-2 font-mono">{n(it.unit_price)}</td><td className="p-2 font-mono text-right">{n(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs">
          <Row l="Subtotal" v={n(inv.subtotal)} />
          {inv.coupon_discount > 0 && <Row l={`Coupon ${inv.coupon_code}`} v={`− ${n(inv.coupon_discount)}`} />}
          {inv.credit_used > 0 && <Row l="Referral credit" v={`− ${n(inv.credit_used)}`} />}
          <Row l="Delivery charges" v={n(inv.delivery_charge)} />
          <Row l="Taxable value" v={n(inv.taxable_value)} bold />
          {inv.intra_state ? (
            <><Row l={`CGST @ ${inv.gst_rate / 2}%`} v={n(inv.cgst)} /><Row l={`SGST @ ${inv.gst_rate / 2}%`} v={n(inv.sgst)} /></>
          ) : <Row l={`IGST @ ${inv.gst_rate}%`} v={n(inv.igst)} />}
          <div data-testid="invoice-grand-total" className="mt-2 flex justify-between bg-[#303D4E] text-white rounded-md px-3 py-2 font-bold">
            <span>Grand Total</span><span className="font-mono">₹{n(inv.total)}</span>
          </div>
        </div>
        <p className="mt-10 text-xs text-zinc-500">This is a computer-generated invoice and does not require a signature.</p>
      </div>
    </div>
  );
}
