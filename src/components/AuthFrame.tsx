import type { ReactNode } from 'react'

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-[1.1fr_1fr]">
      <section className="hidden md:block">
        <p className="eyebrow">Clube de audição · desde a faixa 1</p>
        <h1 className="mt-3 text-7xl leading-[0.95] font-bold">
          1001
          <br />
          <span className="italic font-normal text-rust">álbuns</span>
        </h1>
        <p className="mt-6 max-w-sm text-lg text-ink-soft">
          Um disco por dia, sorteado à meia-noite, o mesmo para todo o grupo. Ouça, dê sua nota e compare com a turma.
        </p>
        <div
          aria-hidden="true"
          className="mt-10 h-56 w-56 rounded-full bg-ink"
          style={{
            background:
              'radial-gradient(circle, var(--color-paper) 0 3%, var(--color-rust) 3% 22%, #1b1814 22% 23%, transparent 23%), repeating-radial-gradient(circle, #1b1814 0 2px, #2c2721 2px 3px)',
          }}
        />
      </section>
      <section className="card mx-auto w-full max-w-md !p-8">
        <p className="eyebrow md:hidden">1001 álbuns</p>
        <h2 className="text-3xl font-semibold">{title}</h2>
        <hr className="rule !my-4" />
        {children}
      </section>
    </main>
  )
}
