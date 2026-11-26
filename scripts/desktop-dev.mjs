import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = path.join(root, '.audit/desktop-app');

try {
    await Promise.all(['package.json', 'desktop/main.cjs', 'dist/index.html'].map(file => fs.access(path.join(app, file))));
} catch {
    console.error('Desktop files are missing. Run "npm run desktop:dev" to build and start the desktop app.');
    process.exit(1);
}

let runtime;
const runs = path.join(root, 'tmp/desktop-runs');
const removeRuntime = async () => {
    if (!runtime || path.dirname(runtime) !== runs) return;
    await fs.rm(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};
try {
    const executable = createRequire(import.meta.url)('electron');
    const args = process.argv.slice(2);
    if (!args.some(arg => arg === '--director-test-profile' || arg.startsWith('--director-test-profile='))) {
        const profile = path.join(root, '.local/desktop-dev-profile');
        await fs.mkdir(profile, { recursive: true });
        args.push(`--director-test-profile=${profile}`);
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await fs.mkdir(runs, { recursive: true });
    runtime = await fs.mkdtemp(path.join(runs, 'run-'));
    await fs.cp(app, runtime, { recursive: true });
    console.log('Starting the prepared desktop app. After source changes, run "npm run desktop:dev" to rebuild.');
    const child = spawn(executable, [runtime, ...args], { cwd: root, env, stdio: 'inherit' });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', terminate);
    };
    try {
        process.exitCode = await new Promise(resolve => {
            child.once('error', error => { console.error(`Could not start Electron: ${error.message}`); resolve(1); });
            child.once('exit', (code, signal) => resolve(code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1)));
        });
    } finally { cleanup(); }
} catch (error) {
    console.error(`Could not start the desktop app: ${error.message}`);
    process.exitCode = 1;
} finally {
    await removeRuntime().catch(error => console.warn(`Could not remove desktop runtime: ${error.message}`));
}
