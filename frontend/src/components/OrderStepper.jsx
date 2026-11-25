import { Check } from "lucide-react";

const STEPS = ["placed", "packed", "shipped", "delivered"];

export default function OrderStepper({ order, testId = "order-stepper" }) {
  if (order.status !== "paid") {
    const tone = order.status === "pending" ? "text-amber-400" : "text-rose-400";
    return (
      <p data-testid={testId} className={`font-mono text-xs uppercase tracking-[0.2em] ${tone}`}>
        Payment {order.status === "pending" ? "pending" : order.status} {order.status !== "pending" && "· not charged, stock released"}
      </p>
    );
  }
  const at = STEPS.indexOf(order.fulfillment || "placed");
  return (
    <div data-testid={testId} className="flex items-center">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <span className={`w-6 h-6 rounded-full grid place-items-center border ${i <= at ? "bg-[#B0CB1F] text-[#141B26] border-[#B0CB1F]" : "border-zinc-700"}`}>
              {i <= at && <Check className="w-3.5 h-3.5" />}
            </span>
            <span className={`font-mono text-[9px] uppercase tracking-[0.15em] ${i <= at ? "text-white" : "text-zinc-600"}`}>{s}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`h-px flex-1 mx-1 mb-4 ${i < at ? "bg-[#B0CB1F] text-[#141B26]" : "bg-zinc-800"}`} />}
        </div>
      ))}
    </div>
  );
}
