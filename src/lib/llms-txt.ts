/** Un llms.txt réel est du texte/markdown, pas une page HTML servie en 200 (soft 404). */
export function isRealLlmsTxt(text: string | null): boolean {
  if (text === null) return false;
  const head = text.trimStart().slice(0, 200).toLowerCase();
  if (!head) return false;
  return !head.startsWith("<");
}
