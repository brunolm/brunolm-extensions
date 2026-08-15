import { MAX_GROUPS_PER_TAB } from './limits.js';

export function groupKey(item) {
  if (item.kind !== 'video' && item.kind !== 'audio') return item.url;
  const prefix = item.url.match(/^(.*?)\/\d{3,4}x\d{3,4}\//)?.[1];
  return prefix ? `${item.kind}|${prefix}` : item.url;
}

export function groupCount(items) {
  return new Set(items.map(groupKey)).size;
}

export function evictOldestGroups(items, maxGroups = MAX_GROUPS_PER_TAB) {
  const groups = new Map();
  for (const item of items) {
    const key = groupKey(item);
    const foundAt = item.foundAt ?? 0;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { foundAt, items: [item] });
      continue;
    }
    group.items.push(item);
    if (foundAt < group.foundAt) group.foundAt = foundAt;
  }

  if (groups.size <= maxGroups) return items;

  return [...groups.values()]
    .sort((a, b) => a.foundAt - b.foundAt)
    .slice(groups.size - maxGroups)
    .flatMap((group) => group.items);
}
