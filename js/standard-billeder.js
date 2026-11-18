// Lokale, genbrugelige motiver til arrangementer uden eget billede.
export const STANDARD_BILLEDER = [
  { id: 'musik', navn: 'Musik', ikon: '🎵' },
  { id: 'boern-leg', navn: 'Børn og leg', ikon: '🪁' },
  { id: 'sport-motion', navn: 'Sport og motion', ikon: '🏃' },
  { id: 'marked-fest', navn: 'Marked og fest', ikon: '🎪' },
  { id: 'teater', navn: 'Teater', ikon: '🎭' },
  { id: 'foredrag', navn: 'Foredrag', ikon: '🎤' },
  { id: 'mad', navn: 'Mad og fællesskab', ikon: '🍽️' },
  { id: 'natur', navn: 'Natur', ikon: '🌿' },
  { id: 'forening', navn: 'Forening', ikon: '🤝' },
  { id: 'andet', navn: 'Andet', ikon: '✨' },
];

const STANDARD_IDS = new Set(STANDARD_BILLEDER.map((b) => b.id));

export function standardBilledeUrl(id) {
  return STANDARD_IDS.has(id) ? new URL(`../images/standarder/${id}.svg`, import.meta.url).href : null;
}
