import { spawn } from 'node:child_process'
const child=spawn(process.execPath,['--loader','tsx','server/index.ts'],{stdio:'inherit',env:{...process.env,NODE_ENV:'production'}})
child.on('exit',code=>process.exitCode=code??1)
