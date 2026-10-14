import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="eyebrow">Faixa oculta</p>
      <h1 className="mt-2 text-5xl">Página não encontrada</h1>
      <p className="mt-4 text-ink-soft">O endereço acessado não existe ou o álbum ainda não foi sorteado.</p>
      <Link to="/" className="btn mt-8">
        Voltar ao álbum do dia
      </Link>
    </div>
  )
}
