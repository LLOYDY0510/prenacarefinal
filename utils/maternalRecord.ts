import { validDate, localDate } from '@/utils/calendar';
import { isValidBloodPressure } from '@/utils/maternalForm';

export const MATERNAL_FIELDS = ['date_registered','first_name','middle_name','last_name','address','purok','age','contact_number','lmp','gravida','para','edd','blood_pressure','waist_cm','height_cm','weight_kg','latitude','longitude'] as const;
export type MaternalRecordData = Record<string, unknown> & { id: string };

export function maternalFormValues(record?: MaternalRecordData) {
  const gp = String(record?.gravida_para ?? '').match(/^G(\d+)P(\d+)$/i);
  const value = (key: string) => String(record?.[key] ?? '');
  return {
    date_registered: record ? value('date_registered') : localDate(),
    first_name: value('first_name'), middle_name: value('middle_name'), last_name: value('last_name'),
    address: value('address'), purok: value('purok'), age: value('age'), contact_number: value('contact_number'),
    lmp: value('lmp'), gravida: gp?.[1] ?? '', para: gp?.[2] ?? '', edd: value('edd'),
    blood_pressure: value('blood_pressure'), waist_cm: value('waist_cm'), height_cm: value('height_cm'), weight_kg: value('weight_kg'),
  };
}

export function validateMaternalForm(form: Record<string, unknown>, original?: MaternalRecordData): string | null {
  const baseline = original ? {...maternalFormValues(original),latitude: original.latitude,longitude: original.longitude} : null;
  const unchanged = (key: string) => baseline != null && String(form[key] ?? '') === String((baseline as Record<string, unknown>)[key] ?? '');
  for (const key of ['first_name','last_name']) if (typeof form[key] !== 'string' || !(form[key] as string).trim() || (form[key] as string).length > 150) return 'First and last name are required (maximum 150 characters).';
  for (const key of ['middle_name','address','contact_number','blood_pressure']) if (form[key] != null && (typeof form[key] !== 'string' || (form[key] as string).length > 1000)) return 'Invalid patient information.';
  if ((!unchanged('date_registered') && (!validDate(form.date_registered as string) || String(form.date_registered) > localDate())) || ['lmp','edd'].some(key => form[key] && !validDate(form[key] as string))) return 'Provide valid registration and pregnancy dates.';
  for (const [key,min,max] of [['age',10,55],['gravida',0,30],['para',0,30],['waist_cm',0,Number.MAX_VALUE],['height_cm',50,250],['weight_kg',1,300],['latitude',-90,90],['longitude',-180,180]] as const) {
    if (form[key] != null && form[key] !== '' && !unchanged(key)) {
      if (!['string','number'].includes(typeof form[key])) return `Invalid ${key.replaceAll('_',' ')}.`;
      const value = Number(form[key]);
      if (!Number.isFinite(value) || value < min || value > max || (['age','gravida','para'].includes(key) && !Number.isInteger(value))) return `Invalid ${key.replaceAll('_',' ')}.`;
    }
  }
  if (form.waist_cm != null && form.waist_cm !== '' && Number(form.waist_cm) <= 0) return 'Waist Line must be greater than zero.';
  if (form.blood_pressure && !unchanged('blood_pressure') && !isValidBloodPressure(String(form.blood_pressure))) return 'Blood pressure must use the format 120/80.';
  if ((form.gravida == null || form.gravida === '') !== (form.para == null || form.para === '')) return 'Provide both Gravida and Para.';
  if (form.gravida !== '' && form.para !== '' && form.gravida != null && form.para != null && Number(form.para) > Number(form.gravida)) return 'Para cannot be greater than Gravida.';
  if (((form.latitude == null || form.latitude === '') !== (form.longitude == null || form.longitude === '')) && !(unchanged('latitude')&&unchanged('longitude'))) return 'Provide both latitude and longitude.';
  return null;
}

export function maternalErrorField(message:string): string | null {
  const text=message.toLowerCase();
  for(const [word,field] of [['first','first_name'],['last','last_name'],['registration','date_registered'],['date','date_registered'],['blood pressure','blood_pressure'],['waist','waist_cm'],['height','height_cm'],['weight','weight_kg'],['age','age'],['gravida','gravida'],['para','para'],['latitude','latitude'],['longitude','longitude'],['zone','purok']]) {
    if(new RegExp('\\b'+word+'\\b').test(text))return field;
  }
  return null;
}
