import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Loader2, Truck, ShieldCheck, RotateCcw, Crosshair, Tag, Hourglass } from "lucide-react";
import { useDeal, useLiveSync } from "@/hooks/useDeal";
import { inr } from "@/lib/api";
import Gallery from "@/components/deal/Gallery";
import LiveMeter from "@/components/deal/LiveMeter";
import PriceSlabs from "@/components/deal/PriceSlabs";
import BuyBox from "@/components/deal/BuyBox";
import Activity from "@/components/deal/Activity";
import NextTeaser from "@/components/deal/NextTeaser";
import ShareDeal from "@/components/deal/ShareDeal";
import SoldOutCard from "@/components/deal/SoldOutCard";
import DropAlert from "@/components/deal/DropAlert";

const Price = ({ deal }) => (
  <div className="flex items-end gap-4 flex-wrap">
    <span data-testid="product-discount-price" className="font-mono text-6xl sm:text-7xl font-extrabold tracking-tighter text-[#B0CB1F] leading-none">
      {inr(deal.current_price)}
    </span>
    <div className="pb-1.5 flex flex-col gap-1.5">
      <span data-testid="product-savings-percent" className="self-start font-mono text-sm font-bold bg-[#B0CB1F]/15 text-[#B0CB1F] border border-[#B0CB1F]/30 px-3 py-0.5 rounded-full">
        {deal.discount_percent}% OFF
      </span>
      <span data-testid="product-original-price" className="font-mono text-lg text-zinc-500 line-through">{inr(deal.original_price)}</span>
    </div>
    <p data-testid="product-tax-note" className="basis-full font-mono text-xs text-zinc-400">
      + {deal.gst_rate}% GST{deal.delivery_charge > 0 && <> · + {inr(deal.delivery_charge)} delivery charges</>}
    </p>
  </div>
);

const Specs = ({ deal }) => (
  <section className="grid lg:grid-cols-[1fr_1.3fr] gap-10" data-testid="product-details-section">
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">About this drop</p>
      <h2 className="mt-3 text-base md:text-lg font-bold">{deal.name}</h2>
      <p data-testid="product-description" className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed whitespace-pre-line">{deal.description}</p>
    </div>
    {deal.specs?.length > 0 && (
      <dl data-testid="product-specs" className="rounded-2xl border border-[#2A3647] divide-y divide-[#2A3647] bg-[#1C2635]">
        {deal.specs.map((s, i) => (
          <div key={i} className="flex justify-between gap-6 px-5 py-3.5">
            <dt className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-500">{s.label}</dt>
            <dd className="text-sm text-right">{s.value}</dd>
          </div>
        ))}
      </dl>
    )}
  </section>
);

const steps = [
  [Crosshair, "One item", "Every drop features a single product. No catalogue, no noise."],
  [Tag, "One price", "A special Dealwills price for a fixed number of units — set before launch."],
  [Hourglass, "Gone at zero", "Every confirmed purchase moves the meter. When it hits zero, the deal closes for good."],
];

const HowItWorks = () => (
  <section id="how-it-works" data-testid="how-it-works-section" className="scroll-mt-24">
    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F]">How it works</p>
    <h2 className="mt-3 text-base md:text-lg font-bold">One product. One price. Limited opportunity.</h2>
    <div className="mt-8 grid md:grid-cols-3 gap-px bg-[#2A3647] rounded-2xl overflow-hidden border border-[#2A3647]">
      {steps.map(([Icon, t, d], i) => (
        <div key={t} className="bg-[#141B26] p-7">
          <div className="flex items-center justify-between">
            <Icon className="w-5 h-5 text-[#B0CB1F]" />
            <span className="font-mono text-xs text-zinc-600">0{i + 1}</span>
          </div>
          <h3 className="mt-6 text-xl font-bold">{t}</h3>
          <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{d}</p>
        </div>
      ))}
    </div>
  </section>
);

const Perks = () => (
  <div className="grid grid-cols-3 gap-3 text-xs text-zinc-500">
    {[[Truck, "Timely delivery"], [ShieldCheck, "Secure payment"], [RotateCcw, "7-day returns"]].map(([I, t]) => (
      <span key={t} className="flex items-center gap-2"><I className="w-4 h-4 text-zinc-400" />{t}</span>
    ))}
  </div>
);

export default function Home() {
  const { data, isLoading } = useDeal();
  const connected = useLiveSync();
  const [params] = useSearchParams();
  const { hash } = useLocation();

  useEffect(() => {
    const ref = params.get("ref");
    if (ref) localStorage.setItem("otoi_ref", ref.toUpperCase());
  }, [params]);
  useEffect(() => {
    if (hash && data) document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
  }, [hash, data]);

  if (isLoading) return <div className="min-h-[70vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" /></div>;
  const deal = data?.deal;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-20">
      {deal ? (
        <section data-testid="deal-hero" className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-14 items-start">
          <Gallery deal={deal} />
          <div className="space-y-6 rise" style={{ animationDelay: "120ms" }}>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                Today's exclusive deal {deal.category && <>· <span className="text-zinc-300">{deal.category}</span></>}
              </p>
              <h1 data-testid="product-title" className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[0.95]">{deal.name}</h1>
            </div>
            <Price deal={deal} />
            <LiveMeter deal={deal} connected={connected} />
            <PriceSlabs deal={deal} />
            <BuyBox key={deal.id} deal={deal} />
            <ShareDeal deal={deal} />
            <SoldOutCard deal={deal} next={data?.next} />
            <Perks />
          </div>
        </section>
      ) : (
        <section data-testid="no-deal-state" className="min-h-[50vh] grid place-items-center text-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#B0CB1F]">Between drops</p>
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">The next deal is loading.</h1>
            {!data?.next && <div className="mt-8 max-w-md mx-auto text-left"><DropAlert /></div>}
          </div>
        </section>
      )}
      <NextTeaser next={data?.next} />
      {deal && <Activity deal={deal} activity={data.activity} />}
      {deal && <Specs deal={deal} />}
      <HowItWorks />
    </div>
  );
}
