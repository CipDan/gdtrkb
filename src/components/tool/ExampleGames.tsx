import LogoFrame from "@/components/ui/LogoFrame";
import type { ToolDetail } from "@/lib/graphql/types";

// Example titles panel (app-spec §8 item 7 / phosphor-hifi-mock.html .game).
// Banner reuses LogoFrame (the tool-logo image-or-initials treatment) sized
// to the mock's 72x44 thumb, cover-fit since a banner is meant to fill its
// frame rather than sit inset like a square logo.
export default function ExampleGames({ games }: { games: ToolDetail["exampleGames"] }) {
  return (
    <div className="border border-line">
      <div className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-bright">
        {"// example titles"}
      </div>

      {games.length === 0 ? (
        <p className="p-3 text-[16px] text-dim">No highlighted example titles yet.</p>
      ) : (
        <>
          {games.map((game) => (
            <div key={game.slug} className="flex gap-3 border-b border-dotted border-line p-3 last:border-b-0">
              <LogoFrame
                name={game.name}
                logoImageUrl={game.bannerImageUrl}
                width={72}
                height={44}
                imageFit="cover"
              />
              <div>
                <div className="text-[19px] leading-[1.1] text-pale">{game.name}</div>
                <div className="text-[15px] text-dim">
                  {[game.developer, game.releaseYear ? String(game.releaseYear) : null]
                    .filter((part): part is string => Boolean(part))
                    .join(" · ")}
                  {game.storeLinks.map((link, index) => (
                    <span key={link.url}>
                      {(game.developer || game.releaseYear || index > 0) && " · "}
                      <a
                        href={link.url}
                        className="text-bright hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.storeLabel}
                      </a>
                    </span>
                  ))}
                </div>
                {game.bannerImageSource && (
                  <div className="text-[13px] text-dim">{game.bannerImageSource}</div>
                )}
              </div>
            </div>
          ))}
          <p className="border-t border-dotted border-line px-3 py-1.5 text-[13px] text-dim">
            Banner art referenced from store pages with attribution; not re-hosted.
          </p>
        </>
      )}
    </div>
  );
}
