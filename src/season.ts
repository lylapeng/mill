// Seasons are a layer over the usual yard, switched on by the device's date: the levels,
// the economy and the saves never change, only the look. Decided once at startup (a game
// that is open across midnight on 1 January keeps its snow until the next launch).

export type Season = 'xmas' | null;

/** Christmas snow: 10 December to 1 January, both days included, local time. */
export function seasonOn(date: Date): Season {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 12 && d >= 10) || (m === 1 && d === 1)) return 'xmas';
  return null;
}

let current: Season = seasonOn(new Date());

export const season = () => current;
export const winter = () => current === 'xmas';

/** For previews and screenshots; call before the App is built. */
export function setSeason(s: Season) {
  current = s;
}
