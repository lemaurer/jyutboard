import { startRelay } from './relay-server';
startRelay(Number(process.env.PORT)||47831).then(relay=>{console.log(`JyutBoard relay listening on ${relay.port}`);process.on('SIGTERM',async()=>{await relay.close();process.exit(0);});}).catch(error=>{console.error(error.message);process.exit(1);});
