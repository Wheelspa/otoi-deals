import { useState } from "react";
import { Download, Instagram, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { renderStory } from "@/lib/storyCard";

export default function StoryCard({ deal, label = "Instagram Story" }) {
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState(null);
  const fileName = `dealwills-${deal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-story.png`;

  const open = async () => {
    setBusy(true);
    try {
      const blob = await renderStory(deal);
      setCard({ blob, url: URL.createObjectURL(blob) });
    } catch {
      toast.error("Could not create the story card");
    } finally {
      setBusy(false);
    }
  };
  const close = () => { if (card) URL.revokeObjectURL(card.url); setCard(null); };
  const file = card && new File([card.blob], fileName, { type: "image/png" });
  const canShare = file && navigator.canShare?.({ files: [file] });
  const share = () => navigator.share({ files: [file], title: deal.name }).catch(() => {});

  return (
    <>
      <button data-testid="story-card-open-btn" onClick={open} disabled={busy}
        className="w-full flex items-center justify-center gap-2.5 rounded-full py-3 text-sm font-semibold border border-pink-500/40 text-pink-400 hover:bg-pink-500/10 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-50">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Instagram className="w-5 h-5" />} {label}
      </button>
      <Dialog open={!!card} onOpenChange={(o) => !o && close()}>
        <DialogContent data-testid="story-card-dialog" className="bg-[#1C2635] border-[#2A3647] sm:max-w-sm max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Your story card</DialogTitle>
            <DialogDescription>Story-sized (1080×1920), ready for Instagram.</DialogDescription>
          </DialogHeader>
          {card && <img data-testid="story-card-preview" src={card.url} alt="Story card preview" className="w-full max-h-[60vh] object-contain rounded-xl border border-[#2A3647]" />}
          <div className="flex gap-2">
            <a data-testid="story-card-download-btn" href={card?.url} download={fileName}
              className="flex-1 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A]">
              <Download className="w-4 h-4" /> Download
            </a>
            {canShare && (
              <button data-testid="story-card-share-btn" onClick={share}
                className="flex-1 flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold border border-zinc-700">
                <Share2 className="w-4 h-4" /> Share
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
