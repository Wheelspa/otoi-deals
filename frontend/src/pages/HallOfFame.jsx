import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy, Zap } from "lucide-react";
import { publicApi, inr, imgUrl } from "@/lib/api";
import { fmtDuration } from "@/lib/storyCard";
import StatusBadge from "@/components/deal/StatusBadge";

const Stat = ({ label, value, testId }) => (
  <div className="bg-[#141B26] p-6">
    <p data-testid={testId} className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight">{value}</p>
    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
  </div>
);

const DropCard = ({ d, fastest }) => (
  <article data-testid={`hall-drop-${d.drop_number}`} className="group rounded-2xl border border-[#2A3647] bg-[#1C2635] overflow-hidden hover:border-zinc-600 transition-colors">
    <div className="relative aspect-[4/3] overflow-hidden">
      {d.images?.[0] && <img src={imgUrl(d.images[0])} alt={d.name} className="w-full h-full object-cover grayscale-[60%] group-hover:grayscale-0 group-hover:scale-105 transition-[filter,transform] duration-700" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      <StatusBadge status={d.display_status} testId={`hall-drop-status-${d.drop_number}`} className="absolute top-3 left-3 !bg-black/75" />
      {fastest && (
        <span className="absolute top-3 right-3 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-[#B0CB1F] text-[#141B26] ">
          <Zap className="w-3 h-3 fill-current" /> Fastest
        </span>
      )}
      <p className="absolute bottom-3 left-4 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-300">Drop #{String(d.drop_number).padStart(3, "0")}</p>
    </div>
    <div className="p-5 space-y-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{d.category}</p>
        <h3 className="mt-1 font-bold text-lg leading-snug">{d.name}</h3>
      </div>
      <p data-testid={`hall-drop-time-${d.drop_number}`} className="font-display text-2xl font-extrabold">
        {d.sold_in_seconds ? <>Sold out in <span className="text-[#B0CB1F]">{fmtDuration(d.sold_in_seconds)}</span></>
          : <span className="text-zinc-400">{d.sold} of {d.total_qty} sold</span>}
      </p>
      <div className="h-1.5 rounded-full bg-[#101620] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#E1EE8E] via-[#B0CB1F] to-[#7E9A12]" style={{ width: `${Math.min(100, d.percent_sold)}%` }} />
      </div>
      <div className="flex justify-between font-mono text-xs text-zinc-400">
        <span>{inr(d.best_price)} <span className="line-through text-zinc-600">{inr(d.original_price)}</span></span>
        <span className="text-[#B0CB1F]">{d.discount_percent}% OFF</span>
      </div>
    </div>
  </article>
);

export default function HallOfFame() {
  const { data, isLoading } = useQuery({ queryKey: ["past-drops"], queryFn: async () => (await publicApi.get("/drops/past")).data });
  const st = data?.stats;
  const fastest = st?.fastest_seconds;
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 space-y-12">
      <header className="max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F] flex items-center gap-2"><Trophy className="w-3.5 h-3.5" /> Hall of Fame</p>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[0.95]">Every drop. Every sellout. On the record.</h1>
        <p className="mt-4 text-zinc-400">Real numbers from confirmed orders only. Once a drop is gone, it never comes back.</p>
      </header>
      {isLoading && <Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" />}
      {st && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#2A3647] rounded-2xl overflow-hidden border border-[#2A3647]" data-testid="hall-stats">
          <Stat label="Drops completed" value={st.completed} testId="hall-stat-completed" />
          <Stat label="Units claimed" value={st.units_sold} testId="hall-stat-units" />
          <Stat label="Fastest sellout" value={fastest ? fmtDuration(fastest) : "—"} testId="hall-stat-fastest" />
          <Stat label="Saved by customers" value={inr(st.customer_savings)} testId="hall-stat-savings" />
        </div>
      )}
      {data?.drops.length === 0 && (
        <div data-testid="hall-empty" className="rounded-2xl border border-dashed border-[#2A3647] p-12 text-center">
          <p className="font-display text-2xl font-bold">The first legend is being written.</p>
          <p className="mt-2 text-zinc-500">Sold-out drops land here with their sell-out time.</p>
          <Link to="/" className="mt-6 inline-block px-5 py-2.5 rounded-full bg-[#B0CB1F] text-[#141B26] font-semibold text-sm">See today's deal</Link>
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="hall-drops-grid">
        {data?.drops.map((d) => <DropCard key={d.id} d={d} fastest={fastest && d.sold_in_seconds === fastest} />)}
      </div>
    </div>
  );
}
