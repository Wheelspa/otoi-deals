import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, useMe, inr, fmtDate, errMsg } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Customers() {
  const api = useApi();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const del = async (u) => {
    if (!window.confirm(`Permanently delete ${u.email || "this customer"}'s account? They will no longer be able to sign in. Their orders stay in your sales records.`)) return;
    try { await api.delete(`/users/${u.user_id}`); qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Customer deleted"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const { data } = useQuery({ queryKey: ["admin-users"], queryFn: async () => (await api.get("/users")).data });
  const setRole = async (u, role) => {
    try { await api.patch(`/users/${u.user_id}/role`, { role }); qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-[#B0CB1F]" />;
  return (
    <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] overflow-x-auto" data-testid="admin-customers">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="text-left font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 border-b border-[#2A3647]">
          <tr>{["Customer", "Mobile", "Joined", "Paid orders", "Spent", "Referral credit", "Role", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#2A3647]">
          {data.users.map((u) => (
            <tr key={u.user_id} data-testid={`customer-row-${u.user_id}`}>
              <td className="px-4 py-3"><p>{u.name || "—"}</p><p className="text-xs text-zinc-500">{u.email}</p></td>
              <td className="px-4 py-3 font-mono text-xs">{u.phone || "—"}</td>
              <td className="px-4 py-3 text-xs text-zinc-400">{fmtDate(u.created_at)}</td>
              <td className="px-4 py-3 font-mono">{u.paid_orders}</td>
              <td className="px-4 py-3 font-mono">{inr(u.spent)}</td>
              <td className="px-4 py-3 font-mono">{inr(u.referral_credit)}</td>
              <td className="px-4 py-3">
                <Select value={u.role} onValueChange={(v) => setRole(u, v)}>
                  <SelectTrigger data-testid={`customer-role-${u.user_id}`} className="w-32 h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>{data.roles.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3">
                {u.user_id !== me?.user_id && u.role !== "admin" && (
                  <button data-testid={`customer-delete-${u.user_id}`} onClick={() => del(u)} className="p-2 rounded-full hover:bg-rose-500/10">
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
