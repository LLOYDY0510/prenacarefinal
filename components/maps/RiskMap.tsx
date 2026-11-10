'use client';

import ZoneAreaLayer from './ZoneAreaLayer';
import {buildZoneAreas,validMapPoint,zoneIdentity} from '@/utils/maps/zoneAreas';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, LayersControl, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type RiskPoint = {
  id: string;
  serial_no: string | null;
  full_name: string;
  purok: string | null;
  age: number | null;
  address: string | null;
  contact_number: string | null;
  lmp: string | null;
  edd: string | null;
  gravida_para: string | null;
  risk_level: 'low' | 'high' | string;
  latitude: number;
  longitude: number;
};

const RISK_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  high: { fill: '#DC2626', stroke: '#7F1D1D', label: 'High Risk' },
  low: { fill: '#16A34A', stroke: '#14532D', label: 'Low Risk' },
};

function getRiskColor(level: string) {
  return RISK_COLORS[level] ?? { fill: '#6B7280', stroke: '#374151', label: 'Unassessed' };
}

function makePinIcon(riskLevel: string, count?:number, levels:string[] = [riskLevel]) {
  const level = levels.includes('high') ? 'high' : levels.every(value=>value==='low') ? 'low' : 'unknown';
  const { fill, stroke } = getRiskColor(level);
  const shape = 'M14 0C6.27 0 0 6.27 0 14c0 9.33 14 24 14 24S28 23.33 28 14C28 6.27 21.73 0 14 0z';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 38" width="28" height="38">
      <path d="${shape}"
        fill="${fill}"
        stroke="${stroke}"
        stroke-width="3"
      />
      <path d="${shape}" fill="none" stroke="${stroke}" stroke-width="2"/>
      <circle cx="14" cy="14" r="9" fill="white"/>
      <text x="14" y="18" text-anchor="middle" font-size="12" font-family="sans-serif" font-weight="bold" fill="#111111">${count??(riskLevel==='high'?'H':riskLevel==='low'?'L':'?')}</text>
    </svg>
  `.trim();

  return divIcon({
    html: svg,
    className: 'risk-map-pin',
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -40],
  });
}

const DEFAULT_CENTER: [number, number] = [8.315242, 124.860898];

function AutoResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function RiskMap({
  records,
  pendingClick,
  areaRecords,
  showAreas=true,
}: {
  records: RiskPoint[];
  areaRecords?:RiskPoint[];
  showAreas?:boolean;
  pendingClick?: (lat: number, lng: number) => void;
}) {
  const [selected,setSelected]=useState<Record<string,string>>({});
  const areaSource=areaRecords??records;
  const model=useMemo(()=>{
    try{return {geometry:buildZoneAreas(areaSource),error:false};}
    catch{return {geometry:{areas:[],borders:[]},error:true};}
  },[areaSource]);
  const visibleIds=useMemo(()=>new Set(records.map(p=>p.id)),[records]);
  const groups=useMemo(()=>{
    const grouped=new Map<string,RiskPoint[]>();
    for(const point of records.filter(validMapPoint)){
      const key=`${point.latitude}:${point.longitude}`;
      grouped.set(key,[...(grouped.get(key)??[]),point]);
    }
    return [...grouped.entries()];
  },[records]);
  return (
    <div className="relative w-full h-[520px] rounded-[24px] overflow-hidden border border-neutral-100 shadow-inner">
      {model.error&&showAreas&&<p role="alert" className="absolute top-2 left-12 z-[1000] rounded bg-white p-2 error-message">Location areas could not be drawn. Pins remain available.</p>}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={16}
        className="h-full w-full rounded-[24px]"
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer className="satellite-tiles" maxNativeZoom={19} maxZoom={20}
              attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Vantor, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Street map">
            <TileLayer maxZoom={19}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
        </LayersControl>

        <AutoResize />
        <ClickHandler onClick={pendingClick} />

        {showAreas&&<ZoneAreaLayer geometry={model.geometry} visibleIds={visibleIds}/>}
        {groups.map(([key,group]) => {
          const point=group.find(p=>p.id===selected[key])??group[0];
          return (
          <Marker
            key={key}
            title={group.length>1?`${group.length} records at this location · ${[...new Set(group.map(p=>zoneIdentity(p.purok).label))].join(", ")}`:`${point.full_name}: ${zoneIdentity(point.purok).label} · ${getRiskColor(point.risk_level).label}`}
            position={[point.latitude, point.longitude]}
            icon={makePinIcon(group.length>1?"unknown":point.risk_level,group.length>1?group.length:undefined,group.map(p=>p.risk_level))}
          >
            <Popup className="rounded-2xl shadow-xl">
              <div className="p-1 space-y-2 text-xs font-medium text-neutral-700 min-w-[200px]">
                {group.length>1&&<label className="block space-y-1">Records at this location
                  <select className="block w-full rounded border p-2" value={point.id} onChange={event=>setSelected(current=>({...current,[key]:event.target.value}))}>
                    {group.map(p=><option key={p.id} value={p.id}>{p.full_name} · {zoneIdentity(p.purok).label}</option>)}
                  </select>
                </label>}
                <div>
                  <p className="font-extrabold text-sm text-neutral-900">{point.full_name}</p>
                  {point.serial_no && (
                    <p className="text-[10px] font-mono font-semibold text-neutral-400">
                      {point.serial_no}
                    </p>
                  )}
                </div>
                <div className="space-y-0.5 border-t border-neutral-100 pt-2 text-[11px]">
                  <p><strong className="text-neutral-900">Zone:</strong> {point.purok ? `Zone ${point.purok}` : '—'}</p>
                  {point.age != null && <p><strong className="text-neutral-900">Age:</strong> {point.age}</p>}
                  {point.address && <p><strong className="text-neutral-900">Address:</strong> {point.address}</p>}
                  {point.contact_number && <p><strong className="text-neutral-900">Contact:</strong> {point.contact_number}</p>}
                  {point.edd && <p><strong className="text-neutral-900">EDC:</strong> {point.edd}</p>}
                </div>
                <div className="pt-1">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs ${
                      point.risk_level === 'high' ? 'bg-red-700' : point.risk_level === 'low' ? 'bg-green-700' : 'bg-neutral-600'
                    }`}
                  >
                    {getRiskColor(point.risk_level).label}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        );})}
      </MapContainer>
    </div>
  );
}
