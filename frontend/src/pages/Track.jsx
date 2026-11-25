import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { publicApi, inr, fmtDate, imgUrl, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import OrderStepper from "@/components/OrderStepper";

export default function Track() {
  const [f, setF] = useState({ order_number: "", phone: "" });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(""); setRes(null);
    try { setRes((await publicApi.post("/track", f)).data); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-14">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F]">Track order</p>
      <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">Where's my drop?</h1>
      <form onSubmit={submit} className="mt-8 grid sm:grid-cols-[1fr_1fr_auto] gap-3">
        <Input data-testid="track-order-input" placeholder="Order number e.g. OT260601…" required value={f.order_number}
          onChange={(e) => setF({ ...f, order_number: e.target.value })} />
        <Input data-testid="track-phone-input" placeholder="Mobile used at checkout" required value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <button data-testid="track-order-submit-btn" className="px-5 rounded-md bg-[#B0CB1F] text-[#141B26] font-semibold flex items-center justify-center gap-2 py-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Track
        </button>
      </form>
      {err && <p data-testid="track-error" className="mt-5 text-sm text-rose-400">{err}</p>}
      {res && (
        <div data-testid="track-result" className="mt-8 rounded-2xl border border-[#2A3647] bg-[#1C2635] p-6 space-y-5">
          <div className="flex gap-4">
            {res.product_image && <img src={imgUrl(res.product_image)} alt="" className="w-16 h-16 rounded-lg object-cover" />}
            <div className="flex-1">
              <p className="font-semibold">{res.product_name}</p>
              <p className="font-mono text-xs text-zinc-500">{res.order_number} · {fmtDate(res.created_at)}</p>
            </div>
            <p className="font-mono font-bold">{inr(res.total)}</p>
          </div>
          <OrderStepper order={res} testId="track-status" />
        </div>
      )}
    </div>
  );
}
