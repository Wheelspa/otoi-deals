import { Lock } from "lucide-react";
import { imgUrl } from "@/lib/api";
import { useCountdown } from "@/hooks/useDeal";
import DropAlert from "./DropAlert";

export default function NextTeaser({ next }) {
  const cd = useCountdown(next?.start_at);
  if (!next) return null;
  return (
    <section data-testid="next-deal-teaser-card"
      className="relative overflow-hidden rounded-2xl border border-[#2A3647] bg-[#1C2635] grid md:grid-cols-[1fr_1.2fr]">
      <div className="relative h-56 md:h-80 overflow-hidden">
        {next.image && <img src={imgUrl(next.image)} alt="" className="w-full h-full object-cover blur-md scale-110 opacity-60" />}
        <div className="absolute inset-0 grid place-items-center">
          <span className="w-14 h-14 rounded-full bg-black/70 border border-zinc-700 grid place-items-center">
            <Lock className="w-5 h-5 text-[#B0CB1F]" />
          </span>
        </div>
      </div>
      <div className="p-7 sm:p-10 flex flex-col justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F]">Next drop · {next.category || "Mystery"}</p>
        <h3 data-testid="next-deal-name" className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">{next.name}</h3>
        <p className="mt-2 text-sm text-zinc-500">Price revealed at launch. Only one deal is ever live.</p>
        <div className="mt-6">
          {cd && cd.ms > 0 ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Launches in</p>
              <p data-testid="next-deal-countdown" className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tighter mt-1">{cd.label}</p>
            </>
          ) : (
            <p data-testid="next-deal-countdown" className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-300">
              Goes live the moment the current deal closes
            </p>
          )}
        </div>
        <div className="mt-7"><DropAlert /></div>
      </div>
    </section>
  );
}
