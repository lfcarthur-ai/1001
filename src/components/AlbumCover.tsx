import { useState } from 'react'

type Props = {
  album: { artist: string; title: string; cover_url: string | null }
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { xs: 'w-10 h-10', sm: 'w-16 h-16', md: 'w-40 h-40', lg: 'w-full aspect-square max-w-[460px]' }

/** Capa do álbum; sem capa, um selo de vinil com artista e título. */
export function AlbumCover({ album, size = 'md', className = '' }: Props) {
  const [broken, setBroken] = useState(false)
  const box = `${SIZES[size]} shrink-0 ${className}`
  if (album.cover_url && !broken) {
    return (
      <img
        src={album.cover_url}
        alt={`Capa de ${album.title}, de ${album.artist}`}
        loading={size === 'lg' ? 'eager' : 'lazy'}
        onError={() => setBroken(true)}
        className={`${box} rounded-[2px] object-cover bg-paper-deep ${size === 'xs' ? '' : 'cover-shadow'}`}
      />
    )
  }
  const showText = size === 'md' || size === 'lg'
  return (
    <div
      role="img"
      aria-label={`Sem capa: ${album.title}, de ${album.artist}`}
      className={`${box} relative overflow-hidden rounded-[2px] bg-ink ${size === 'xs' ? '' : 'cover-shadow'}`}
    >
      <div
        className="absolute inset-[6%] rounded-full"
        style={{ background: 'repeating-radial-gradient(circle, #1b1814 0 2px, #2a251f 2px 3px)' }}
      />
      <div className="absolute inset-[34%] flex flex-col items-center justify-center rounded-full bg-rust p-1 text-center text-paper">
        {showText && (
          <>
            <span className="line-clamp-2 font-display text-[clamp(0.55rem,2.2vw,1rem)] leading-tight font-semibold">
              {album.title}
            </span>
            <span className="mt-0.5 line-clamp-1 font-mono text-[clamp(0.45rem,1.4vw,0.65rem)] uppercase tracking-wider opacity-80">
              {album.artist}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
