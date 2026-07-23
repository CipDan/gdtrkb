// Area-of-use tag (design-tokens-3-phosphor.md §4): 1px --line border optional,
// --ink text, prefixed with a dim "› ".
export default function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[15px] text-ink">
      <span className="text-dim">{"› "}</span>
      {children}
    </span>
  );
}
