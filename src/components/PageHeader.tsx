import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl font-semibold">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
      <hr className="rule !mb-0" />
    </header>
  )
}
