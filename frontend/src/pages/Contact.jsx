import { useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { publicApi, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY = { name: "", email: "", phone: "", message: "" };

export default function Contact() {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await publicApi.post("/contact", f);
      setF(EMPTY);
      toast.success("Message sent — we'll get back to you soon");
    } catch (x) { toast.error(errMsg(x)); }
  };
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-14 grid lg:grid-cols-2 gap-14">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#B0CB1F]">Contact us</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tight">Talk to the Dealwills team.</h1>
        <p className="mt-5 text-zinc-400 max-w-md">Questions about an order, a delivery or partnering on a future drop? Send us a note.</p>
        <ul className="mt-10 space-y-4 text-sm text-zinc-300">
          <li className="flex items-center gap-3"><Mail className="w-4 h-4 text-[#B0CB1F]" /> support@dealwills.com</li>
          <li className="flex items-center gap-3"><Phone className="w-4 h-4 text-[#B0CB1F]" /> +91 00000 00000</li>
          <li className="flex items-center gap-3"><MapPin className="w-4 h-4 text-[#B0CB1F]" /> India</li>
        </ul>
      </div>
      <form onSubmit={submit} data-testid="contact-form" className="rounded-2xl border border-[#2A3647] bg-[#1C2635] p-6 sm:p-8 space-y-4">
        <Input data-testid="contact-name-input" placeholder="Name" required value={f.name} onChange={set("name")} />
        <Input data-testid="contact-email-input" type="email" placeholder="Email" required value={f.email} onChange={set("email")} />
        <Input data-testid="contact-phone-input" placeholder="Mobile (optional)" value={f.phone} onChange={set("phone")} />
        <Textarea data-testid="contact-message-input" placeholder="Your message" required rows={5} value={f.message} onChange={set("message")} />
        <button data-testid="contact-submit-btn" className="w-full rounded-full py-3 font-semibold bg-[#B0CB1F] text-[#141B26] hover:bg-[#C2DB3A] transition-colors">Send message</button>
      </form>
    </div>
  );
}
