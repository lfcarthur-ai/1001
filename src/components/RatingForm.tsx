import { useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { StarInput, Stars } from './StarRating'
import { deleteRating, saveRating } from '~/server/albums.functions'
import { fmtStars } from '~/lib/format'
import type { Rating } from '~/lib/types'

export function RatingForm({ albumId, mine }: { albumId: number; mine: Rating | null }) {
  const router = useRouter()
  const save = useServerFn(saveRating)
  const remove = useServerFn(deleteRating)
  const [editing, setEditing] = useState(!mine || mine.score === null)
  const [score, setScore] = useState<number | null>(mine?.score != null ? Number(mine.score) : null)
  const [should, setShould] = useState(mine?.should_be_in_list ?? false)
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!score) return setError('Escolha uma nota entre 0,5 e 5 estrelas.')
    setBusy(true)
    setError(null)
    try {
      await save({ data: { albumId, score, shouldBeInList: should, comment } })
      await router.invalidate()
      setEditing(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!confirm('Excluir sua avaliação deste álbum?')) return
    setBusy(true)
    try {
      await remove({ data: { albumId } })
      setScore(null)
      setShould(false)
      setComment('')
      setEditing(true)
      setSaved(false)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  if (!editing && mine) {
    return (
      <section className="card" aria-labelledby="minha-avaliacao">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="minha-avaliacao" className="eyebrow">Sua avaliação</h2>
            <div className="mt-2 flex items-center gap-3">
              <Stars value={mine.score} size={26} />
              <span className="num text-xl">{fmtStars(mine.score)}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => { setEditing(true); setSaved(false) }}>
            Editar
          </button>
        </div>
        {saved && <p className="flash-ok mt-4">Avaliação salva!</p>}
        <p className="mt-3 text-sm text-ink-soft">
          Deveria estar na lista?{' '}
          <strong className="text-ink">
            {mine.should_be_in_list === null ? 'não informado' : mine.should_be_in_list ? 'Sim' : 'Não'}
          </strong>
        </p>
        {mine.comment && <blockquote className="mt-3 border-l-2 border-rust pl-3 italic">{mine.comment}</blockquote>}
      </section>
    )
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5" aria-labelledby="avaliar">
      <h2 id="avaliar" className="eyebrow">{mine ? 'Editar avaliação' : 'Sua avaliação'}</h2>
      {error && <p className="flash-error">{error}</p>}
      <StarInput value={score} onChange={setScore} />
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={should}
          onChange={(e) => setShould(e.target.checked)}
          className="h-5 w-5 accent-[var(--color-rust)]"
        />
        <span>Deveria estar na lista?</span>
      </label>
      <div>
        <label className="label" htmlFor={`comment-${albumId}`}>Comentário</label>
        <textarea
          id={`comment-${albumId}`}
          className="textarea min-h-28"
          maxLength={5000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="O que achou? Faixas favoritas, contexto, lembranças…"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar avaliação'}
        </button>
        {mine && mine.score !== null && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        )}
        {mine && (
          <button type="button" className="btn btn-ghost ml-auto" onClick={onDelete} disabled={busy}>
            Excluir
          </button>
        )}
      </div>
    </form>
  )
}
