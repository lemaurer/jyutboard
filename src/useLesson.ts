import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { readCards, type Card, type Presence, type Role, type Session, type Stroke } from './model';
import { LiveSync } from './sync';
export function useLesson(session:Session,role:Role){
  const [doc,setDoc]=useState<Y.Doc|null>(null);const [cards,setCards]=useState<Card[]>([]);const [strokes,setStrokes]=useState<Stroke[]>([]);const [peers,setPeers]=useState<Record<string,Presence>>({});const [status,setStatus]=useState('Solo lesson');const [saved,setSaved]=useState('Opening lesson…');const sync=useRef<LiveSync|null>(null);const id=useRef(crypto.randomUUID());const latest=useRef<Presence>({id:id.current,role,at:Date.now()});latest.current.role=role;
  useEffect(()=>{let active=true;const document=new Y.Doc();const persistence=new IndexeddbPersistence(`jyutboard:${session.id}`,document);let refreshTimer:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{if(!active)return;setCards(readCards(document));setStrokes([...document.getMap<Stroke>('strokes').values()].filter(x=>x&&Array.isArray(x.points)&&x.points.length<=5000&&x.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))));};
    const update=()=>{refresh();setSaved('Saving on this device…');clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{void persistence.set('lastSaved',Date.now()).then(()=>{if(active)setSaved('Saved on this device');}).catch(()=>{if(active)setSaved('Storage full — export a backup');});},400);};
    document.on('update',update);setCards([]);setStrokes([]);setPeers({});setDoc(null);
    persistence.whenSynced.then(()=>{if(!active)return;setDoc(document);refresh();setSaved('Saved on this device');}).catch(()=>{if(active)setSaved('Storage unavailable — export a backup');});
    return ()=>{active=false;clearTimeout(refreshTimer);document.off('update',update);void persistence.destroy();document.destroy();};
  },[session.id]);
  useEffect(()=>{if(!doc)return;setPeers({});if(!session.relay){setStatus('Solo lesson');return;}const live=new LiveSync(doc,session.id,session.relay,id.current,setStatus,(presence,removed)=>setPeers(previous=>{const next={...previous};if(removed)delete next[removed];else if(presence&&['teacher','learner'].includes(presence.role)&&typeof presence.id==='string')next[presence.id]=presence;return next;}));sync.current=live;live.presence(latest.current);return()=>{live.destroy();sync.current=null;};},[doc,session.id,session.relay]);
  useEffect(()=>{const interval=setInterval(()=>setPeers(previous=>Object.fromEntries(Object.entries(previous).filter(([,p])=>Date.now()-p.at<16000))),5000);return()=>clearInterval(interval);},[]);
  function presence(patch:Partial<Presence>){latest.current={...latest.current,...patch,role,at:Date.now()};sync.current?.presence(latest.current);}
  return {doc,cards,strokes,peers:Object.values(peers),status,saved,presence};
}
