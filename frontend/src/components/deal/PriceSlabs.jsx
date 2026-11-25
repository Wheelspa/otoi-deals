import { inr } from "@/lib/api";

export default function PriceSlabs({ deal }) {
  if (deal.slabs.length < 2) return null;
  const position = deal.sold + deal.reserved;
  let acc = 0;
  return (
    <div data-testid="price-slabs-container" className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-3">Price rises as units sell</p>
      <div className="flex flex-col sm:flex-row gap-2">
        {deal.slabs.map((s, i) => {
          const from = acc; acc += s.qty;
          const state = position >= acc ? "done" : position >= from ? "current" : "next";
          return (
            <div key={i} data-testid={`price-slab-${i}`}
              className={`flex-1 rounded-lg px-3 py-2.5 border transition-colors ${state === "current" ? "border-[#B0CB1F] bg-[#B0CB1F]/10" : "border-[#2A3647]"} ${state === "done" ? "opacity-40 line-through" : ""}`}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                {i === 0 ? "First" : "Next"} {s.qty} {state === "current" && <span className="text-[#B0CB1F]">· Now</span>}
              </p>
              <p className="font-mono text-lg font-bold">{inr(s.price)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
