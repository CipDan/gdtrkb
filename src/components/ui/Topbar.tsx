import { Suspense } from "react";
import Wordmark from "@/components/ui/Wordmark";
import { getToolCount } from "@/lib/graphql/toolCount";

// Persistent header chrome shown on every route (phosphor-hifi-mock.html
// .topbar). The mock's tab strip toggles between two static previews inside
// one demo HTML file — real navigation uses actual routing, so it isn't
// reproduced here.
export default function Topbar() {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
      <Wordmark />
      <span className="ml-auto text-[16px] text-dim">
        <Suspense fallback={null}>
          <ToolCountLabel />
        </Suspense>
      </span>
    </header>
  );
}

// Fetches its own count so the request never blocks the rest of the page —
// Suspense's null fallback matches the existing "no count yet" state.
async function ToolCountLabel() {
  const toolCount = await getToolCount();
  return toolCount !== null
    ? `${toolCount} ${toolCount === 1 ? "entry" : "entries"}`
    : null;
}
