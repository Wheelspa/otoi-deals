import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { useApi, inr } from "@/lib/api";

const Stat = ({ label, value, testId, accent }) => (
  <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-4">
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
    <p data-testid={testId} className={`mt-2 font-mono text-2xl font-bold ${accent ? "text-[#B0CB1F]" : ""}`}>{value}</p>
  </div>
);

const tip = { contentStyle: { background: "#1C2635", border: "1px solid #27272a", borderRadius: 8 }, labelStyle: { color: "#a1a1aa" } };

const Chart = ({ title, data, kind }) => (
  <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-5">
    <p className="font-semibold mb-4">{title}</p>
    <div className="h-60">
      {data.length === 0 ? <p className="text-sm text-zinc-600 h-full grid place-items-center">No paid orders yet</p> : (
        <ResponsiveContainer>
          {kind === "area" ? (
            <AreaChart data={data}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B0CB1F" stopOpacity={0.5} /><stop offset="100%" stopColor="#B0CB1F" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#243042" vertical={false} />
              <XAxis dataKey="date" stroke="#52525b" fontSize={11} />
              <YAxis stroke="#52525b" fontSize={11} />
              <Tooltip {...tip} formatter={(v) => inr(v)} />
              <Area dataKey="revenue" stroke="#B0CB1F" fill="url(#g)" strokeWidth={2} />
            </AreaChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid stroke="#243042" vertical={false} />
              <XAxis dataKey="date" stroke="#52525b" fontSize={11} />
              <YAxis stroke="#52525b" fontSize={11} />
              <Tooltip {...tip} />
              <Bar dataKey="units" fill="#B0CB1F" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

export default function Analytics() {
  const api = useApi();
  const { data: a } = useQuery({ queryKey: ["admin-analytics"], queryFn: async () => (await api.get("/admin/analytics")).data, refetchInterval: 15000 });
  if (!a) return <Loader2 className="w-5 h-5 animate-spin text-[#B0CB1F]" />;
  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Revenue" value={inr(a.revenue)} testId="stat-revenue" accent />
        <Stat label="Units sold" value={a.units_sold} testId="stat-units-sold" />
        <Stat label="Successful orders" value={a.successful_orders} testId="stat-successful-orders" />
        <Stat label="Customers" value={a.customers} testId="stat-customers" />
        <Stat label="Total orders" value={a.total_orders} testId="stat-total-orders" />
        <Stat label="Pending payments" value={a.pending_payments} testId="stat-pending" />
        <Stat label="Cancelled / expired" value={a.cancelled_orders} testId="stat-cancelled" />
        <Stat label="Failed payments" value={a.failed_orders} testId="stat-failed" />
        <Stat label="Next-drop alert signups" value={a.drop_alert_signups} testId="stat-drop-alerts" />
      </div>
      {a.live && (
        <div data-testid="admin-live-summary" className="rounded-xl border border-[#B0CB1F]/30 bg-[#B0CB1F]/[0.06] p-5 flex flex-wrap gap-6 items-center">
          <div className="flex-1 min-w-[200px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B0CB1F]">Current deal · {a.live.status}</p>
            <p className="font-semibold mt-1">{a.live.name}</p>
          </div>
          <Mini l="Sold" v={a.live.sold} /><Mini l="Reserved" v={a.live.reserved} /><Mini l="Remaining" v={a.live.remaining} /><Mini l="Sold %" v={`${a.live.percent_sold}%`} />
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Chart title="Daily revenue (30 days)" data={a.daily} kind="area" />
        <Chart title="Monthly units sold" data={a.monthly} kind="bar" />
      </div>
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-5 overflow-x-auto">
          <p className="font-semibold mb-3">Product-wise sales</p>
          <table className="w-full text-sm" data-testid="product-sales-table">
            <thead className="text-left font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              <tr><th className="py-2">Product</th><th>Status</th><th>Sold</th><th>Left</th><th>Orders</th><th className="text-right">Revenue</th></tr>
            </thead>
            <tbody className="divide-y divide-[#2A3647]">
              {a.products.map((p) => (
                <tr key={p.id}><td className="py-2.5 pr-3">{p.name}</td><td className="font-mono text-xs uppercase text-zinc-400">{p.status}</td>
                  <td className="font-mono">{p.sold}/{p.total_qty}</td><td className="font-mono">{p.remaining}</td><td className="font-mono">{p.orders}</td>
                  <td className="font-mono text-right">{inr(p.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-[#2A3647] bg-[#1C2635] p-5">
          <p className="font-semibold mb-3">Payment report</p>
          {a.payment_methods.length === 0 && <p className="text-sm text-zinc-600">No payments yet</p>}
          {a.payment_methods.map((m) => (
            <div key={m.method} className="flex justify-between py-2 border-b border-[#2A3647] last:border-0 text-sm">
              <span className="uppercase font-mono text-xs text-zinc-400">{m.method}</span>
              <span className="font-mono">{m.orders} · {inr(m.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Mini = ({ l, v }) => (
  <div><p className="font-mono text-xl font-bold">{v}</p><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">{l}</p></div>
);
