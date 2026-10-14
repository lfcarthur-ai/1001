import { useState, type KeyboardEvent } from 'react'
import { fmtStars } from '~/lib/format'

function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const id = `half-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={id}>
          <stop offset="50%" stopColor="var(--color-rust)" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill={fill === 1 ? 'var(--color-rust)' : fill === 0.5 ? `url(#${id})` : 'transparent'}
        stroke={fill ? 'var(--color-rust)' : 'var(--color-ink-faint)'}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const fillFor = (value: number, i: number): 0 | 0.5 | 1 => (value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0)

/** Exibição somente leitura. */
export function Stars({ value, size = 16 }: { value: number | string | null; size?: number }) {
  const v = value === null ? 0 : Number(value)
  return (
    <span className="inline-flex items-center" aria-label={value === null ? 'Sem nota' : `${fmtStars(v)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} fill={fillFor(v, i)} size={size} />
      ))}
    </span>
  )
}

/** Seletor de 0,5 a 5 estrelas (meias estrelas). Cada estrela tem duas metades clicáveis. */
export function StarInput({
  value,
  onChange,
  size = 40,
}: {
  value: number | null
  onChange: (v: number) => void
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  function onKey(e: KeyboardEvent) {
    const cur = value ?? 0
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(5, cur + 0.5 || 0.5))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(0.5, cur - 0.5))
    else if (e.key === 'Home') onChange(0.5)
    else if (e.key === 'End') onChange(5)
    else if (/^[1-5]$/.test(e.key)) onChange(Number(e.key))
    else return
    e.preventDefault()
  }

  return (
    <div className="flex items-center gap-4">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Sua nota"
        aria-valuemin={0.5}
        aria-valuemax={5}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value ? `${fmtStars(value)} estrelas` : 'sem nota'}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(null)}
        className="inline-flex rounded-sm"
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star fill={fillFor(shown, i)} size={size} />
            {[i - 0.5, i].map((v, half) => (
              <button
                key={v}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={`absolute top-0 h-full w-1/2 cursor-pointer ${half ? 'right-0' : 'left-0'}`}
                onMouseEnter={() => setHover(v)}
                onClick={() => onChange(v)}
              />
            ))}
          </span>
        ))}
      </div>
      <span className="num min-w-[3ch] text-2xl text-ink">{shown ? fmtStars(shown) : '—'}</span>
    </div>
  )
}
