import { logoInitials } from "@/lib/format";

// Logo frame (design-tokens-3-phosphor.md §4): 46×46 by default, 1px --line
// border. Renders the tool's real logo when the curator has supplied one
// (app-spec §9: "use each tool's real logo inside a consistent frame"),
// falling back to VT323 initials when logoImageUrl is null — never bespoke
// pixel icons, per the same invariant.
export default function LogoFrame({
  name,
  logoImageUrl = null,
  size = 46,
}: {
  name: string;
  logoImageUrl?: string | null;
  size?: number;
}) {
  return (
    <span
      className="grid flex-none place-items-center overflow-hidden border border-line font-[family-name:var(--font-display)] text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {logoImageUrl ? (
        // External, curator-cleared reference (schema-spec §4.1) — never
        // re-hosted, so a plain <img> rather than next/image (same reasoning
        // as ExampleGames.tsx, which would otherwise need a project-wide
        // remotePatterns allowlist for domains the curator doesn't control).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoImageUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        logoInitials(name)
      )}
    </span>
  );
}
