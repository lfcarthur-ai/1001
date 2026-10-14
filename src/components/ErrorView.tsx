import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'

export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">Agulha pulou</p>
      <h1 className="mt-2 text-4xl">Algo deu errado</h1>
      <p className="mt-4 text-ink-soft">{error instanceof Error ? error.message : 'Tente novamente em instantes.'}</p>
      <div className="mt-8 flex justify-center gap-3">
        <button className="btn" onClick={() => router.invalidate()}>
          Tentar de novo
        </button>
        <Link to="/" className="btn btn-ghost">
          Início
        </Link>
      </div>
    </div>
  )
}
