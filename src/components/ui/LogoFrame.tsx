import { logoInitials } from "@/lib/format";

// Logo/banner frame (design-tokens-3-phosphor.md §4): 46×46 square by
// default, 1px --line border. Renders a real image when the curator has
// supplied one (app-spec §9: "use each tool's real logo inside a consistent
// frame"), falling back to VT323 initials when the URL is null — never
// bespoke pixel icons, per the same invariant. Also reused by ExampleGames
// for game banners (rectangular via width/height, imageFit="cover") so a
// missing banner gets the same initials treatment as a missing tool logo,
// instead of a bare "[img]" placeholder.
export default function LogoFrame({
  name,
  logoImageUrl = null,
  size = 46,
  width,
  height,
  imageFit = "contain",
}: {
  name: string;
  logoImageUrl?: string | null;
  size?: number;
  width?: number;
  height?: number;
  imageFit?: "contain" | "cover";
}) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <span
      className="grid flex-none place-items-center overflow-hidden border border-line font-[family-name:var(--font-display)] text-ink"
      style={{ width: w, height: h, fontSize: Math.round(Math.min(w, h) * 0.42) }}
      aria-hidden="true"
    >
      {logoImageUrl ? (
        // External, curator-cleared reference (schema-spec §4.1) — never
        // re-hosted, so a plain <img> rather than next/image, which would
        // otherwise need a project-wide remotePatterns allowlist for domains
        // the curator doesn't control.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoImageUrl}
          alt=""
          className={`h-full w-full ${imageFit === "cover" ? "object-cover" : "object-contain"}`}
        />
      ) : (
        logoInitials(name)
      )}
    </span>
  );
}
