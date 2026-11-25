export const Chevrons = ({ className = "w-6 h-5" }) => (
  <svg viewBox="0 0 30 22" className={className} aria-hidden="true">
    <path d="M2 2h7l9 9-9 9H2l9-9z" fill="#B0CB1F" />
    <path d="M14 2h7l9 9-9 9h-7l9-9z" fill="#B0CB1F" />
  </svg>
);

export default function BrandLogo({ size = "text-[28px]", tagline = true }) {
  return (
    <span className="inline-flex flex-col leading-none">
      <span className={`flex items-center gap-1 font-brand font-bold tracking-tight lowercase text-white ${size}`}>
        dealwills <Chevrons className="w-[0.85em] h-[0.65em] mt-[0.12em]" />
      </span>
      {tagline && (
        <span data-testid="navbar-tagline" className="self-end mr-[1.1em] mt-1 font-brand font-medium text-[10px] tracking-wide text-zinc-400">
          Timely delivery always
        </span>
      )}
    </span>
  );
}
