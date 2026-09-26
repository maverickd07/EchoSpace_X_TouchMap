import type { MapData, Point } from './map';
export type Region = 'street' | 'building' | 'park' | 'lawn' | 'park-path' | 'other';
export const regionNames: Record<Region, string> = {
  street: 'Street corridor · no vibration', building: 'Building · rapid pulses', park: 'Park · gentle pulses',
  lawn: 'Lawn · gentle pulses', 'park-path': 'Park path · double pulses', other: 'Open space · spaced pulses',
};
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx=b[0]-a[0], dy=b[1]-a[1], length=dx*dx+dy*dy;
  const t=length ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
export function inside(p: Point, rings: Point[][]): boolean {
  let result=false;
  for(const ring of rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if(segmentDistance(p,a,b)<1e-7) return true;
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) result=!result;
  }
  return result;
}
export function createClassifier(data: MapData): (point: Point) => Region {
  const prepare = (area: MapData['buildings'][number]) => {
    const points=area.rings.flat();
    return { area, bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),
      Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))] };
  };
  const buildings=data.buildings.map(prepare), green=data.green.map(prepare);
  const contains=(p: Point, item: ReturnType<typeof prepare>) => p[0]>=item.bounds[0] &&
    p[0]<=item.bounds[2] && p[1]>=item.bounds[1] && p[1]<=item.bounds[3] && inside(p,item.area.rings);
  const corridors = [...data.streets.map(s=>({pts:s.pts,width:s.width ?? (s.major ? 16 : 10),path:false})),
    ...data.paths.map(p=>({pts:p.pts,width:p.width ?? 3,path:p.kind !== 'service'}))];
  return p => {
    // Buildings win over estimated road buffers. Holes remain outside buildings.
    if(buildings.some(b=>contains(p,b))) return 'building';
    const greenArea=green.find(g=>contains(p,g));
    let road=false,path=false;
    for(const corridor of corridors) {
      if(corridor.pts.some((b,i)=>i>0 && segmentDistance(p,corridor.pts[i-1],b)<=corridor.width/2)) {
        if(corridor.path) path=true; else road=true;
      }
    }
    if(road) return 'street';
    if(path) return greenArea ? 'park-path' : 'street';
    if(greenArea) return greenArea.area.kind === 'lawn' ? 'lawn' : 'park';
    return 'other';
  };
}
