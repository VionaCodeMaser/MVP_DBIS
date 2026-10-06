import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('..',import.meta.url)))
if(Number(process.versions.node.split('.')[0])<20){console.error('Install Node.js 20 or newer, then retry.');process.exit(1)}
console.log('Preparing the synthetic example demo. No Ollama or microphone is needed.')
const installed=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--no-audit','--no-fund'],{stdio:'inherit',shell:process.platform==='win32'})
if(installed.status!==0){console.error('Dependency setup failed. Stop any older dev server for this project and retry.');process.exit(installed.status??1)}
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','replay','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'inherit'})
console.log('Watch: http://127.0.0.1:5173/   GP: http://127.0.0.1:5173/report.html')
child.on('exit',code=>process.exitCode=code??1)
