import { logoInitials } from "@/lib/format";

// Logo frame (design-tokens-3-phosphor.md §4): 46×46 by default, 1px --line
// border, VT323 initials — a consistent frame standing in for each tool's
// real logo (never bespoke pixel icons, per app-spec §9 invariants).
export default function LogoFrame({
  name,
  size = 46,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      className="grid flex-none place-items-center border border-line font-[family-name:var(--font-display)] text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {logoInitials(name)}
    </span>
  );
}
