import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-bright">
        [ 404 ]
      </h1>
      <p className="text-dim">No tool matches that slug.</p>
      <Link href="/" className="text-ink underline">
        &gt; back to search
      </Link>
    </main>
  );
}
