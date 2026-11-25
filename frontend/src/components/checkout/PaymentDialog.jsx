import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useApi, inr, errMsg } from "@/lib/api";

const LABEL = { upi: "UPI", card: "Card", netbanking: "Net Banking" };

export default function PaymentDialog({ order, onClose, onDone }) {
  const api = useApi();
  const [busy, setBusy] = useState(null);
  const pay = async (outcome) => {
    setBusy(outcome);
    try {
      await api.post(`/payments/simulate/${order.id}`, { outcome });
      toast[outcome === "success" ? "success" : "error"](outcome === "success" ? "Payment verified — order confirmed!" : "Payment failed. Units released.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
      onDone();
    }
  };
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent data-testid="payment-dialog" className="bg-[#1C2635] border-[#2A3647] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Test payment gateway</DialogTitle>
          <DialogDescription>
            Simulated checkout — no real money moves. Confirmation is processed server-side just like a gateway webhook.
          </DialogDescription>
        </DialogHeader>
        {order && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#2A3647] p-4 flex justify-between items-center">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{LABEL[order.payment_method]} · {order.order_number}</p>
                <p className="text-sm mt-1">{order.product_name}</p>
              </div>
              <p data-testid="payment-dialog-amount" className="font-mono text-2xl font-bold text-[#B0CB1F]">{inr(order.total)}</p>
            </div>
            <button data-testid="payment-simulate-success-btn" disabled={!!busy} onClick={() => pay("success")}
              className="w-full rounded-full py-3.5 font-bold bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A] flex items-center justify-center gap-2 disabled:opacity-50">
              {busy === "success" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Pay {inr(order.total)}
            </button>
            <button data-testid="payment-simulate-failure-btn" disabled={!!busy} onClick={() => pay("failure")}
              className="w-full rounded-full py-3 text-sm border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-50">
              {busy === "failure" ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Simulate a failed payment"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
