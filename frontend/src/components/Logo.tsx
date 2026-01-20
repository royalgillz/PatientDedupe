// The "Golden Record" mark: two source records resolve through converging arcs into
// one filled master node. Deduplication made literal, in the brand teal and jade.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PatientDedupe"
    >
      <path d="M10 14 Q26 24 38 24" stroke="#16B8A6" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M10 34 Q26 24 38 24" stroke="#16B8A6" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="5" fill="#FFFFFF" stroke="#16B8A6" strokeWidth="3" />
      <circle cx="10" cy="34" r="5" fill="#FFFFFF" stroke="#16B8A6" strokeWidth="3" />
      <circle cx="38" cy="24" r="12" fill="#0E7C7B" opacity="0.12" />
      <circle cx="38" cy="24" r="9" fill="#0E7C7B" />
      <circle cx="38" cy="24" r="3" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={28} />
      {!collapsed && (
        <span className="text-[15px] tracking-tight text-ink">
          Patient<span className="font-semibold">Dedupe</span>
        </span>
      )}
    </div>
  );
}
