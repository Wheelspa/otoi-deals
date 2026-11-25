import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function EarlyAccessBanner({ countdown, eligible, signedIn, hasPhone }) {
  let note = "Drop-alert subscribers get first dibs. Sign in with the mobile number you subscribed with.";
  if (signedIn && eligible) note = "You're on the alert list — your early access is ON. Grab it before everyone else.";
  else if (signedIn && eligible === false)
    note = hasPhone
      ? "Your profile's mobile number isn't on the alert list for this drop."
      : "Add the mobile number you subscribed with to your profile to unlock early access.";
  return (
    <div data-testid="early-access-banner" className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-3 flex items-start gap-3">
      <Sparkles className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
      <div className="text-sm flex-1">
        <p className="font-semibold text-fuchsia-200">
          Subscriber early access · opens to everyone in <span data-testid="early-access-countdown" className="font-mono">{countdown}</span>
        </p>
        <p className="text-zinc-400 text-xs mt-0.5">
          {note} {signedIn && eligible === false && !hasPhone && <Link to="/account" className="text-fuchsia-300 underline">Update profile</Link>}
        </p>
      </div>
    </div>
  );
}
