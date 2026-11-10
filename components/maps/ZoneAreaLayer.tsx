'use client';
import {useMemo} from 'react';
import {Polygon,Polyline} from 'react-leaflet';
import {buildZoneAreas,zoneIdentity,type AreaPoint,type ZoneGeometry} from '@/utils/maps/zoneAreas';

export default function ZoneAreaLayer({records,geometry,visibleIds}:{records?:AreaPoint[];geometry?:ZoneGeometry;visibleIds?:Set<string>}) {
  const model=useMemo(()=>geometry??buildZoneAreas(records??[]),[records,geometry]);
  const visible=new Set(model.areas.filter(area=>!visibleIds||area.recordIds.some(id=>visibleIds.has(id))).map(area=>area.key));
  return <>
    {model.areas.filter(area=>visible.has(area.key)).map(area=><Polygon key={area.key} positions={area.positions} interactive={false} pathOptions={{fillColor:zoneIdentity(area.zone).color,fillOpacity:0.12,stroke:false}}/>)}
    {model.borders.filter(edge=>edge.areaKeys.some(key=>visible.has(key))).map((edge,i)=><Polyline key={i} positions={edge.positions} interactive={false} pathOptions={{color:edge.shared?'#334155':zoneIdentity(edge.zone).color,weight:2,opacity:0.9,dashArray:edge.zone?'':'5 4'}}/>)}
  </>;
}
