import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

export class Actor {
    constructor() {
        if (isMainThread) {
            throw new Error("Cannot create actor instance on main thread");
        }

        parentPort?.on('message', (message) => {
            // handle messages
        });
    }

    sendMessage(message: any): void {
        parentPort?.postMessage(message);
    }
}