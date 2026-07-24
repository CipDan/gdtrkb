"use client";

// Cursor-based pagination (app-spec §7.8 / phosphor-hifi-mock.html .pager).
export default function Pagination({
  currentPage,
  totalPages,
  hasPrev,
  hasNext,
  loading,
  onPrev,
  onNext,
}: {
  currentPage: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-4 text-[16px] text-dim">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || loading}
        className="border border-line px-3 py-0.5 text-ink hover:border-ink hover:text-bright disabled:border-line/40 disabled:text-line disabled:hover:text-line"
      >
        &lsaquo; prev
      </button>
      <span>
        page {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext || loading}
        className="border border-line px-3 py-0.5 text-ink hover:border-ink hover:text-bright disabled:border-line/40 disabled:text-line disabled:hover:text-line"
      >
        next &rsaquo;
      </button>
    </div>
  );
}
