// Gráficos (recharts). Série única em ferrugem; comparação "eu × grupo" em ferrugem × azul
// (paleta validada contra o fundo creme). Renderizados só no cliente.
import { ClientOnly } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fmtNum } from '~/lib/format'

const RUST = '#b4461c'
const SKY = '#1f6fa3'
const GRID = '#d9cdb2'
const AXIS = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fill: '#51483e' }

function Frame({ height = 260, label, children }: { height?: number; label: string; children: ReactNode }) {
  return (
    <figure aria-label={label} className="w-full" style={{ height }}>
      <ClientOnly fallback={<div className="h-full w-full animate-pulse rounded-sm bg-paper-deep/60" />}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </ClientOnly>
    </figure>
  )
}

const tooltipStyle = {
  contentStyle: {
    background: '#f8f2e6',
    border: '1px solid #1b1814',
    borderRadius: 2,
    fontFamily: 'Source Serif 4, serif',
    fontSize: 14,
  },
  labelStyle: { fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, textTransform: 'uppercase' as const },
  cursor: { fill: 'rgb(27 24 20 / 0.06)' },
}

/** Distribuição de notas (0,5 a 5). */
export function DistributionChart({ data }: { data: { stars: number | string | null; count: number }[] }) {
  const rows = data.map((d) => ({ label: fmtNum(d.stars, 1), count: d.count }))
  return (
    <Frame label="Distribuição das notas do grupo">
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: '#1b1814' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v) => [v, 'Notas']} labelFormatter={(l) => `${l} estrelas`} />
        <Bar dataKey="count" fill={RUST} radius={[4, 4, 0, 0]} name="Notas" />
      </BarChart>
    </Frame>
  )
}

/** Média por categoria (série única). */
export function AvgBarChart({ rows, label }: { rows: { label: string; avg: number | null; n: number }[]; label: string }) {
  return (
    <Frame label={label}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: '#1b1814' }} tickLine={false} interval={0} angle={rows.length > 8 ? -35 : 0} textAnchor={rows.length > 8 ? 'end' : 'middle'} height={rows.length > 8 ? 60 : 30} />
        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v, _n, item) => [`${fmtNum(v as number)} (${(item.payload as { n: number }).n} álbuns)`, 'Média']}
        />
        <Bar dataKey="avg" fill={RUST} radius={[4, 4, 0, 0]} name="Média" maxBarSize={48} />
      </BarChart>
    </Frame>
  )
}

/** Minha média × média do grupo por categoria (duas séries, legenda sempre visível). */
export function CompareBarChart({
  rows,
  label,
  mine = 'Minha média',
}: {
  rows: { label: string; user: number | null; group: number | null }[]
  label: string
  mine?: string
}) {
  return (
    <Frame label={label} height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: '#1b1814' }} tickLine={false} interval={0} angle={rows.length > 8 ? -35 : 0} textAnchor={rows.length > 8 ? 'end' : 'middle'} height={rows.length > 8 ? 60 : 30} />
        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtNum(v as number), n]} />
        <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }} iconType="square" />
        <Bar dataKey="user" fill={RUST} radius={[4, 4, 0, 0]} name={mine} maxBarSize={36} />
        <Bar dataKey="group" fill={SKY} radius={[4, 4, 0, 0]} name="Média do grupo" maxBarSize={36} />
      </BarChart>
    </Frame>
  )
}

/** Média por ano de lançamento: minha × grupo. */
export function YearLineChart({ rows, mine = 'Minha média' }: { rows: { year: string; user: number | null; group: number | null }[]; mine?: string }) {
  return (
    <Frame label="Média por ano de lançamento" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="year" tick={AXIS} axisLine={{ stroke: '#1b1814' }} tickLine={false} minTickGap={16} />
        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: '#1b1814', strokeDasharray: '3 3' }} formatter={(v, n) => [fmtNum(v as number), n]} />
        <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }} iconType="plainline" />
        <Line type="monotone" dataKey="user" stroke={RUST} strokeWidth={2} dot={{ r: 4, fill: RUST, stroke: '#f2ead9', strokeWidth: 2 }} name={mine} connectNulls />
        <Line type="monotone" dataKey="group" stroke={SKY} strokeWidth={2} dot={{ r: 4, fill: SKY, stroke: '#f2ead9', strokeWidth: 2 }} name="Média do grupo" connectNulls strokeDasharray="5 3" />
      </LineChart>
    </Frame>
  )
}
