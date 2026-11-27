export const clinicalReleaseVersion='2026-11-27.audit1';
export type Kind = 'medicine' | 'supplement' | 'alcohol' | 'food';
export type Substance = { name: string; kind: Kind };
export type Identifier = { source_id: string; name: string; kind: Kind; normalized: string };
export type Rule = { left_id: string; right_id: string; rule_id:string; verification_status:'VERIFIED'; evidence_passage:string; section:string; label_version:string; source_id: string; classification: string; display: 'contraindicated' | 'other'; description: string; management: string; evidence: string; updated_on: string };
export type Dataset = { name: string; version: string; source_url: string; license: string };
export const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const pairKey = (a: string, b: string) => [a,b].sort().join('|');
export function parseSubstances(input: unknown): Substance[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 20) throw new Error('Enter between 2 and 20 substances.');
  return input.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 ||
        !['medicine','supplement','alcohol','food'].includes(item.kind)) throw new Error('Enter a valid name and category for each substance.');
    return { name: item.name.trim(), kind: item.kind };
  });
}
export function resolveSubstances(input: Substance[], identifiers: Identifier[]) {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const items = input.flatMap(substance => {
    const matches = identifiers.filter(row => row.kind === substance.kind &&
      (row.normalized === normalize(substance.name) || normalize(row.source_id) === normalize(substance.name)));
    const ids = new Set(matches.map(row => row.source_id));
    const identity = ids.size === 1 ? matches[0] : undefined;
    const key = identity ? identity.source_id : [substance.kind, normalize(substance.name)].join(':');
    if (seen.has(key)) { duplicates.push(substance.name); return []; }
    seen.add(key);
    return [{ ...substance, identity }];
  });
  if (items.length < 2) throw new Error('Enter at least two distinct substances.');
  return { items, duplicates };
}
export function analyze(resolved: ReturnType<typeof resolveSubstances>, rules: Rule[], dataset: Dataset, heldPairs:readonly string[]=[]) {
  const pairs = resolved.items.flatMap((left, index) => resolved.items.slice(index + 1).map(right => {
    const key = left.identity && right.identity && pairKey(left.identity.source_id, right.identity.source_id);
    const matches = key ? rules.filter(rule => pairKey(rule.left_id, rule.right_id) === key) : [];
    const status = !key ? 'unresolved' : matches.length ? 'matched' : heldPairs.includes(key) ? 'unverified' : 'no_match';
    return { left: left.name, right: right.name, status, matches };
  }));
  const matches = pairs.flatMap(pair => pair.matches);
  const highest = (['contraindicated','other'] as const).find(level => matches.some(rule => rule.display === level)) ?? 'unknown';
  return { dataset, duplicates: resolved.duplicates, pairs, highest, matchCount: matches.length };
}
export type Analysis = ReturnType<typeof analyze>;
export const evidenceMessages = {
  unverified: 'UNVERIFIED: evidence for this pair has not been confirmed.',
  unresolved: 'Medicine identity could not be confirmed. Please verify the medicine name.',
  no_match: 'No matching interaction was found in the available dataset. This does not establish that the combination is safe.',
};
