const STYLES = {
  LIVE_DEAL: ["Live Deal", "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", true],
  LIMITED_STOCK: ["Limited Stock", "bg-amber-500/15 text-amber-400 border-amber-500/30", true],
  ALMOST_SOLD_OUT: ["Almost Sold Out", "bg-orange-500/20 text-orange-300 border-orange-500/40", true],
  SOLD_OUT: ["Sold Out", "bg-[#2A3647] text-zinc-300 border-zinc-700", false],
  OFFER_EXPIRED: ["Offer Expired", "bg-rose-500/15 text-rose-400 border-rose-500/30", false],
  COMING_SOON: ["Coming Soon", "bg-sky-500/15 text-sky-300 border-sky-500/30", false],
  EARLY_ACCESS: ["Early Access", "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40", true],
  PAUSED: ["Paused", "bg-[#2A3647] text-amber-300 border-zinc-700", false],
};

export default function StatusBadge({ status, testId = "product-status-badge", className = "" }) {
  const [label, cls, live] = STYLES[status] || [status, "bg-[#2A3647] text-zinc-300 border-zinc-700", false];
  return (
    <span data-testid={testId}
      className={`inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full border backdrop-blur ${cls} ${className}`}>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-current ticker-dot" />}
      {label}
    </span>
  );
}
