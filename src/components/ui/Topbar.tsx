import Wordmark from "@/components/ui/Wordmark";

// Persistent header chrome shown on every route (phosphor-hifi-mock.html
// .topbar). The mock's tab strip toggles between two static previews inside
// one demo HTML file — real navigation uses actual routing, so it isn't
// reproduced here.
export default function Topbar({ toolCount }: { toolCount: number | null }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
      <Wordmark />
      <span className="ml-auto text-[16px] text-dim">
        {toolCount !== null
          ? `gamedev tools index · ${toolCount} entries`
          : "gamedev tools index"}
      </span>
    </header>
  );
}
