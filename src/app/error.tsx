"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-bright">
        [ ERROR ]
      </h1>
      <p className="text-dim">
        Something went wrong loading this data. The API may be cold-starting.
      </p>
      <button
        onClick={reset}
        className="border border-line px-4 py-2 text-ink hover:text-bright"
      >
        &gt; retry
      </button>
    </div>
  );
}
