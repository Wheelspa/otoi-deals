import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { Minus, Plus, Zap, Loader2, Timer } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useApi, errMsg } from "@/lib/api";
import { useCountdown } from "@/hooks/useDeal";
import EarlyAccessBanner from "./EarlyAccessBanner";

export default function BuyBox({ deal }) {
  const [qty, setQty] = useState(deal.min_qty);
  const [busy, setBusy] = useState(false);
  const { isSignedIn } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const ends = useCountdown(deal.end_at);
  const { data: mine } = useQuery({
    queryKey: ["my-orders"], enabled: !!isSignedIn,
    queryFn: async () => (await api.get("/orders/mine")).data,
  });
  const bought = (mine || []).filter((o) => o.product_id === deal.id && o.status === "paid").reduce((a, o) => a + o.qty, 0);
  const allowance = deal.max_qty - bought;
  const early = useCountdown(deal.early_access_until);
  const earlyOn = !!deal.early_access_until && early?.ms > 0;
  const { data: ea } = useQuery({
    queryKey: ["early-access", deal.id, deal.early_access_until], enabled: !!isSignedIn && earlyOn,
    queryFn: async () => (await api.get("/deal/early-access")).data,
  });
  const locked = earlyOn && isSignedIn && ea && ea.active && !ea.eligible;
  const live = deal.status === "live" && deal.remaining > 0;
  const canBuy = live && deal.available >= qty && allowance >= qty && !locked;
  const maxQ = Math.max(deal.min_qty, Math.min(allowance, deal.available || deal.max_qty));

  const buy = async () => {
    if (!isSignedIn) return navigate("/sign-in");
    setBusy(true);
    try {
      const { data } = await api.post("/orders/reserve", {
        product_id: deal.id, qty, ref_code: localStorage.getItem("otoi_ref") || undefined,
      });
      navigate(`/checkout/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e, "Could not reserve stock"));
    } finally {
      setBusy(false);
    }
  };

  const label = {
    SOLD_OUT: "Sold Out", OFFER_EXPIRED: "Offer Expired", PAUSED: "Deal Paused", COMING_SOON: "Coming Soon",
  }[deal.display_status] || (locked ? `Opens to everyone in ${early.short}` : null)
    || (live && allowance < deal.min_qty ? "Purchase limit reached" : null);

  return (
    <div className="space-y-3">
      {earlyOn && live && <EarlyAccessBanner countdown={early.short} eligible={ea?.eligible} signedIn={isSignedIn} hasPhone={ea?.has_phone} />}
      {live && (
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Qty</span>
          <div className="flex items-center rounded-full border border-[#2A3647]">
            <button data-testid="qty-decrease-btn" className="p-2.5 disabled:opacity-30" disabled={qty <= deal.min_qty}
              onClick={() => setQty(qty - 1)}><Minus className="w-4 h-4" /></button>
            <span data-testid="qty-value" className="font-mono w-8 text-center font-bold">{qty}</span>
            <button data-testid="qty-increase-btn" className="p-2.5 disabled:opacity-30" disabled={qty >= maxQ}
              onClick={() => setQty(qty + 1)}><Plus className="w-4 h-4" /></button>
          </div>
          <span className="text-xs text-zinc-500">Max {deal.max_qty} per customer</span>
        </div>
      )}
      <button data-testid="btn-buy-now-hero" onClick={buy} disabled={!canBuy || busy}
        className="w-full flex items-center justify-center gap-3 rounded-full py-5 text-lg font-display font-extrabold uppercase tracking-wider bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A]  cta-glow active:scale-[0.98] transition-[background-color,transform] disabled:bg-[#2A3647] disabled:text-zinc-500 disabled:shadow-none disabled:cursor-not-allowed">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : live && <Zap className="w-5 h-5 fill-current" />}
        {label || (live && deal.available === 0 ? "All units held in checkout" : "Buy Now — Grab this deal")}
      </button>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{live ? "Your units are held for 10 minutes at checkout" : ""}</span>
        {ends && ends.ms > 0 && live && (
          <span data-testid="offer-ends-countdown" className="flex items-center gap-1.5 font-mono text-zinc-300">
            <Timer className="w-3.5 h-3.5 text-[#B0CB1F]" /> Ends in {ends.label}
          </span>
        )}
      </div>
    </div>
  );
}
