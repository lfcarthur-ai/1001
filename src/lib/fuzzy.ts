// Similaridade de strings no estilo RapidFuzz (0–100), usada no enriquecimento.

function lcsLength(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  let prev = new Array<number>(b.length + 1).fill(0)
  let cur = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/** Similaridade normalizada pela distância Indel (equivale a fuzz.ratio). */
export function ratio(a: string, b: string): number {
  const total = a.length + b.length
  if (total === 0) return 100
  return (200 * lcsLength(a, b)) / total
}

const tokens = (s: string) => s.split(/\s+/).filter(Boolean)

export function tokenSortRatio(a: string, b: string): number {
  return ratio(tokens(a).sort().join(' '), tokens(b).sort().join(' '))
}

export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  const inter = [...ta].filter((t) => tb.has(t)).sort()
  const diffA = [...ta].filter((t) => !tb.has(t)).sort()
  const diffB = [...tb].filter((t) => !ta.has(t)).sort()
  if (inter.length && (!diffA.length || !diffB.length)) return 100
  const base = inter.join(' ')
  const withA = [base, ...diffA].filter(Boolean).join(' ')
  const withB = [base, ...diffB].filter(Boolean).join(' ')
  return Math.max(ratio(base, withA), ratio(base, withB), ratio(withA, withB))
}
