import { stripAccents } from '../normalize'

export function rymSlug(text: string): string {
  return stripAccents(text ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** O RateYourMusic não tem API: o link segue o padrão de URL do site. */
export function rymUrl(album: { artist: string; title: string }): string {
  return `https://rateyourmusic.com/release/album/${rymSlug(album.artist)}/${rymSlug(album.title)}/`
}

export function wikipediaSearchUrl(album: { artist: string; title: string }): string {
  return `https://pt.wikipedia.org/w/index.php?search=${encodeURIComponent(`${album.title} ${album.artist}`)}`
}
