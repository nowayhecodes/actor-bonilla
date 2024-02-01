import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { EOL } from 'node:os';

const execPromise = promisify(exec);
const spawnPromise = promisify(spawn);

export const parallelExec = async (items: string[]): Promise<string> => {
    const promises = items.map((item) => execPromise(item, { encoding: 'utf8' }));
    return (await Promise.all(promises)).map((item) => item.stdout).join(EOL);
};

export const parallelSpawn = async (items: any[]): Promise<string> => {
    const promises = items.map((item) => spawnPromise(item, [], { uid: 0, gid: 0, windowsHide: true }));
    return (await Promise.all(promises)).map((item: any) => console.log(item)).join(EOL);
}
