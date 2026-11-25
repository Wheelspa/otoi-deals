import { useEffect, useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { publicApi, errMsg, useMe } from "@/lib/api";
import { Input } from "@/components/ui/input";

export default function DropAlert({ compact }) {
  const { data: me } = useMe();
  const [phone, setPhone] = useState("");
  const [state, setState] = useState(localStorage.getItem("otoi_alert") ? "done" : "idle");
  useEffect(() => { if (me?.phone && !phone) setPhone(me.phone); }, [me]); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    setState("busy");
    try {
      const { data } = await publicApi.post("/alerts", { phone });
      localStorage.setItem("otoi_alert", phone);
      setState("done");
      toast.success(data.already ? "You're already on the list" : "Done! We'll text you for every new drop — with 5-min early access");
    } catch (x) {
      setState("idle");
      toast.error(errMsg(x));
    }
  };

  const stop = async () => {
    const saved = localStorage.getItem("otoi_alert");
    if (saved && saved.length >= 10) await publicApi.post("/alerts/unsubscribe", { phone: saved }).catch(() => {});
    localStorage.removeItem("otoi_alert");
    setState("idle");
    toast("Drop alerts turned off");
  };

  if (state === "done")
    return (
      <div data-testid="drop-alert-success" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-emerald-400">
        <Check className="w-4 h-4" /> You're on the list: a text for every new drop, plus 5-min early access.
        <button data-testid="drop-alert-stop-btn" className="text-xs text-zinc-500 underline" onClick={stop}>Stop alerts</button>
      </div>
    );

  return (
    <form onSubmit={submit} data-testid="drop-alert-form" className={compact ? "" : "space-y-2"}>
      {!compact && <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Get a text for every drop + 5-min early access</p>}
      <div className="flex gap-2">
        <Input data-testid="drop-alert-phone-input" required inputMode="tel" placeholder="10-digit mobile number"
          value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-black/40" />
        <button data-testid="drop-alert-submit-btn" disabled={state === "busy"}
          className="shrink-0 flex items-center gap-2 px-4 rounded-md bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A] text-sm font-semibold disabled:opacity-50 transition-colors">
          {state === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Notify me
        </button>
      </div>
    </form>
  );
}
