import { licensingLongLabel, toolLinkTypeLabel } from "@/lib/format";
import type { ToolDetail } from "@/lib/graphql/types";

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-dim last-of-type:border-b-0">
        {term}
      </dt>
      <dd className="border-b border-dotted border-line px-3 py-1.5 text-[18px] text-ink last-of-type:border-b-0">
        {children}
      </dd>
    </>
  );
}

function List<T>({ items, keyOf, render }: { items: T[]; keyOf: (item: T) => string; render: (item: T) => React.ReactNode }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={keyOf(item)}>
          {i > 0 && <span className="text-dim"> · </span>}
          {render(item)}
        </span>
      ))}
    </>
  );
}

// Spec-sheet readout (app-spec §8 items 3-6, 8 / phosphor-hifi-mock.html
// .spec dl). Rows with nothing to show are omitted entirely; licensing and
// popularity always render since every tool has a licensing model and the
// popularity figure has its own "no data" copy.
export default function SpecSheet({ tool }: { tool: ToolDetail }) {
  const runsOn = tool.platforms.filter((p) => p.role === "HOST_OS");
  const exportsTo = tool.platforms.filter((p) => p.role === "TARGET");

  return (
    <div className="border border-line">
      <div className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-bright">
        {"// tool.readout"}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-[150px_1fr]">
        {tool.links.length > 0 && (
          <Row term="links">
            <List
              items={tool.links}
              keyOf={(link) => link.url}
              render={(link) => (
                <a href={link.url} className="text-bright hover:underline" target="_blank" rel="noreferrer">
                  {link.label ?? toolLinkTypeLabel(link.type)}
                </a>
              )}
            />
          </Row>
        )}

        {runsOn.length > 0 && (
          <Row term="runs on">
            <List items={runsOn} keyOf={(p) => p.slug} render={(p) => p.name} />
          </Row>
        )}

        {exportsTo.length > 0 && (
          <Row term="exports to">
            <List items={exportsTo} keyOf={(p) => p.slug} render={(p) => p.name} />
          </Row>
        )}

        {tool.languages.length > 0 && (
          <Row term="languages">
            <List items={tool.languages} keyOf={(l) => l.slug} render={(l) => l.name} />
          </Row>
        )}

        {tool.areasOfUse.length > 0 && (
          <Row term="areas of use">
            <List
              items={tool.areasOfUse}
              keyOf={(area) => area.slug}
              render={(area) => (area.parentName ? `${area.parentName} › ${area.name}` : area.name)}
            />
          </Row>
        )}

        <Row term="licensing">
          {licensingLongLabel(tool.licensingModel)}
          {tool.licensingNote && <span className="text-dim"> — {tool.licensingNote}</span>}
        </Row>

        <Row term="popularity">
          {tool.confirmedCommercialTitlesCount != null ? (
            <span className="text-pale">
              {tool.confirmedCommercialTitlesCount} confirmed titles
              {tool.confirmedTitlesAsOf && (
                <span className="text-dim"> (as of {tool.confirmedTitlesAsOf})</span>
              )}
            </span>
          ) : (
            <span className="text-dim">no confirmed-titles figure available</span>
          )}
        </Row>
      </dl>
    </div>
  );
}
