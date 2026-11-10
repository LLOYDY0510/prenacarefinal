import {ZONE_COLORS,zoneIdentity} from '@/utils/maps/zoneAreas';

export function ZoneLocationLabel({zone}:{zone?:string|null}) {
  const identity=zoneIdentity(zone);
  return <p className="flex items-center gap-2 text-xs text-neutral-700"><span aria-hidden className="inline-block h-3 w-3 rounded-sm border-2" style={{borderColor:identity.color}}/>{identity.label} · location area</p>;
}

export default function ZoneLegend() {
  return <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
    <h3 className="text-sm font-semibold text-neutral-900">Zone areas</h3>
    <div className="flex flex-wrap gap-x-5 gap-y-2">{Object.values(ZONE_COLORS).map(zone=><span key={zone.id} className="flex items-center gap-2 text-xs text-neutral-700"><span aria-hidden className="h-3 w-4 rounded-sm border-2" style={{borderColor:zone.color,backgroundColor:zone.color+'18'}}/>{zone.label}</span>)}</div>
    <p className="text-xs text-neutral-500">100 m location areas join within a zone. Shared edges separate zones. These are not official zone boundaries.</p>
  </div>;
}
