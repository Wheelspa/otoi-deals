import { Link } from "react-router-dom";
import BrandLogo from "./BrandLogo";

export default function Footer() {
  return (
    <footer className="print:hidden relative z-10 border-t border-zinc-900 bg-[#101620] mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <BrandLogo size="text-4xl" tagline={false} />
          <p className="mt-2 text-sm text-zinc-400">Timely delivery always</p>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">One product. One price. Limited opportunity.</p>
          <p className="mt-5 text-sm text-zinc-500 max-w-sm leading-relaxed">
            One deal at a time. A fixed number of units at a price that never comes back. When the counter hits zero, it's gone.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 text-sm text-zinc-400">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Explore</span>
          <Link to="/" className="hover:text-white">Today's Deal</Link>
          <Link to="/#how-it-works" className="hover:text-white">How It Works</Link>
          <Link to="/hall-of-fame" className="hover:text-white">Hall of Fame</Link>
          <Link to="/track" className="hover:text-white">Track Order</Link>
        </div>
        <div className="flex flex-col gap-2.5 text-sm text-zinc-400">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600 mb-1">Support</span>
          <Link to="/contact" className="hover:text-white">Contact Us</Link>
          <Link to="/account" className="hover:text-white">Refer &amp; Earn</Link>
          <Link to="/admin" data-testid="footer-admin-link" className="hover:text-white">Admin</Link>
        </div>
      </div>
      <div className="border-t border-zinc-900 py-5 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600">
        © {new Date().getFullYear()} Dealwills — Timely delivery always
      </div>
    </footer>
  );
}
