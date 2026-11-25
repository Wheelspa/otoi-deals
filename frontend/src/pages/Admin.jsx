import { Link } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/lib/api";
import Analytics from "@/components/admin/Analytics";
import Products from "@/components/admin/Products";
import Orders from "@/components/admin/Orders";
import Coupons from "@/components/admin/Coupons";
import Customers from "@/components/admin/Customers";
import Messages from "@/components/admin/Messages";
import EraseAll from "@/components/admin/EraseAll";
import InvoiceSettings from "@/components/admin/InvoiceSettings";

const TABS = [
  ["analytics", "Analytics", Analytics],
  ["products", "Products & Queue", Products],
  ["orders", "Orders", Orders],
  ["coupons", "Coupons", Coupons],
  ["customers", "Customers", Customers],
  ["messages", "Messages", Messages],
  ["invoice", "Invoice Settings", InvoiceSettings],
];

export default function Admin() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" /></div>;
  if (me?.role !== "admin")
    return (
      <div data-testid="admin-forbidden" className="min-h-[60vh] grid place-items-center text-center px-4">
        <div>
          <ShieldAlert className="w-10 h-10 mx-auto text-[#B0CB1F]" />
          <h1 className="mt-4 text-3xl font-extrabold">Admins only</h1>
          <p className="mt-2 text-zinc-500">Your account doesn't have admin access.</p>
          <Link to="/" className="mt-6 inline-block text-[#B0CB1F]">Back to the deal →</Link>
        </div>
      </div>
    );
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F]">Command centre</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Dealwills Admin</h1>
        <EraseAll />
      </div>
      <Tabs defaultValue="analytics" className="mt-8">
        <TabsList className="bg-[#1C2635] border border-[#2A3647] h-auto flex-wrap justify-start">
          {TABS.map(([k, l]) => (
            <TabsTrigger key={k} value={k} data-testid={`admin-tab-${k}`}
              className="data-[state=active]:bg-[#B0CB1F] text-[#141B26] data-[state=active]:">{l}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(([k, , C]) => (
          <TabsContent key={k} value={k} className="mt-6"><C /></TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
