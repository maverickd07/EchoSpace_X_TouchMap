import type { MapData, Point } from './map';
export interface DemoRoute { name: string; color: string; pts: Point[]; roadNames: string[]; destination: Point; home: Point }

// Keep the source road name for each route segment; haptic classification stays independent.
export function demoRoutes(data: MapData, home: Point): DemoRoute[] {
  const points: Point[] = [], graph: { to: number; cost: number; name: string }[][] = [];
  const ids = new Map<string, number>();
  const edges: [number,number,string][] = [];
  const node = (p: Point) => {
    const key=p.join(','); const existing=ids.get(key);
    if(existing!==undefined) return existing;
    const id=points.length; points.push(p); graph.push([]); ids.set(key,id); return id;
  };
  const link = (a:number,b:number,name:string) => {
    const cost=Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]);
    graph[a].push({to:b,cost,name}); graph[b].push({to:a,cost,name});
  };
  for(const way of [...data.streets,...data.paths]) for(let i=1;i<way.pts.length;i++) {
    const a=node(way.pts[i-1]),b=node(way.pts[i]);
    if(a!==b) { const name = 'name' in way && way.name ? way.name : 'the unnamed path'; link(a,b,name); edges.push([a,b,name]); }
  }
  // Avoid snapping to disconnected fragments of mapped paths.
  const seen=new Set<number>(); let main=new Set<number>();
  for(let i=0;i<points.length;i++) {
    if(seen.has(i)) continue;
    const component=new Set<number>([i]),queue=[i];seen.add(i);
    while(queue.length) for(const edge of graph[queue.pop()!]) if(!seen.has(edge.to)) {
      seen.add(edge.to);component.add(edge.to);queue.push(edge.to);
    }
    if(component.size>main.size) main=component;
  }
  const snap=(p:Point) => {
    let best=Infinity, pair: [number,number,string]|undefined, position:Point=[...p];
    for(const [a,b,name] of edges) {
      if(!main.has(a)) continue;
      const start=points[a],end=points[b],dx=end[0]-start[0],dy=end[1]-start[1];
      const t=Math.max(0,Math.min(1,((p[0]-start[0])*dx+(p[1]-start[1])*dy)/(dx*dx+dy*dy)));
      const q:Point=[start[0]+t*dx,start[1]+t*dy],distance=Math.hypot(q[0]-p[0],q[1]-p[1]);
      if(distance<best) {best=distance;pair=[a,b,name];position=q;}
    }
    if(!pair) throw new Error('No connected roads for demo routes.');
    const id=node(position);if(id!==pair[0]) link(id,pair[0],pair[2]); if(id!==pair[1]) link(id,pair[1],pair[2]); return id;
  };
  const start=snap(home);
  const destinations=[
    {osm:'Bocconi Sport Center',name:'Bocconi Sport Center',color:'#57e0ff'},
    {osm:'Edificio Sarfatti',name:'Sarfatti Building',color:'#ff8acb'},
  ].map(target=>{
    const place=data.landmarks.find(p=>p.name===target.osm);
    if(!place) throw new Error(`Missing ${target.osm}`);
    const destination:Point=[place.x,place.y];return {...target,destination,end:snap(destination)};
  });
  const distance=Array(points.length).fill(Infinity),previous=Array(points.length).fill(-1);
  const previousName: string[] = Array(points.length).fill('');
  const heap: [number,number][]=[];
  const push=(entry:[number,number])=>{
    let i=heap.length;heap.push(entry);
    while(i>0){const parent=(i-1)>>1;if(heap[parent][0]<=entry[0])break;heap[i]=heap[parent];i=parent;}
    heap[i]=entry;
  };
  const pop=()=>{
    const first=heap[0],last=heap.pop()!;
    if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}
    return first;
  };
  distance[start]=0;push([0,start]);
  while(heap.length){const [cost,id]=pop();if(cost!==distance[id])continue;
    for(const edge of graph[id])if(cost+edge.cost<distance[edge.to]){
      distance[edge.to]=cost+edge.cost;previous[edge.to]=id;previousName[edge.to]=edge.name;push([distance[edge.to],edge.to]);
    }
  }
  return destinations.map(target=>{
    if(!Number.isFinite(distance[target.end])) throw new Error(`No connected route to ${target.name}`);
    const path:Point[]=[], roadNames:string[]=[];
    for(let id=target.end;id!==-1;id=previous[id]) { path.push(points[id]); if(previous[id]!==-1) roadNames.push(previousName[id]); }
    return {name:target.name,color:target.color,pts:path.reverse(),roadNames:roadNames.reverse(),destination:target.destination,home};
  });
}
