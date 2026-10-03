import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import './build-electron.mjs';
const server = await createServer(); await server.listen();
const { default: electron } = await import('electron');
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, JYUTBOARD_DEV_URL: 'http://localhost:5173' } });
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill());
