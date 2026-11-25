import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, useMe, inr, fmtDate, imgUrl, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import OrderStepper from "@/components/OrderStepper";

const Referral = ({ me }) => {
  const link = `${window.location.origin}/?ref=${me.referral_code}`;
  const copy = () => navigator.clipboard.writeText(link).then(() => toast.success("Referral link copied"));
  return (
    <section data-testid="referral-panel" className="rounded-2xl border border-[#B0CB1F]/30 bg-[#B0CB1F]/[0.06] p-6 space-y-4">
      <div className="flex items-center gap-2"><Gift className="w-4 h-4 text-[#B0CB1F]" /><h2 className="font-bold">Refer &amp; earn</h2></div>
      <p className="text-sm text-zinc-400">Share the live deal. When a friend completes their first paid order, you get {inr(me.referral_reward)} credit for your next Dealwills purchase.</p>
      <div className="flex gap-2">
        <Input readOnly value={link} data-testid="referral-link-input" className="font-mono text-xs" />
        <button data-testid="referral-copy-btn" onClick={copy} className="px-3 rounded-md bg-white text-black"><Copy className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div><p data-testid="referral-credit" className="font-mono text-2xl font-bold">{inr(me.referral_credit)}</p><p className="text-xs text-zinc-500">Available credit</p></div>
        <div><p data-testid="referral-count" className="font-mono text-2xl font-bold">{me.referrals_count}</p><p className="text-xs text-zinc-500">Successful referrals</p></div>
      </div>
    </section>
  );
};

const Profile = ({ me }) => {
  const api = useApi();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", phone: "" });
  useEffect(() => { setF({ name: me.name || "", phone: me.phone || "" }); }, [me]);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/me", f);
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile saved");
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <form onSubmit={save} data-testid="profile-form" className="rounded-2xl border border-[#2A3647] bg-[#1C2635] p-6 space-y-3">
      <h2 className="font-bold">Your details</h2>
      <p className="text-xs text-zinc-500 font-mono">{me.email}</p>
      <Input data-testid="profile-name-input" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      <Input data-testid="profile-phone-input" placeholder="Mobile number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
      <button data-testid="profile-save-btn" className="w-full rounded-full py-2.5 text-sm font-semibold bg-white text-black hover:bg-[#B0CB1F] text-[#141B26] hover: transition-colors">Save</button>
    </form>
  );
};

export default function Account() {
  const api = useApi();
  const { data: me } = useMe();
  const { data: orders, isLoading } = useQuery({ queryKey: ["my-orders"], queryFn: async () => (await api.get("/orders/mine")).data });
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 grid lg:grid-cols-[1.6fr_1fr] gap-10">
      <section>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">My orders</h1>
        <div className="mt-8 space-y-4" data-testid="my-orders-list">
          {isLoading && <Loader2 className="w-5 h-5 animate-spin text-[#B0CB1F]" />}
          {orders?.length === 0 && <p className="text-zinc-500">No orders yet. <Link to="/" className="text-[#B0CB1F]">See today's deal →</Link></p>}
          {orders?.map((o) => (
            <div key={o.id} data-testid={`my-order-${o.order_number}`} className="rounded-2xl border border-[#2A3647] bg-[#1C2635] p-5 space-y-4">
              <div className="flex gap-4 items-start">
                {o.product_image && <img src={imgUrl(o.product_image)} alt="" className="w-16 h-16 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{o.product_name}</p>
                  <p className="font-mono text-xs text-zinc-500">{o.order_number} · {fmtDate(o.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold">{inr(o.total)}</p>
                  <p className="font-mono text-xs text-zinc-500">QTY {o.qty}</p>
                </div>
              </div>
              <OrderStepper order={o} testId={`my-order-status-${o.order_number}`} />
              {o.invoice_token && (
                <Link to={`/invoice/${o.invoice_token}`} className="inline-block text-sm text-[#B0CB1F] mr-4" data-testid={`my-order-invoice-${o.order_number}`}>GST invoice {o.invoice?.number} →</Link>
              )}
              {o.status === "pending" && (
                <Link to={`/checkout/${o.id}`} className="inline-block text-sm text-[#B0CB1F]" data-testid={`resume-checkout-${o.order_number}`}>Resume checkout →</Link>
              )}
            </div>
          ))}
        </div>
      </section>
      <aside className="space-y-6">
        {me && <Referral me={me} />}
        {me && <Profile me={me} />}
      </aside>
    </div>
  );
}
