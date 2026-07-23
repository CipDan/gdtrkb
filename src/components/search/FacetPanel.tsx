"use client";

import { TOOL_TYPE_OPTIONS, LICENSING_OPTIONS } from "@/lib/search/staticFacetOptions";
import type { FilterState } from "@/lib/search/filterState";
import type { AreaOfUseTreeNode } from "@/lib/areas";

interface FacetPanelProps {
  filters: FilterState;
  areaTree: AreaOfUseTreeNode[];
  platforms: { slug: string; name: string }[];
  languages: { slug: string; name: string }[];
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
}

// Checkbox/radio option row (design-tokens-3-phosphor.md §4: "[ ]"/"[x]" and
// "( )"/"(•)" glyphs, checked state in --pale).
function OptionButton({
  checked,
  radio = false,
  indent = false,
  label,
  onClick,
}: {
  checked: boolean;
  radio?: boolean;
  indent?: boolean;
  label: string;
  onClick: () => void;
}) {
  const glyph = radio ? (checked ? "(•)" : "( )") : checked ? "[x]" : "[ ]";
  return (
    <button
      type="button"
      role={radio ? "radio" : "checkbox"}
      aria-checked={checked}
      onClick={onClick}
      className={`block w-full py-px text-left text-[18px] ${indent ? "pl-3.5 text-[17px]" : ""} ${
        checked ? "text-pale" : "text-ink"
      }`}
    >
      <span className={checked ? "text-bright" : "text-dim"}>{glyph}</span> {label}
    </button>
  );
}

function FacetGroup({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-[15px] uppercase tracking-wide text-dim">{lead}</div>
      {children}
    </div>
  );
}

// Facet panel (app-spec §7.2 / phosphor-hifi-mock.html aside.panel). Every
// facet in the MVP is effectively single-select per FilterState (§7.4's URL
// shape carries one value per facet key), so clicking the active option
// again clears that facet.
export default function FacetPanel({
  filters,
  areaTree,
  platforms,
  languages,
  onChange,
  onClear,
}: FacetPanelProps) {
  return (
    <aside className="border border-line" aria-label="Filters">
      <div className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-bright">
        {"// filters"}
      </div>
      <div className="p-3">
        <FacetGroup lead="type">
          <div role="radiogroup" aria-label="Tool type">
            <OptionButton
              radio
              checked={filters.type === null}
              label="any"
              onClick={() => onChange({ type: null })}
            />
            {TOOL_TYPE_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                radio
                checked={filters.type === opt.value}
                label={opt.label}
                onClick={() =>
                  onChange({ type: filters.type === opt.value ? null : opt.value })
                }
              />
            ))}
          </div>
        </FacetGroup>

        <FacetGroup lead="area of use">
          <div role="radiogroup" aria-label="Area of use">
            <OptionButton
              radio
              checked={filters.area === null}
              label="any"
              onClick={() => onChange({ area: null })}
            />
            {areaTree.map((parent) => (
              <div key={parent.slug}>
                <OptionButton
                  radio
                  checked={filters.area === parent.slug}
                  label={parent.name}
                  onClick={() =>
                    onChange({ area: filters.area === parent.slug ? null : parent.slug })
                  }
                />
                {parent.children.map((child) => (
                  <OptionButton
                    key={child.slug}
                    radio
                    indent
                    checked={filters.area === child.slug}
                    label={child.name}
                    onClick={() =>
                      onChange({ area: filters.area === child.slug ? null : child.slug })
                    }
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-0.5 text-[14px] text-dim">selecting a parent includes its children</p>
        </FacetGroup>

        <FacetGroup lead="runs on">
          <div role="radiogroup" aria-label="Runs on">
            <OptionButton
              radio
              checked={filters.hostOs === null}
              label="any"
              onClick={() => onChange({ hostOs: null })}
            />
            {platforms.map((platform) => (
              <OptionButton
                key={platform.slug}
                radio
                checked={filters.hostOs === platform.slug}
                label={platform.name}
                onClick={() =>
                  onChange({ hostOs: filters.hostOs === platform.slug ? null : platform.slug })
                }
              />
            ))}
          </div>
        </FacetGroup>

        <FacetGroup lead="exports to">
          <div role="radiogroup" aria-label="Exports to">
            <OptionButton
              radio
              checked={filters.target === null}
              label="any"
              onClick={() => onChange({ target: null })}
            />
            {platforms.map((platform) => (
              <OptionButton
                key={platform.slug}
                radio
                checked={filters.target === platform.slug}
                label={platform.name}
                onClick={() =>
                  onChange({ target: filters.target === platform.slug ? null : platform.slug })
                }
              />
            ))}
          </div>
        </FacetGroup>

        <FacetGroup lead="language">
          <div role="radiogroup" aria-label="Language">
            <OptionButton
              radio
              checked={filters.language === null}
              label="any"
              onClick={() => onChange({ language: null })}
            />
            {languages.map((language) => (
              <OptionButton
                key={language.slug}
                radio
                checked={filters.language === language.slug}
                label={language.name}
                onClick={() =>
                  onChange({
                    language: filters.language === language.slug ? null : language.slug,
                  })
                }
              />
            ))}
          </div>
        </FacetGroup>

        <FacetGroup lead="licensing">
          <div role="radiogroup" aria-label="Licensing">
            <OptionButton
              radio
              checked={filters.licensing === null}
              label="any"
              onClick={() => onChange({ licensing: null })}
            />
            {LICENSING_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                radio
                checked={filters.licensing === opt.value}
                label={opt.label}
                onClick={() =>
                  onChange({ licensing: filters.licensing === opt.value ? null : opt.value })
                }
              />
            ))}
          </div>
        </FacetGroup>

        <div className="mb-4 last:mb-0">
          <OptionButton
            checked={filters.hasBuiltInEditor === true}
            label="built-in editor only"
            onClick={() =>
              onChange({
                hasBuiltInEditor: filters.hasBuiltInEditor === true ? null : true,
              })
            }
          />
        </div>

        <button
          type="button"
          onClick={onClear}
          className="border border-line px-2.5 py-0.5 text-bright"
        >
          {"> clear filters"}
        </button>
      </div>
    </aside>
  );
}
