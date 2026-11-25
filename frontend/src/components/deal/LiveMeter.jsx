export default function LiveMeter({ deal, connected }) {
  const pct = Math.min(100, deal.percent_sold);
  const isLive = deal.status === "live" && deal.remaining > 0;
  return (
    <div data-testid="live-purchase-meter-container"
      className="rounded-2xl border border-[#B0CB1F]/30 bg-gradient-to-b from-[#B0CB1F]/[0.07] to-transparent p-5 sm:p-6 shadow-[0_0_40px_-12px_rgba(176,203,31,0.45)]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p data-testid="meter-offer-heading" className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#B0CB1F]">
          Special offer — first {deal.total_qty} units only
        </p>
        <span data-testid="meter-live-indicator" className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          <span className={`w-1.5 h-1.5 rounded-full ${isLive && connected ? "bg-emerald-400 ticker-dot" : "bg-zinc-600"}`} />
          {!isLive ? "Closed" : connected ? "Live" : "Syncing"}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span data-testid="meter-percent-sold" className="font-mono text-5xl sm:text-6xl font-extrabold tracking-tighter leading-none">
          {pct % 1 === 0 ? pct : pct.toFixed(1)}<span className="text-2xl text-zinc-500">%</span>
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 pb-1">Sold</span>
      </div>
      <div className="mt-4 h-4 rounded-full bg-[#101620] border border-[#2A3647] p-0.5" data-testid="meter-progress-bar"
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="meter-fill h-full rounded-full bg-gradient-to-r from-[#E1EE8E] via-[#B0CB1F] to-[#7E9A12]"
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>
      <div className="mt-5 grid grid-cols-3 divide-x divide-[#2A3647] text-center">
        <Stat testId="meter-units-sold" value={deal.sold} label="Purchased" />
        <Stat testId="meter-units-remaining" value={deal.remaining} label="Units left" accent />
        <Stat testId="meter-units-total" value={deal.total_qty} label="Initial stock" />
      </div>
      {deal.reserved > 0 && deal.remaining > 0 && (
        <p data-testid="meter-reserved-note" className="mt-4 text-xs text-zinc-500 text-center">
          {deal.reserved} unit{deal.reserved > 1 ? "s" : ""} currently held in checkout
        </p>
      )}
    </div>
  );
}

const Stat = ({ value, label, accent, testId }) => (
  <div className="px-2">
    <p data-testid={testId} className={`font-mono text-2xl sm:text-3xl font-bold ${accent ? "text-[#B0CB1F]" : "text-white"}`}>{value}</p>
    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
  </div>
);
