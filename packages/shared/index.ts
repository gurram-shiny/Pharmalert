export const sections = {
  medicines: { title: 'Medicines', fields: [['name','Medicine name'],['dosage','Dosage'],['frequency','Frequency'],['start_date','Start date','date'],['end_date','End date','date'],['instructions','Instructions'],['notes','Notes'],['status','Status','choice:active,discontinued']] },
  supplements: { title: 'Supplements', fields: [['name','Product name'],['category','Category','choice:supplement,vitamin,herbal'],['dosage','Dosage'],['notes','Notes']] },
  alcohol_entries: { title: 'Alcohol log', fields: [['name','Beverage'],['amount','Amount'],['recorded_at','Date and time','datetime-local'],['notes','Notes']] },
  reminders: { title: 'Reminders', fields: [['medicine_id','Medicine','medicine'],['dosage','Dosage'],['scheduled_at','Scheduled time','datetime-local'],['repeat','Repeat','choice:once,daily,weekly']] },
  prescriptions: { title: 'Prescriptions', fields: [['doctor','Doctor'],['hospital','Hospital'],['prescribed_on','Prescription date','date'],['notes','Notes']] },
  health_records: { title: 'Health records', fields: [['kind','Measurement','choice:blood pressure,weight,blood glucose,note'],['value','Value and unit'],['recorded_at','Date and time','datetime-local'],['notes','Notes']] },
} as const;
export type Section = keyof typeof sections;
export type RecordRow = Record<string, unknown> & { id: string; created_at: string };
export function formatDate(value: unknown) {
  return typeof value === 'string' ? new Date(value).toLocaleString() : '—';
}
export const disclaimer = 'Interaction results are limited to the available evidence. Consult a qualified healthcare professional before changing your medication.';
export const fileTypes = ['application/pdf','image/jpeg','image/png'];
export const maxFileSize = 10 * 1024 * 1024;
export const measurementOptions = [
  ['weight:kg','Weight (kg)'],['weight:lb','Weight (lb)'],
  ['blood glucose:mg/dL','Blood glucose (mg/dL)'],['blood glucose:mmol/L','Blood glucose (mmol/L)'],
  ['blood pressure:mmHg','Blood pressure (mmHg)'],
] as const;
export function healthSeries(rows:RecordRow[], selection:string) {
  const [kind,unit] = selection.split(':');
  return rows.flatMap(row=>{
    if(row.kind!==kind)return [];
    const input=String(row.value);
    const match=kind==='blood pressure'?input.match(/^(\d+)\s*\/\s*(\d+)\s*mmhg$/i):input.match(/^(\d+(?:\.\d+)?)\s*(kg|lb|mg\/dl|mmol\/l)$/i);
    if(!match||(kind!=='blood pressure'&&match[2].toLowerCase()!==unit.toLowerCase()))return [];
    const timestamp=String(row.recorded_at);
    return [{id:row.id,timestamp,date:new Date(timestamp).toLocaleDateString(),value:Number(match[1]),diastolic:kind==='blood pressure'?Number(match[2]):undefined}];
  }).sort((left,right)=>Date.parse(left.timestamp)-Date.parse(right.timestamp));
}
