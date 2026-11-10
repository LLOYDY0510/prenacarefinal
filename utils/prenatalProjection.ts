import { getPrenatalVisitStatus } from './prenatalStatus';
import { localDate } from './calendar';

export const TRIMESTERS = ['1st', '2nd', '3rd'] as const;
type Trimester = (typeof TRIMESTERS)[number];
export type ScheduledVisit = {id:string; trimester:string|null; visit_date:string; status?:string;visit_number?:number|null};
type ScheduleRow = {
  id?:string;visit_number?:number|null;
  trimester: string | null; visit_date: string; status?: string;
  prenatal_schedule_recipients?: { pregnant_mother_id: string }[];
};
export type TrimesterDates = Record<Trimester, string | null>;

export function emptyTrimesterDates(): TrimesterDates {
  return { '1st': null, '2nd': null, '3rd': null };
}

export function scheduleProjection(rows: ScheduleRow[]) {
  const scheduledByMother: Record<string, TrimesterDates> = {};
  const nextVisit: Record<string, string> = {};
  const visitsByMother:Record<string,ScheduledVisit[]>={};
  for (const row of rows) {
    if (row.status === 'cancelled' || !TRIMESTERS.includes(row.trimester as Trimester)) continue;
    for (const recipient of row.prenatal_schedule_recipients ?? []) {
      const id = recipient.pregnant_mother_id;
      if(row.id)(visitsByMother[id]??=[]).push({id:row.id,trimester:row.trimester,visit_date:row.visit_date,status:row.status,visit_number:row.visit_number});
      const dates = scheduledByMother[id] ??= emptyTrimesterDates();
      dates[row.trimester as Trimester] ??= row.visit_date;
      if ((row.status === undefined || row.status === 'scheduled') && row.visit_date >= localDate() &&
        (!nextVisit[id] || row.visit_date < nextVisit[id])) nextVisit[id] = row.visit_date;
    }
  }
  return { scheduledByMother, nextVisit, visitsByMother };
}

export function visitStatusFor(checkup: {
  scheduled_checkup_date?: string | null; scheduled_for?: string | null;
  checkup_date?: string | null; actual_checkup_date?: string | null; status?: string;
}) {
  return getPrenatalVisitStatus({
    scheduledFor: checkup.scheduled_checkup_date ?? checkup.scheduled_for ?? checkup.checkup_date,
    actualCheckupDate: checkup.actual_checkup_date, recordedStatus: checkup.status,
  });
}

export function visitLabel(value:number|null|undefined){return value===1?'1st Visit':value===2?'2nd Visit':value===3?'3rd Visit':'Legacy visit (unassigned)';}

export function trimesterVisitSummary(visits:ScheduledVisit[],checkups:{schedule_id?:string|null;actual_checkup_date?:string|null;status?:string}[],trimester:string){
  const assigned=visits.filter(v=>v.trimester===trimester&&v.visit_number!=null&&v.status!=='cancelled');
  const completed=assigned.filter(v=>checkups.some(c=>c.schedule_id===v.id&&visitStatusFor(c)==='completed')).length;
  return {completed,assigned:assigned.length,complete:[1,2,3].every(number=>assigned.some(v=>v.visit_number===number&&checkups.some(c=>c.schedule_id===v.id&&visitStatusFor(c)==='completed')))};
}
