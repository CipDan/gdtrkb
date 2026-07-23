// Type badge (design-tokens-3-phosphor.md §4): no fill, --bright text, 1px --line border.
export default function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-line px-1.5 text-[15px] leading-normal text-bright">
      {children}
    </span>
  );
}
