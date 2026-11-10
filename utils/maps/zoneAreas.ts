import { Delaunay } from 'd3-delaunay';
import polygonClipping, { type MultiPolygon, type Pair } from 'polygon-clipping';
import { normalizeZone } from '@/utils/maternalRegistration';

export const LOCATION_AREA_METERS = 100;
export const ZONE_COLORS: Record<string, {id:string;label:string;color:string}> = {
  '1':{id:'Z1',label:'Zone 1',color:'#2563EB'}, '2':{id:'Z2',label:'Zone 2',color:'#D97706'},
  '3':{id:'Z3',label:'Zone 3',color:'#7C3AED'}, '4':{id:'Z4',label:'Zone 4',color:'#0891B2'},
  '5':{id:'Z5',label:'Zone 5',color:'#DB2777'}, '6':{id:'Z6',label:'Zone 6',color:'#0F766E'},
  '7':{id:'Z7',label:'Zone 7',color:'#92400E'}, '8':{id:'Z8',label:'Zone 8',color:'#4D7C0F'},
};
export function zoneIdentity(zone:unknown) {
  return ZONE_COLORS[normalizeZone(zone)??'']??{id:'?',label:'Unassigned',color:'#64748B'};
}
export type AreaPoint = {id:string;purok:string|null;latitude:number|null;longitude:number|null};
export type LatLng = [number,number];
export type ZoneArea = {key:string;zone:string;recordIds:string[];geometry:MultiPolygon;positions:LatLng[][][]};
export type ZoneBorder = {positions:LatLng[];areaKeys:string[];shared:boolean;zone:string};
export type ZoneGeometry = {areas:ZoneArea[];borders:ZoneBorder[]};
const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI/180;
const HALF = LOCATION_AREA_METERS/2;
const { union, intersection } = polygonClipping;

export function validMapPoint(point:AreaPoint): point is AreaPoint & {latitude:number;longitude:number} {
  return typeof point.latitude==='number'&&typeof point.longitude==='number'&&Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&Math.abs(point.latitude)<=85.05112878&&Math.abs(point.longitude)<=180;
}

function joinPolygons(polygons:MultiPolygon[]):MultiPolygon {
  let parts=polygons.filter(part=>part.length);
  while(parts.length>1) {
    const next:MultiPolygon[]=[];
    for(let i=0;i<parts.length;i+=32)next.push(union(parts[i],...parts.slice(i+1,i+32)));
    parts=next;
  }
  return parts[0]??[];
}

function clipHalfPlane(ring:Pair[],center:Pair,normal:Pair):Pair[] {
  const output:Pair[]=[];
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length];
    const da=(a[0]-center[0])*normal[0]+(a[1]-center[1])*normal[1];
    const db=(b[0]-center[0])*normal[0]+(b[1]-center[1])*normal[1];
    if(da>=0)output.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);output.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  }
  return output;
}

// Split collinear edges into shared segments so each visible boundary is drawn once.
function bordersFor(areas:ZoneArea[],unproject:(point:Pair)=>LatLng):ZoneBorder[] {
  type Edge={lo:number;hi:number;key:string;zone:string};
  const lines=new Map<string,{ux:number;uy:number;offset:number;edges:Edge[]}>();
  for(const area of areas)for(const polygon of area.geometry)for(const ring of polygon)for(let i=1;i<ring.length;i++) {
    const a=ring[i-1],b=ring[i];let dx=b[0]-a[0],dy=b[1]-a[1];const length=Math.hypot(dx,dy);
    if(length<1e-6)continue;
    if(Math.abs(dx)<1e-9)dx=0;if(Math.abs(dy)<1e-9)dy=0;
    if(dx<0||(Math.abs(dx)<1e-9&&dy<0)){dx=-dx;dy=-dy;}
    const ux=dx/length,uy=dy/length,offset=-uy*a[0]+ux*a[1];
    const lineKey=`${Math.round(ux*1e7)/1e7}:${Math.round(uy*1e7)/1e7}:${Math.round(offset*1e3)/1e3}`;
    const line=lines.get(lineKey)??{ux,uy,offset,edges:[]};
    const ta=line.ux*a[0]+line.uy*a[1],tb=line.ux*b[0]+line.uy*b[1];
    line.edges.push({lo:Math.min(ta,tb),hi:Math.max(ta,tb),key:area.key,zone:area.zone});lines.set(lineKey,line);
  }
  const result:ZoneBorder[]=[];
  for(const line of lines.values()) {
    const stops=[...new Set(line.edges.flatMap(e=>[e.lo,e.hi]).map(t=>Math.round(t*1e6)/1e6))].sort((a,b)=>a-b);
    for(let i=1;i<stops.length;i++) {
      const lo=stops[i-1],hi=stops[i];if(hi-lo<1e-5)continue;
      const mid=(lo+hi)/2,active=line.edges.filter(e=>e.lo<=mid+1e-6&&e.hi>=mid-1e-6);
      if(!active.length)continue;
      const areaKeys=[...new Set(active.map(e=>e.key))].sort(),zones=[...new Set(active.map(e=>e.zone))].sort();
      const point=(t:number):LatLng=>unproject([line.ux*t-line.uy*line.offset,line.uy*t+line.ux*line.offset]);
      result.push({positions:[point(lo),point(hi)],areaKeys,shared:zones.length>1,zone:zones[0]});
    }
  }
  return result;
}

export function buildZoneAreas(records:AreaPoint[]):ZoneGeometry {
  const points=records.filter(validMapPoint).sort((a,b)=>a.latitude-b.latitude||a.longitude-b.longitude||a.id.localeCompare(b.id));
  if(!points.length)return {areas:[],borders:[]};
  const lat0=points.reduce((sum,p)=>sum+p.latitude,0)/points.length,lng0=points.reduce((sum,p)=>sum+p.longitude,0)/points.length;
  const scaleX=EARTH_RADIUS*RAD*Math.cos(lat0*RAD),scaleY=EARTH_RADIUS*RAD;
  const unproject=([x,y]:Pair):LatLng=>[lat0+y/scaleY,lng0+x/scaleX];
  type Site={xy:Pair;records:typeof points};
  const locations=new Map<string,Site>();
  for(const p of points) {
    const key=`${p.latitude}:${p.longitude}`;
    const site=locations.get(key)??{xy:[Math.round((p.longitude-lng0)*scaleX*1e4)/1e4,Math.round((p.latitude-lat0)*scaleY*1e4)/1e4],records:[]};
    site.records.push(p);locations.set(key,site);
  }
  const sites=[...locations.values()],parent=sites.map((_,i)=>i),cells=new Map<string,number[]>();
  function root(i:number):number {while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
  // Neighboring spatial buckets contain every potentially touching 100 m box.
  sites.forEach((site,i)=>{
    const [x,y]=site.xy,bx=Math.floor(x/LOCATION_AREA_METERS),by=Math.floor(y/LOCATION_AREA_METERS);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
      const candidate=cells.get(`${bx+dx}:${by+dy}`)?.find(j=>Math.abs(x-sites[j].xy[0])<=LOCATION_AREA_METERS+1e-7&&Math.abs(y-sites[j].xy[1])<=LOCATION_AREA_METERS+1e-7);
      if(candidate!==undefined)parent[root(i)]=root(candidate);
    }
    const key=`${bx}:${by}`;
    const bucket=cells.get(key)??[];bucket.push(i);cells.set(key,bucket);
  });
  const components=new Map<number,Site[]>();
  sites.forEach((site,i)=>{const key=root(i),group=components.get(key)??[];group.push(site);components.set(key,group);});
  const areas:ZoneArea[]=[];
  for(const [component,group] of components) {
    const squares=group.map(({xy:[x,y]}):MultiPolygon=>[[[[x-HALF,y-HALF],[x+HALF,y-HALF],[x+HALF,y+HALF],[x-HALF,y+HALF],[x-HALF,y-HALF]]]]);
    const footprint=joinPolygons(squares),byZone=new Map<string,MultiPolygon[]>();
    const zones=[...new Set(group.flatMap(s=>s.records.map(p=>normalizeZone(p.purok)??'')))].sort();
    if(zones.length===1)byZone.set(zones[0],[footprint]);
    else {
      const xs=group.map(s=>s.xy[0]),ys=group.map(s=>s.xy[1]);
      const voronoi=Delaunay.from(group.map(s=>[...s.xy] as Pair)).voronoi([Math.min(...xs)-HALF,Math.min(...ys)-HALF,Math.max(...xs)+HALF,Math.max(...ys)+HALF]);
      group.forEach((site,i)=>{
        const cell=voronoi.cellPolygon(i);if(!cell)return;
        const ring=Array.from(cell).slice(0,-1) as Pair[];
        const siteZones=[...new Set(site.records.map(p=>normalizeZone(p.purok)??''))].sort();
        siteZones.forEach((zone,j)=>{
          let part=ring;
          if(siteZones.length>1) {
            const start=j*2*Math.PI/siteZones.length,end=(j+1)*2*Math.PI/siteZones.length;
            part=clipHalfPlane(part,site.xy,[-Math.sin(start),Math.cos(start)]);
            part=clipHalfPlane(part,site.xy,[Math.sin(end),-Math.cos(end)]);
          }
          if(part.length<3)return;
          const clipped=intersection(footprint,[[[...part,part[0]]]]);
          byZone.set(zone,[...(byZone.get(zone)??[]),clipped]);
        });
      });
    }
    for(const [zone,parts] of byZone) {
      const geometry=joinPolygons(parts);if(!geometry.length)continue;
      areas.push({key:`${component}:${zone}`,zone,geometry,positions:geometry.map(p=>p.map(r=>r.map(unproject))),recordIds:group.flatMap(s=>s.records.filter(p=>(normalizeZone(p.purok)??'')===zone).map(p=>p.id))});
    }
  }
  return {areas,borders:bordersFor(areas,unproject)};
}
