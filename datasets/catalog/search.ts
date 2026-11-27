import catalog from './names.json';

export type CatalogKind = 'medicine' | 'supplement' | 'food';

const priority: Record<CatalogKind, string[]> = {
  medicine: [
    'Dolo', 'Paracetamol', 'Acetaminophen', 'Tylenol',
    'Aspirin', 'Ecosprin', 'Ibuprofen', 'Advil', 'Motrin', 'Naproxen', 'Aleve',
    'Warfarin', 'Coumadin', 'Clopidogrel', 'Plavix',
    'Simvastatin', 'Zocor', 'Atorvastatin', 'Lipitor', 'Gemfibrozil', 'Lopid',
    'Metformin', 'Glucophage', 'Insulin', 'Levothyroxine', 'Synthroid',
    'Lisinopril', 'Losartan', 'Amlodipine', 'Metoprolol', 'Furosemide', 'Lasix', 'Spironolactone',
    'Amiodarone', 'Digoxin', 'Nitroglycerin', 'Sildenafil', 'Viagra',
    'Omeprazole', 'Prilosec', 'Amoxicillin', 'Azithromycin', 'Clarithromycin',
    'Ciprofloxacin', 'Cipro', 'Metronidazole', 'Flagyl', 'Fluconazole',
    'Fluoxetine', 'Prozac', 'Sertraline', 'Zoloft', 'Tramadol',
    'Alprazolam', 'Xanax', 'Diazepam', 'Valium', 'Lithium',
    'Cetirizine', 'Zyrtec', 'Cyclosporine', 'Danazol',
  ],
  supplement: [
    "St. John's Wort", 'Potassium', 'Calcium', 'Iron',
    'Vitamin K', 'Vitamin D', 'Fish Oil', 'Magnesium',
  ],
  food: ['Grapefruit juice', 'Caffeine'],
};

const prioritySet = new Map<CatalogKind, Set<string>>(
  (Object.keys(priority) as CatalogKind[]).map(k => [k, new Set(priority[k].map(n => n.toLowerCase()))]),
);
const statuses = new Map<'medicine' | 'supplement', Map<string, number>>();
const indexes = new Map<'medicine' | 'supplement', { name: string; key: string }[]>();

function ensureIndex(kind: 'medicine' | 'supplement') {
  let rows = indexes.get(kind);
  if (!rows) {
    rows = catalog[kind].split('\n').map(name => ({ name, key: name.toLowerCase() }));
    indexes.set(kind, rows);
    statuses.set(kind, new Map(rows.map((row, i) => [row.key, Number(catalog.status[kind][i])])));
  }
  return rows;
}

export function suggestions(kind: CatalogKind, search: string): string[] {
  const query = search.trim().toLowerCase();
  const top = priority[kind].filter(name => !query || name.toLowerCase().includes(query));
  if (kind === 'food') return top;
  if (!query) return [];
  if (query.length < 2) return top.slice(0, 8);
  const rows = ensureIndex(kind);
  const seen = new Set(top.map(n => n.toLowerCase()));
  const prefix: string[] = [];
  const other: string[] = [];
  for (const { name, key } of rows) {
    if (seen.has(key)) continue;
    if (key === query) prefix.unshift(name);
    else if (key.startsWith(query)) prefix.push(name);
    else if (other.length < 8 && key.includes(query)) other.push(name);
    if (top.length + prefix.length >= 10) break;
  }
  return [...top, ...prefix, ...other].slice(0, 10);
}

export function catalogStatus(kind: CatalogKind, name: string) {
  const key = name.trim().toLowerCase();
  if (kind === 'food') {
    return prioritySet.get('food')?.has(key)
      ? 'Supported food entry'
      : 'Supported foods only: Grapefruit juice, Caffeine';
  }
  if (prioritySet.get(kind)?.has(key)) return 'Supported in interaction checker';
  ensureIndex(kind);
  const flag = statuses.get(kind)?.get(key);
  if (flag === undefined) return '';
  if (flag === 1) return 'Historical product only';
  if (flag && (flag & 1)) return 'Includes historical products';
  if (flag === 2) return 'Marketed in source snapshot';
  return flag === 0 ? 'Ingredient name · availability varies' : 'Market status uncertain';
}
