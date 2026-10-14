// Parâmetros de busca compartilhados (projeto selecionado e usuário observado).
import type { Project } from './types'

export function numParam(v: unknown): number | undefined {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined
}

export function strParam(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export const projectSearch = (s: Record<string, unknown>): { projeto?: number } => ({ projeto: numParam(s.projeto) })

export function currentProject(projects: Project[], projeto: number | undefined): Project | undefined {
  return projects.find((p) => p.id === projeto) ?? projects.find((p) => p.status === 'active')
}
