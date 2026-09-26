import { regionNames, type Region } from './regions';
export function setupHaptics() {
  const panel=document.querySelector<HTMLElement>('#haptics')!;
  const start=document.querySelector<HTMLButtonElement>('#haptic-start')!;
  const stop=document.querySelector<HTMLButtonElement>('#haptic-stop')!;
  const status=document.querySelector<HTMLElement>('#haptic-status')!;
  const hot=import.meta.hot;
  let enabled=false,ready=false,region: Region|null=null,initializing=false,id=0;
  let heartbeat: ReturnType<typeof setInterval>|undefined;
  let greeting: ReturnType<typeof setTimeout>|undefined;
  let sent='';
  panel.hidden=false;
  const send=(action:string, mode='idle')=>hot?.send('haptic:command',{action,mode,id:++id});
  const show=()=>{
    start.disabled=enabled || !ready;
    stop.disabled=!enabled;
    status.textContent=!ready ? 'Haptics unavailable · road feedback is inactive' : !enabled ? 'Haptics paused' :
      initializing ? 'Starting · three pulses' : region ? regionNames[region] : 'Enabled · move your pointer over the map';
    panel.dataset.region=region ?? 'outside';
  };
  const apply=()=>{
    show();
    if(!enabled || !ready || initializing) return;
    const mode=region==='street' || region===null ? 'idle' : region;
    if(mode!==sent) { send('state',mode); sent=mode; }
  };
  const disable=()=>{
    enabled=false; initializing=false; clearInterval(heartbeat); clearTimeout(greeting);
    send('stop'); sent=''; show();
  };
  const activate=()=>{
    clearInterval(heartbeat); clearTimeout(greeting);
    initializing=true; send('state','startup'); sent='startup'; show();
    heartbeat=setInterval(()=>{ if(enabled && ready) send('keepalive'); },200);
    greeting=setTimeout(()=>{ initializing=false; apply(); },650);
  };
  const enable=()=>{ enabled=true; if(ready) activate(); else show(); };
  if(hot && import.meta.env.MODE==='loopback') {
    hot.on('haptic:status',({phase}:{phase:string})=>{
      const previouslyReady=ready;
      ready=phase==='ready';
      if(!ready) { clearInterval(heartbeat); clearTimeout(greeting); initializing=false; sent=''; }
      if(ready && !previouslyReady && enabled) activate(); else show();
    });
    hot.on('haptic:ack',({event}:{event:string})=>{
      if(event==='stopped' && enabled) { enabled=false; clearInterval(heartbeat); clearTimeout(greeting); initializing=false; sent=''; show(); }
    });
    hot.on('vite:ws:disconnect',()=>{ ready=false; disable(); });
    hot.on('vite:ws:connect',()=>send('status'));
    hot.dispose(disable);
    send('status');
  }
  start.addEventListener('click',enable); stop.addEventListener('click',disable);
  window.addEventListener('blur',()=>{ if(enabled) disable(); });
  window.addEventListener('pagehide',disable);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && enabled) disable(); });
  show();
  return { enable, explore(next: Region|null) { region=next; apply(); } };
}
