import type { ReactNode } from 'react'

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-t-2 border-ink pt-3">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-3xl text-ink">{value}</p>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl font-semibold">{title}</h2>
        {aside}
      </div>
      <hr className="rule !mt-3 !mb-5" />
      {children}
    </section>
  )
}
