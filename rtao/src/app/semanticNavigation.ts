export interface NavigationEntry {
  readonly disabled?: boolean;
  readonly hidden?: boolean | "until-found";
}

export interface FocusableNavigationEntry extends NavigationEntry {
  focus(): void;
}

export function navigationEntryAvailable(entry: NavigationEntry): boolean {
  return !entry.disabled && !entry.hidden;
}

export function moveNavigationIndex(
  entries: readonly NavigationEntry[],
  currentIndex: number,
  direction: number,
): number {
  if (entries.length === 0 || direction === 0) return currentIndex;
  const step = direction < 0 ? -1 : 1;
  let index = currentIndex >= 0 && currentIndex < entries.length
    ? currentIndex
    : step > 0 ? -1 : 0;
  for (let attempt = 0; attempt < entries.length; attempt += 1) {
    index = (index + step + entries.length) % entries.length;
    if (navigationEntryAvailable(entries[index]!)) return index;
  }
  return navigationEntryAvailable(entries[currentIndex] ?? {}) ? currentIndex : -1;
}

export function focusNavigationEntry(
  entries: readonly FocusableNavigationEntry[],
  preferredIndex: number,
): number {
  const resolved = navigationEntryAvailable(entries[preferredIndex] ?? {})
    ? preferredIndex
    : moveNavigationIndex(entries, -1, 1);
  if (resolved >= 0) entries[resolved]!.focus();
  return resolved;
}

export function cycleOptionIndex(currentIndex: number, optionCount: number, direction: number): number {
  if (optionCount <= 0 || direction === 0) return currentIndex;
  const step = direction < 0 ? -1 : 1;
  const safeCurrent = currentIndex >= 0 && currentIndex < optionCount ? currentIndex : 0;
  return (safeCurrent + step + optionCount) % optionCount;
}
