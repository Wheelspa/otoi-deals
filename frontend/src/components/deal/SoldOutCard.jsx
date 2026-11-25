import { Trophy } from "lucide-react";
import { BACKEND_URL } from "@/lib/api";
import { fmtDuration } from "@/lib/storyCard";
import StoryCard from "./StoryCard";
import DropAlert from "./DropAlert";

export default function SoldOutCard({ deal, next }) {
  if (deal.display_status !== "SOLD_OUT") return null;
  const took = deal.sold_in_seconds ? fmtDuration(deal.sold_in_seconds) : null;
  const text = `🏁 ${deal.name} just SOLD OUT on Dealwills${took ? ` in ${took}` : ""}! All ${deal.total_qty} units gone at ${deal.discount_percent}% off.\nThe next drop is coming — don't miss it:\n${BACKEND_URL}/api/share/deal`;
  return (
    <div data-testid="sold-out-celebration-card" className="rounded-2xl border border-[#B0CB1F]/40 bg-gradient-to-br from-[#B0CB1F]/15 via-[#121215] to-[#121215] p-6 space-y-5 rise">
      <div className="flex items-start gap-4">
        <span className="w-11 h-11 rounded-full bg-[#B0CB1F] text-[#141B26] grid place-items-center shrink-0"><Trophy className="w-5 h-5" /></span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#B0CB1F]">Drop #{String(deal.drop_number || 1).padStart(3, "0")} · Sold out</p>
          <p data-testid="sold-out-duration" className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">
            {took ? <>Gone in <span className="text-[#B0CB1F]">{took}</span></> : "All units gone"}
          </p>
          <p className="text-sm text-zinc-400 mt-1">{deal.total_qty} unit{deal.total_qty === 1 ? "" : "s"} claimed. Thank you, Dealwills fam — share the win.</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <a data-testid="sold-out-share-whatsapp-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center rounded-full py-3 text-sm font-semibold border border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10 transition-colors">
          Share on WhatsApp
        </a>
        <StoryCard deal={deal} label="Sold-out story" />
      </div>
      {!next && <DropAlert />}
    </div>
  );
}
