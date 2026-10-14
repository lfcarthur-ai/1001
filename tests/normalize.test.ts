import { describe, expect, it } from 'vitest'
import { normalize } from '~/lib/normalize'

describe('normalize', () => {
  it.each([
    ['The Beatles & Friends: Don’t Stop!', 'beatles friends dont stop'],
    ['Os Mutantes — A Divina Comédia', 'mutantes divina comedia'],
    ['¿Dónde está la "Señal"?', 'donde esta senal'],
    ['Sgt. Pepper\'s Lonely Hearts Club Band', 'sgt peppers lonely hearts club band'],
    ['AC/DC', 'ac dc'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected)
  })

  it('ignora diferenças de aspas, caixa e pontuação', () => {
    expect(normalize('What’s Going On')).toBe(normalize("WHAT'S GOING ON"))
    expect(normalize('Rock & Roll')).toBe(normalize('Rock and Roll'))
  })
})
