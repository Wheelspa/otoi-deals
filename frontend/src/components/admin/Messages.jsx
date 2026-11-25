import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, fmtDate, errMsg } from "@/lib/api";

export default function Messages() {
  const api = useApi();
  const qc = useQueryClient();
  const del = async (m) => {
    if (!window.confirm("Permanently delete this message?")) return;
    try { await api.delete(`/admin/messages/${m.id}`); qc.invalidateQueries({ queryKey: ["admin-messages"] }); } catch (e) { toast.error(errMsg(e)); }
  };
  const { data } = useQuery({ queryKey: ["admin-messages"], queryFn: async () => (await api.get("/admin/messages")).data });
  return (
    <div className="space-y-3" data-testid="admin-messages">
      {data?.length === 0 && <p className="text-sm text-zinc-600">No messages yet</p>}
      {data?.map((m) => (
        <div key={m.id} className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-4">
          <div className="flex justify-between gap-4">
            <p className="font-semibold">{m.name} <span className="text-xs text-zinc-500 font-normal">{m.email} {m.phone && `· ${m.phone}`}</span></p>
            <span className="flex items-center gap-2 text-xs text-zinc-500">{fmtDate(m.created_at)}
              <button data-testid={`message-delete-${m.id}`} onClick={() => del(m)} className="p-1.5 rounded-full hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-400 whitespace-pre-line">{m.message}</p>
        </div>
      ))}
    </div>
  );
}
