import { Activity as ActivityIcon } from "lucide-react";
import { timeAgo } from "@/lib/api";

export default function Activity({ deal, activity }) {
  const recent = activity?.recent || [];
  return (
    <section data-testid="live-activity-feed" className="rounded-2xl border border-[#2A3647] bg-[#1C2635] p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <ActivityIcon className="w-4 h-4 text-[#B0CB1F]" />
        <h2 className="text-base md:text-lg font-bold">Purchase activity</h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Confirmed orders only</span>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Metric testId="activity-last-order" value={recent[0] ? `${recent[0].qty}` : "0"}
          label={recent[0] ? `unit${recent[0].qty > 1 ? "s" : ""} bought ${timeAgo(recent[0].paid_at)}` : "no purchases yet"} />
        <Metric testId="activity-last-hour" value={activity?.last_hour_units || 0} label="units in the last hour" />
        <Metric testId="activity-total-sold" value={deal.sold} label="units successfully sold" />
      </div>
      {recent.length > 0 && (
        <ul className="mt-6 border-t border-[#2A3647] pt-4 space-y-2.5">
          {recent.map((r, i) => (
            <li key={i} data-testid={`activity-item-${i}`} className="flex items-center gap-3 text-sm text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {r.qty} unit{r.qty > 1 ? "s" : ""} purchased
              <span className="ml-auto font-mono text-xs text-zinc-600">{timeAgo(r.paid_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const Metric = ({ value, label, testId }) => (
  <div>
    <p data-testid={testId} className="font-mono text-3xl font-bold">{value}</p>
    <p className="mt-1 text-xs text-zinc-500 leading-snug">{label}</p>
  </div>
);
