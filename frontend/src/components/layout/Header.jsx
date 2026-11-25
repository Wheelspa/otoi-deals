import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Show, UserButton } from "@clerk/react";
import { Menu, X, ShieldCheck, Gift } from "lucide-react";
import { useMe } from "@/lib/api";
import BrandLogo from "./BrandLogo";

const links = [
  { to: "/", label: "Home", id: "nav-home-link" },
  { to: "/#how-it-works", label: "How It Works", id: "nav-how-it-works-link" },
  { to: "/hall-of-fame", label: "Hall of Fame", id: "nav-hall-of-fame-link" },
  { to: "/track", label: "Track Order", id: "nav-track-order-link" },
  { to: "/contact", label: "Contact Us", id: "nav-contact-link" },
];

const Logo = () => (
  <Link to="/" data-testid="navbar-brand-logo" className="flex items-center hover:opacity-90 transition-opacity">
    <BrandLogo />
  </Link>
);

const NavItems = ({ onClick, isAdmin }) => (
  <>
    {links.map((l) => (
      <NavLink key={l.id} to={l.to} data-testid={l.id} onClick={onClick}
        className="text-sm text-zinc-400 hover:text-white transition-colors">
        {l.label}
      </NavLink>
    ))}
    <Show when="signed-in">
      <NavLink to="/account" data-testid="nav-account-link" onClick={onClick}
        className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
        <Gift className="w-3.5 h-3.5 text-[#B0CB1F]" /> My Orders
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin" data-testid="nav-admin-link" onClick={onClick}
          className="text-sm text-[#B0CB1F] hover:text-orange-300 transition-colors flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin
        </NavLink>
      )}
    </Show>
  </>
);

export default function Header() {
  const [open, setOpen] = useState(false);
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  return (
    <header className="print:hidden sticky top-0 z-50 backdrop-blur-xl bg-[#141B26]/85 border-b border-[#2A3647]/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
        <Logo />
        <nav className="hidden lg:flex items-center gap-7">
          <NavItems isAdmin={isAdmin} />
        </nav>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <Link to="/sign-in" data-testid="nav-login-btn"
              className="text-sm font-semibold px-4 py-2 rounded-full bg-white text-black hover:bg-[#B0CB1F] text-[#141B26] hover: transition-colors">
              Login / Register
            </Link>
          </Show>
          <Show when="signed-in">
            <div data-testid="nav-user-button"><UserButton /></div>
          </Show>
          <button className="lg:hidden p-2 text-zinc-300" data-testid="nav-mobile-toggle" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden flex flex-col gap-4 px-6 pb-5 pt-2 border-t border-zinc-900">
          <NavItems onClick={() => setOpen(false)} isAdmin={isAdmin} />
        </nav>
      )}
    </header>
  );
}
