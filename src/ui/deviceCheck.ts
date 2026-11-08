/** True on touch-only devices: a coarse pointer and no fine pointer. Unknown (no matchMedia) counts as a laptop. */
export function isTouchOnly(mm?: (q: string) => { matches: boolean }): boolean {
  if (!mm) return false;
  return mm('(pointer: coarse)').matches && !mm('(pointer: fine)').matches;
}
