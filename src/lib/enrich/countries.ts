// Códigos ISO 3166-1 alfa-2 (MusicBrainz) → nome em português
const COUNTRY_NAMES: Record<string, string> = {
  US: 'Estados Unidos', GB: 'Reino Unido', XE: 'Europa', XW: 'Mundial',
  CA: 'Canadá', AU: 'Austrália', NZ: 'Nova Zelândia', IE: 'Irlanda',
  DE: 'Alemanha', FR: 'França', IT: 'Itália', ES: 'Espanha', PT: 'Portugal',
  NL: 'Países Baixos', BE: 'Bélgica', SE: 'Suécia', NO: 'Noruega',
  DK: 'Dinamarca', FI: 'Finlândia', IS: 'Islândia', AT: 'Áustria',
  CH: 'Suíça', PL: 'Polônia', CZ: 'Tchéquia', HU: 'Hungria', GR: 'Grécia',
  RU: 'Rússia', SU: 'União Soviética', UA: 'Ucrânia', TR: 'Turquia',
  BR: 'Brasil', AR: 'Argentina', CL: 'Chile', CO: 'Colômbia', MX: 'México',
  CU: 'Cuba', JM: 'Jamaica', TT: 'Trinidad e Tobago', PE: 'Peru', UY: 'Uruguai',
  VE: 'Venezuela', PR: 'Porto Rico', BB: 'Barbados',
  JP: 'Japão', KR: 'Coreia do Sul', CN: 'China', IN: 'Índia', ID: 'Indonésia',
  IL: 'Israel', IR: 'Irã', PK: 'Paquistão', TH: 'Tailândia', VN: 'Vietnã',
  ZA: 'África do Sul', NG: 'Nigéria', ML: 'Mali', SN: 'Senegal', GH: 'Gana',
  BJ: 'Benin', CD: 'Rep. Dem. do Congo', CM: 'Camarões', EG: 'Egito',
  ET: 'Etiópia', CV: 'Cabo Verde', AO: 'Angola', MZ: 'Moçambique',
  DZ: 'Argélia', MA: 'Marrocos', KE: 'Quênia', ZW: 'Zimbábue', NE: 'Níger',
  XG: 'Alemanha Oriental', YU: 'Iugoslávia', CS: 'Tchecoslováquia',
}

export function countryName(codeOrName: string | null | undefined): string | null {
  if (!codeOrName) return null
  return codeOrName.length === 2 ? (COUNTRY_NAMES[codeOrName.toUpperCase()] ?? codeOrName) : codeOrName
}
