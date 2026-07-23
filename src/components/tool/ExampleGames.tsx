import type { ToolDetail } from "@/lib/graphql/types";

// Example titles panel (app-spec §8 item 7 / phosphor-hifi-mock.html .game).
// `bannerImageUrl` is a curator-cleared external reference (never re-hosted,
// schema-spec §4.1), so it's a plain <img> rather than next/image — that
// would need a project-wide remotePatterns allowlist decision for domains
// the curator doesn't control ahead of time.
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
              <span className="grid h-11 w-[72px] flex-none place-items-center border border-line text-[14px] text-dim">
                {game.bannerImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external, curator-cleared reference; see file note above.
                  <img
                    src={game.bannerImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "[img]"
                )}
              </span>
              <div>
                <div className="text-[19px] leading-[1.1] text-pale">{game.name}</div>
                <div className="text-[15px] text-dim">
                  {game.developer}
                  {game.releaseYear && ` · ${game.releaseYear}`}
                  {game.storeLinks.map((link) => (
                    <span key={link.url}>
                      {" · "}
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
