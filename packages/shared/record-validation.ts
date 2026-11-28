import {sections} from './index.ts';
export class RecordValidationError extends Error {}
function invalid(message:string):never {throw new RecordValidationError(message);}
export function clean(section: keyof typeof sections, input: Record<string,unknown>) {
  const result: Record<string,unknown> = {};
  for (const field of sections[section].fields) {
    const [key,,format] = field as readonly [string,string,string?];
    const value = input[key];
    if (value == null || value === '') { result[key] = null; continue; }
    if (typeof value !== 'string' || value.length > 2000) invalid('Invalid field: '+key);
    if (format?.startsWith('choice:') && !format.slice(7).split(',').includes(value)) invalid('Invalid option.');
    if (format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) invalid('Invalid date.');
    if (format === 'datetime-local' && !Number.isFinite(Date.parse(value))) invalid('Invalid time.');
    result[key] = value.trim();
  }
  const required: Partial<Record<keyof typeof sections,string[]>> = {
    medicines:['name','status'], supplements:['name','category'], alcohol_entries:['name','amount','recorded_at'],
    reminders:['medicine_id','scheduled_at','repeat'], health_records:['kind','value','recorded_at'],
  };
  if (required[section]?.some(key=>!result[key])) invalid('Complete the required fields.');
  if (result.start_date && result.end_date && String(result.start_date) > String(result.end_date)) invalid('End date must follow start date.');
  return result;
}
