export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label ?? 'Progresso'}</span>
        <span className="num text-sm text-ink-soft">
          {done} / {total} · {pct.toFixed(1).replace('.', ',')}%
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full border border-ink bg-card"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full bg-rust"
          style={{
            width: `${pct}%`,
            backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 6px, rgb(0 0 0 / 0.12) 6px 7px)',
          }}
        />
      </div>
    </div>
  )
}
