import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Timer, CheckCircle2, XCircle, Smartphone, CreditCard, Landmark } from "lucide-react";
import { toast } from "sonner";
import { useApi, useMe, inr, errMsg, imgUrl } from "@/lib/api";
import { useCountdown } from "@/hooks/useDeal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import PaymentDialog from "@/components/checkout/PaymentDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDIAN_STATES, taxTotals } from "@/lib/gst";

const METHODS = [["upi", "UPI", Smartphone], ["card", "Debit / Credit Card", CreditCard], ["netbanking", "Net Banking", Landmark]];
const FIELDS = [["line1", "Address line 1"], ["line2", "Address line 2 (optional)"], ["city", "City"], ["state", "State"], ["pincode", "PIN code"]];

const Result = ({ order }) => {
  const ok = order.status === "paid";
  return (
    <div data-testid="checkout-result" className="max-w-lg mx-auto text-center py-20 px-4">
      {ok ? <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-400" /> : <XCircle className="w-14 h-14 mx-auto text-rose-400" />}
      <h1 className="mt-6 text-4xl font-extrabold tracking-tight">{ok ? "Order confirmed" : `Order ${order.status}`}</h1>
      <p className="mt-3 text-zinc-400">
        {ok ? "Payment verified on our server. A confirmation SMS is on its way." : "No money was taken and the reserved units were released."}
      </p>
      <p data-testid="checkout-order-number" className="mt-6 font-mono text-2xl font-bold text-[#B0CB1F]">{order.order_number}</p>
      {ok && <p className="mt-1 text-sm text-zinc-500">{order.qty} × {order.product_name} · {inr(order.total)}</p>}
      {ok && order.invoice_token && (
        <p className="mt-3 text-sm text-zinc-400">GST invoice {order.invoice?.number} sent to your WhatsApp ·{" "}
          <Link to={`/invoice/${order.invoice_token}`} data-testid="checkout-view-invoice-link" className="text-[#B0CB1F] underline">View invoice</Link></p>
      )}
      <div className="mt-8 flex gap-3 justify-center">
        <Link to="/account" data-testid="checkout-view-orders-btn" className="px-5 py-2.5 rounded-full bg-white text-black font-semibold text-sm">My orders</Link>
        <Link to="/" data-testid="checkout-back-home-btn" className="px-5 py-2.5 rounded-full border border-zinc-700 text-sm">Back to deal</Link>
      </div>
    </div>
  );
};

export default function Checkout() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: order, refetch } = useQuery({ queryKey: ["order", id], queryFn: async () => (await api.get(`/orders/${id}`)).data });
  const cd = useCountdown(order?.expires_at);
  const [form, setForm] = useState({ customer_name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [coupon, setCoupon] = useState({ code: "", applied: null });
  const [useCredit, setUseCredit] = useState(false);
  const [method, setMethod] = useState("upi");
  const [busy, setBusy] = useState(false);
  const [payOrder, setPayOrder] = useState(null);

  useEffect(() => {
    if (me) setForm((f) => ({ ...f, customer_name: f.customer_name || me.name || "", phone: f.phone || me.phone || "" }));
  }, [me]);
  useEffect(() => {
    if (order?.status === "pending" && cd && cd.ms === 0) setTimeout(refetch, 6000);
  }, [cd?.ms, order?.status, refetch]); // eslint-disable-line

  if (!order) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" /></div>;
  if (order.status !== "pending") return <Result order={order} />;

  const credit = useCredit ? Math.min(me?.referral_credit || 0, Math.max(order.subtotal - (coupon.applied?.discount || 0) - 1, 0)) : 0;
  const delivery = order.delivery_charge || 0;
  const rate = order.gst_rate ?? 18;
  const { taxable, gst, total } = taxTotals(order.subtotal, coupon.applied?.discount || 0, credit, delivery, rate);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const applyCoupon = async () => {
    try {
      const { data } = await api.post("/coupons/validate", { code: coupon.code, order_id: id });
      setCoupon({ code: data.code, applied: data });
      toast.success(`Coupon applied — you save ${inr(data.discount)}`);
    } catch (e) {
      setCoupon({ ...coupon, applied: null });
      toast.error(errMsg(e));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.state) return toast.error("Please select your state");
    setBusy(true);
    try {
      const { customer_name, phone, ...address } = form;
      const { data } = await api.post(`/orders/${id}/checkout`, {
        customer_name, phone, address, coupon_code: coupon.applied?.code || null, use_credit: useCredit, payment_method: method,
      });
      setPayOrder(data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const onPaid = async () => {
    setPayOrder(null);
    await refetch();
    qc.invalidateQueries({ queryKey: ["deal"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["my-orders"] });
  };

  const cancel = async () => {
    await api.post(`/orders/${id}/cancel`).catch(() => {});
    qc.invalidateQueries({ queryKey: ["deal"] });
    navigate("/");
  };

  const urgent = cd && cd.ms < 180000;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
      <div data-testid="checkout-reservation-timer"
        className={`sticky top-[68px] z-30 flex items-center justify-between gap-3 rounded-xl px-5 py-3 border backdrop-blur-xl ${urgent ? "bg-rose-500/15 border-rose-500/40" : "bg-[#B0CB1F]/10 border-[#B0CB1F]/30"}`}>
        <span className="flex items-center gap-2 text-sm"><Timer className="w-4 h-4 text-[#B0CB1F]" /> Stock reserved for you</span>
        <span data-testid="checkout-timer-value" className="font-mono text-xl font-bold">{cd?.short}</span>
      </div>
      <form onSubmit={submit} className="mt-8 grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-lg font-bold">Delivery details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name"><Input required data-testid="checkout-name-input" value={form.customer_name} onChange={set("customer_name")} /></Field>
              <Field label="Mobile number"><Input required data-testid="checkout-phone-input" inputMode="tel" placeholder="10-digit mobile" value={form.phone} onChange={set("phone")} /></Field>
              {FIELDS.map(([k, l]) => k === "state" ? (
                <Field key={k} label={l}>
                  <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                    <SelectTrigger data-testid="checkout-state-select"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field key={k} label={l} wide={k.startsWith("line")}>
                  <Input data-testid={`checkout-${k}-input`} required={k !== "line2"} value={form[k]} onChange={set(k)}
                    maxLength={k === "pincode" ? 6 : undefined} inputMode={k === "pincode" ? "numeric" : undefined} />
                </Field>
              ))}
            </div>
          </section>
          <section className="space-y-4">
            <h2 className="text-lg font-bold">Payment method</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {METHODS.map(([k, l, I]) => (
                <button type="button" key={k} data-testid={`checkout-payment-method-${k}`} onClick={() => setMethod(k)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-colors ${method === k ? "border-[#B0CB1F] bg-[#B0CB1F]/10" : "border-[#2A3647] hover:border-zinc-600"}`}>
                  <I className="w-4 h-4 text-[#B0CB1F]" /> {l}
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="rounded-2xl border border-[#2A3647] bg-[#1C2635] p-6 h-fit space-y-5 lg:sticky lg:top-36">
          <div className="flex gap-4">
            {order.product_image && <img src={imgUrl(order.product_image)} alt="" className="w-20 h-20 rounded-lg object-cover" />}
            <div>
              <p data-testid="checkout-product-name" className="font-semibold leading-snug">{order.product_name}</p>
              <p data-testid="checkout-qty-select" className="mt-1 font-mono text-xs text-zinc-500">QTY {order.qty}</p>
              {order.lines.map((l) => <p key={l.price} className="font-mono text-xs text-zinc-500">{l.qty} × {inr(l.price)}</p>)}
            </div>
          </div>
          <div className="flex gap-2">
            <Input data-testid="checkout-coupon-input" placeholder="Coupon code" value={coupon.code}
              onChange={(e) => setCoupon({ code: e.target.value.toUpperCase(), applied: null })} />
            <button type="button" data-testid="checkout-apply-coupon-btn" onClick={applyCoupon} disabled={!coupon.code}
              className="px-4 rounded-md border border-zinc-700 text-sm hover:border-[#B0CB1F] disabled:opacity-40">Apply</button>
          </div>
          {(me?.referral_credit || 0) > 0 && (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox data-testid="checkout-use-credit-checkbox" checked={useCredit} onCheckedChange={(v) => setUseCredit(!!v)} />
              Use referral credit ({inr(me.referral_credit)})
            </label>
          )}
          <dl className="space-y-2 text-sm border-t border-[#2A3647] pt-4">
            <Row l="Original price" v={inr(order.original_price * order.qty)} muted strike />
            <Row l="Dealwills price" v={inr(order.subtotal)} />
            {coupon.applied && <Row l={`Coupon ${coupon.applied.code}`} v={`− ${inr(coupon.applied.discount)}`} accent testId="checkout-coupon-discount" />}
            {credit > 0 && <Row l="Referral credit" v={`− ${inr(credit)}`} accent />}
            <Row l="Delivery charges" v={inr(delivery)} testId="checkout-delivery-charge" />
            <Row l="Taxable value" v={inr(taxable)} />
            <Row l={`GST @ ${rate}%`} v={`+ ${inr(gst)}`} testId="checkout-gst-amount" />
            <div className="flex justify-between pt-3 border-t border-[#2A3647]">
              <dt className="font-semibold">Total</dt>
              <dd data-testid="checkout-total" className="font-mono text-2xl font-extrabold text-[#B0CB1F]">{inr(total)}</dd>
            </div>
          </dl>
          <button type="submit" data-testid="checkout-submit-order-btn" disabled={busy}
            className="w-full rounded-full py-4 font-display font-extrabold uppercase tracking-wider bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A] cta-glow active:scale-[0.98] transition-[background-color,transform] disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `Pay ${inr(total)}`}
          </button>
          <button type="button" data-testid="checkout-cancel-btn" onClick={cancel} className="w-full text-xs text-zinc-500 hover:text-white">
            Cancel and release my units
          </button>
        </aside>
      </form>
      <PaymentDialog order={payOrder} onClose={() => setPayOrder(null)} onDone={onPaid} />
    </div>
  );
}

const Field = ({ label, children, wide }) => (
  <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}><Label className="text-xs text-zinc-400">{label}</Label>{children}</div>
);
const Row = ({ l, v, muted, strike, accent, testId }) => (
  <div className="flex justify-between">
    <dt className="text-zinc-400">{l}</dt>
    <dd data-testid={testId} className={`font-mono ${muted ? "text-zinc-500" : ""} ${strike ? "line-through" : ""} ${accent ? "text-emerald-400" : ""}`}>{v}</dd>
  </div>
);
