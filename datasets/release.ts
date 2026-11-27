import audit from './interaction-audit.json' with {type:'json'};
import {createHash} from 'node:crypto';
import { clinicalReleaseVersion, analyze, resolveSubstances, parseSubstances, normalize, type Identifier, type Rule } from '../packages/interaction-engine/index.ts';

export const dataset = {
  name: 'openFDA SPL · Expanded Clinical Reference',
  version: clinicalReleaseVersion,
  license: 'US prescribing information',
  source_url: 'https://dailymed.nlm.nih.gov/dailymed/',
};
export const sourceId = '11256523-425c-48e8-afe1-e3a4e28c892e';
export const sourceDate = '2025-03-28';

const identities = [
  // Statins & originals
  ['simvastatin', 'Simvastatin', 'medicine'], ['simvastatin', 'Zocor', 'medicine'],
  ['atorvastatin', 'Atorvastatin', 'medicine'], ['atorvastatin', 'Lipitor', 'medicine'],
  ['gemfibrozil', 'Gemfibrozil', 'medicine'], ['gemfibrozil', 'Lopid', 'medicine'],
  ['cyclosporine', 'Cyclosporine', 'medicine'],
  ['danazol', 'Danazol', 'medicine'],
  // Pain / NSAIDs / Analgesics
  ['aspirin', 'Aspirin', 'medicine'], ['aspirin', 'Ecosprin', 'medicine'],
  ['ibuprofen', 'Ibuprofen', 'medicine'], ['ibuprofen', 'Advil', 'medicine'], ['ibuprofen', 'Motrin', 'medicine'],
  ['naproxen', 'Naproxen', 'medicine'], ['naproxen', 'Aleve', 'medicine'],
  ['acetaminophen', 'Acetaminophen', 'medicine'], ['acetaminophen', 'Paracetamol', 'medicine'], ['acetaminophen', 'Tylenol', 'medicine'], ['acetaminophen', 'Dolo', 'medicine'],
  ['tramadol', 'Tramadol', 'medicine'],
  // Cardiovascular / Blood thinners
  ['warfarin', 'Warfarin', 'medicine'], ['warfarin', 'Coumadin', 'medicine'],
  ['clopidogrel', 'Clopidogrel', 'medicine'], ['clopidogrel', 'Plavix', 'medicine'],
  ['lisinopril', 'Lisinopril', 'medicine'],
  ['losartan', 'Losartan', 'medicine'],
  ['amlodipine', 'Amlodipine', 'medicine'],
  ['metoprolol', 'Metoprolol', 'medicine'],
  ['furosemide', 'Furosemide', 'medicine'], ['furosemide', 'Lasix', 'medicine'],
  ['spironolactone', 'Spironolactone', 'medicine'],
  ['amiodarone', 'Amiodarone', 'medicine'],
  ['digoxin', 'Digoxin', 'medicine'],
  ['nitroglycerin', 'Nitroglycerin', 'medicine'],
  ['sildenafil', 'Sildenafil', 'medicine'], ['sildenafil', 'Viagra', 'medicine'],
  // GI / Metabolic / Endocrine
  ['omeprazole', 'Omeprazole', 'medicine'], ['omeprazole', 'Prilosec', 'medicine'],
  ['metformin', 'Metformin', 'medicine'], ['metformin', 'Glucophage', 'medicine'],
  ['levothyroxine', 'Levothyroxine', 'medicine'], ['levothyroxine', 'Synthroid', 'medicine'],
  ['insulin', 'Insulin', 'medicine'],
  // Antibiotics / Antifungals
  ['amoxicillin', 'Amoxicillin', 'medicine'],
  ['azithromycin', 'Azithromycin', 'medicine'],
  ['clarithromycin', 'Clarithromycin', 'medicine'],
  ['ciprofloxacin', 'Ciprofloxacin', 'medicine'], ['ciprofloxacin', 'Cipro', 'medicine'],
  ['metronidazole', 'Metronidazole', 'medicine'], ['metronidazole', 'Flagyl', 'medicine'],
  ['fluconazole', 'Fluconazole', 'medicine'],
  // CNS / Psych / Allergy
  ['fluoxetine', 'Fluoxetine', 'medicine'], ['fluoxetine', 'Prozac', 'medicine'],
  ['sertraline', 'Sertraline', 'medicine'], ['sertraline', 'Zoloft', 'medicine'],
  ['lithium', 'Lithium', 'medicine'],
  ['alprazolam', 'Alprazolam', 'medicine'], ['alprazolam', 'Xanax', 'medicine'],
  ['diazepam', 'Diazepam', 'medicine'], ['diazepam', 'Valium', 'medicine'],
  ['cetirizine', 'Cetirizine', 'medicine'], ['cetirizine', 'Zyrtec', 'medicine'],
  // Supplements
  ['st-johns-wort', "St. John's Wort", 'supplement'],
  ['potassium', 'Potassium', 'supplement'],
  ['calcium', 'Calcium', 'supplement'],
  ['iron', 'Iron', 'supplement'],
  ['vitamin-k', 'Vitamin K', 'supplement'],
  ['vitamin-d', 'Vitamin D', 'supplement'],
  ['fish-oil', 'Fish Oil', 'supplement'],
  ['magnesium', 'Magnesium', 'supplement'],
  // Alcohol & Foods
  ['alcohol', 'Alcohol', 'alcohol'], ['alcohol', 'Beer', 'alcohol'], ['alcohol', 'Wine', 'alcohol'], ['alcohol', 'Whiskey', 'alcohol'],
  ['grapefruit-juice', 'Grapefruit juice', 'food'], 
  ['caffeine', 'Caffeine', 'food'], 
] as const;

export const identifiers: Identifier[] = identities.map(([source_id, name, kind]) => ({
  source_id,
  name,
  kind,
  normalized: normalize(name),
}));


export const rules: Rule[] = audit.filter(row=>row.verification_status==='VERIFIED').map(row=>({
  rule_id:row.rule_id, left_id:row.left_id, right_id:row.right_id, source_id:row.source_id!,
  verification_status:'VERIFIED', evidence_passage:row.passage!, section:row.section!,
  label_version:String(row.label_version), classification:row.classification!,
  display:row.classification==='Contraindicated'?'contraindicated':'other',
  description:row.label+' ('+row.generic+'), label v'+row.label_version+' · '+row.section!.replaceAll('_',' '),
  management:row.passage!, evidence:row.evidence!, updated_on:row.updated_on!
}));
export const heldPairs=audit.filter(row=>row.verification_status==='UNVERIFIED').map(row=>row.rule_id);
export function validateRelease(){
  const digest=createHash('sha256').update(JSON.stringify({dataset,identifiers,rules,heldPairs})).digest('hex');
  if(digest!=='beead810c2d7349f33c1785bfa9f4a3194f28bf15edf4b65fc3e359b1ded0444')throw new Error('Evidence release differs from audited snapshot.');
  return rules.length;
}
export function checkInputs(input:unknown){
  return analyze(resolveSubstances(parseSubstances(input),identifiers),rules,dataset,heldPairs);
}
