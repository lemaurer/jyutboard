import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
export async function startRelay(port=47831, host='0.0.0.0') {
  const rooms=new Map<string,{doc:Y.Doc; clients:Set<WebSocket>; touched:number}>();
  const server=createServer((req,res)=> { res.setHeader('Content-Type','text/plain'); res.writeHead(req.url==='/health'?200:404); res.end(req.url==='/health'?'JyutBoard relay ready':'Not found'); });
  const wss=new WebSocketServer({server,maxPayload:30*1024*1024,perMessageDeflate:false});
  wss.on('connection',socket=> {
    let room:ReturnType<typeof rooms.get>; let id=''; let count=0; let windowStart=Date.now(); let alive=true;
    const joinTimeout=setTimeout(()=>socket.close(1008,'Join required'),5000);
    socket.on('pong',()=>{alive=true;});
    const heartbeat=setInterval(()=>{ if(!alive) { socket.terminate(); return; } alive=false; socket.ping(); },30000);
    socket.on('error',()=>{});
    socket.on('message',raw=> {
      try {
        if(Date.now()-windowStart>1000) { count=0;windowStart=Date.now(); } if(++count>120) throw Error('Rate limit');
        const message=JSON.parse(raw.toString());
        if(message.type==='join'&&!room) {
          if(typeof message.room!=='string'||!/^[a-f0-9]{48}$/.test(message.room)||typeof message.id!=='string'||message.id.length>100) throw Error('Invalid room');
          room=rooms.get(message.room); if(!room) { if(rooms.size>=100) throw Error('Relay full'); room={doc:new Y.Doc(),clients:new Set(),touched:Date.now()};rooms.set(message.room,room); }
          if(room.clients.size>=8) throw Error('Room full');
          id=message.id;room.clients.add(socket);clearTimeout(joinTimeout);
          socket.send(JSON.stringify({type:'sync',update:Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64')}));
        } else if(room && (message.type==='update'||message.type==='sync')) {
          if(typeof message.update!=='string'||message.update.length>42_000_000) throw Error('Invalid update');
          const update=Buffer.from(message.update,'base64'); Y.applyUpdate(room.doc,update); room.touched=Date.now();
          if(Y.encodeStateAsUpdate(room.doc).length>20*1024*1024) { socket.close(1009,'Lesson exceeds relay size limit'); return; }
          for(const client of room.clients) if(client!==socket&&client.readyState===WebSocket.OPEN) client.send(JSON.stringify({type:'update',update:message.update}));
          if(message.type==='sync') socket.send(JSON.stringify({type:'ready'}));
        } else if(room&&message.type==='presence') {
          const p=message.presence; if(!p||JSON.stringify(p).length>6000) throw Error('Invalid presence');
          for(const client of room.clients) if(client!==socket&&client.readyState===WebSocket.OPEN) client.send(JSON.stringify({type:'presence',presence:{...p,id,at:Date.now()}}));
        } else throw Error('Join first');
      } catch { socket.close(1008,'Invalid or excessive room data'); }
    });
    socket.on('close',()=> {clearTimeout(joinTimeout);clearInterval(heartbeat);room?.clients.delete(socket);if(room) {room.touched=Date.now();for(const client of room.clients) if(client.readyState===WebSocket.OPEN) client.send(JSON.stringify({type:'leave',id}));} });
  });
  const cleanup=setInterval(()=>{for(const [key,room] of rooms) if(!room.clients.size&&Date.now()-room.touched>60*60*1000){room.doc.destroy();rooms.delete(key);}},60000);cleanup.unref();
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve();});});
  return { port:(server.address() as {port:number}).port, close:async()=>{clearInterval(cleanup);for(const client of wss.clients)client.terminate();await new Promise<void>(resolve=>wss.close(()=>server.close(()=>resolve())));for(const room of rooms.values())room.doc.destroy();}, rooms };
}
