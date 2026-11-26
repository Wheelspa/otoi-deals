import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import { dark } from "@clerk/ui/themes";
import { Loader2 } from "lucide-react";
import { BACKEND_URL } from "@/lib/api";

const appearance = {
  theme: dark,
  captcha: { theme: "dark" },
  variables: {
    colorPrimary: "#B0CB1F",
    colorPrimaryForeground: "#141B26",
    colorBackground: "#1C2635",
    fontFamily: "'IBM Plex Sans', sans-serif",
    borderRadius: "0.75rem",
  },
};

export default function ClerkAuthProvider({ children }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/clerk/config`);
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.enabled) {
            if (!cancelled) setConfig(cfg);
            return;
          }
          if (!cancelled) {
            setErrorMsg("Sign-in is not configured on the backend (missing Clerk keys in backend/.env).");
          }
          return;
        }
      } catch {}
      if (cancelled) return;
      if (attempt >= 20) {
        setErrorMsg("Sign-in is unavailable right now. Refresh the page to try again.");
        return;
      }
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (errorMsg) return <p style={{ padding: 24 }}>{errorMsg}</p>;
  if (!config) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#B0CB1F]" />
      </div>
    );
  }
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
