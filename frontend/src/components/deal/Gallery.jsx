import { useState } from "react";
import { imgUrl } from "@/lib/api";
import StatusBadge from "./StatusBadge";

export default function Gallery({ deal }) {
  const [idx, setIdx] = useState(0);
  const images = deal.images?.length ? deal.images : [null];
  const showLeft = ["LIVE_DEAL", "LIMITED_STOCK", "ALMOST_SOLD_OUT", "EARLY_ACCESS"].includes(deal.display_status);
  return (
    <div className="rise">
      <div className="relative aspect-[4/3.6] rounded-2xl overflow-hidden border border-[#2A3647] bg-[#1C2635]">
        {images[idx] ? (
          <img key={idx} data-testid="product-gallery-main-image" src={imgUrl(images[idx])} alt={deal.name}
            className="w-full h-full object-cover animate-in fade-in duration-500" />
        ) : (
          <div className="w-full h-full grid place-items-center text-zinc-600 font-mono text-xs">NO IMAGE</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <StatusBadge status={deal.display_status} className="absolute top-4 left-4 !bg-black/75" />
        {showLeft && (
          <span data-testid="gallery-units-left-badge"
            className="absolute top-4 right-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-black/70 border border-[#B0CB1F]/50 text-[#B0CB1F]">
            Only {deal.remaining} left
          </span>
        )}
        <span className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-300">
          Drop #{String(deal.drop_number || 1).padStart(3, "0")}
        </span>
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-3">
          {images.map((src, i) => (
            <button key={i} data-testid={`product-thumbnail-btn-${i}`} onClick={() => setIdx(i)}
              className={`w-20 h-16 rounded-lg overflow-hidden border transition-colors ${i === idx ? "border-[#B0CB1F]" : "border-[#2A3647] opacity-60 hover:opacity-100"}`}>
              <img src={imgUrl(src)} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
