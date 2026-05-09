// ============================================================================
// actor-bonilla — ThreadPoolDispatcher
//
// True multi-threaded actor processing via Node.js worker_threads.
//
// Architecture (main thread proxies, worker-side mailboxes):
// ┌─────────────────────────────────────────────────────────────┐
// │  Main Thread                                                │
// │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
// │  │ ProxyRef "a" │  │ ProxyRef "b" │  │ ProxyRef "c" │      │
// │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
// │         │ MessagePort     │                  │              │
// ├─────────┼─────────────────┼──────────────────┼──────────────┤
// │ Worker 0│          Worker 1│           Worker 2│             │
// │  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐      │
// │  │ ActorCell "a"│  │ ActorCell "b"│  │ ActorCell "c"│      │
// │  │  (mailbox)   │  │  (mailbox)   │  │  (mailbox)   │      │
// │  │  (behavior)  │  │  (behavior)  │  │  (behavior)  │      │
// │  └──────────────┘  └──────────────┘  └──────────────┘      │
// └─────────────────────────────────────────────────────────────┘
//
// Key insight: Functions cannot be serialized across threads.
// So the user provides a "behavior factory" (a module path + export name),
// and each worker instantiates its own copy of the behavior.
//
// Props carry a recipe (module + factory args), not a live function.
// The worker loads the module and constructs behavior on its thread.
// ============================================================================
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
// ============================================================================
// Protocol — messages between main thread and workers
// ============================================================================
export var WorkerMsgType = /*#__PURE__*/ function(WorkerMsgType) {
    // Main → Worker
    WorkerMsgType[WorkerMsgType["CreateActor"] = 1] = "CreateActor";
    WorkerMsgType[WorkerMsgType["Tell"] = 2] = "Tell";
    WorkerMsgType[WorkerMsgType["StopActor"] = 3] = "StopActor";
    WorkerMsgType[WorkerMsgType["Shutdown"] = 4] = "Shutdown";
    WorkerMsgType[WorkerMsgType["Ask"] = 5] = "Ask";
    // Worker → Main
    WorkerMsgType[WorkerMsgType["ActorCreated"] = 10] = "ActorCreated";
    WorkerMsgType[WorkerMsgType["DeadLetter"] = 11] = "DeadLetter";
    WorkerMsgType[WorkerMsgType["TellProxy"] = 12] = "TellProxy";
    WorkerMsgType[WorkerMsgType["AskReply"] = 13] = "AskReply";
    WorkerMsgType[WorkerMsgType["ActorStopped"] = 14] = "ActorStopped";
    WorkerMsgType[WorkerMsgType["Log"] = 15] = "Log";
    WorkerMsgType[WorkerMsgType["Error"] = 16] = "Error";
    return WorkerMsgType;
}({});
// ============================================================================
// WorkerShard — runs inside a worker thread
// ============================================================================
/**
 * Each worker manages a set of actors. Messages arrive via the MessagePort,
 * get dispatched to the right actor, and outbound messages are sent back
 * to the main thread for routing.
 */ class WorkerShard {
    actors = new Map();
    port;
    currentAskCorrelationId = null;
    constructor(port){
        this.port = port;
        port.on('message', (msg)=>this.handleMessage(msg));
    }
    async handleMessage(msg) {
        switch(msg.type){
            case 1:
                await this.createActor(msg);
                break;
            case 2:
                this.deliverTell(msg);
                break;
            case 5:
                this.deliverAsk(msg);
                break;
            case 3:
                this.stopActor(msg.actorPath);
                break;
            case 4:
                this.shutdown();
                break;
        }
    }
    async createActor(msg) {
        try {
            // Dynamically import the behavior module
            const mod = await import(msg.behaviorModule);
            const factory = mod[msg.behaviorExport];
            if (typeof factory !== 'function') {
                throw new Error(`Export "${msg.behaviorExport}" is not a function in ${msg.behaviorModule}`);
            }
            const receive = factory(...msg.behaviorArgs ?? []);
            this.actors.set(msg.actorPath, {
                name: msg.actorName,
                receive,
                mailbox: [],
                processing: false
            });
            this.port.postMessage({
                type: 10,
                actorPath: msg.actorPath
            });
        } catch (e) {
            this.port.postMessage({
                type: 16,
                actorPath: msg.actorPath,
                error: e.message ?? String(e)
            });
        }
    }
    deliverTell(msg) {
        const actor = this.actors.get(msg.targetPath);
        if (!actor) {
            // Dead letter — actor doesn't exist on this worker
            return;
        }
        actor.mailbox.push({
            message: msg.message,
            senderPath: msg.senderPath,
            correlationId: null
        });
        this.scheduleProcessing(msg.targetPath, actor);
    }
    deliverAsk(msg) {
        const actor = this.actors.get(msg.targetPath);
        if (!actor) {
            this.port.postMessage({
                type: 13,
                correlationId: msg.correlationId,
                value: null,
                error: `Actor ${msg.targetPath} not found`
            });
            return;
        }
        actor.mailbox.push({
            message: msg.message,
            senderPath: null,
            correlationId: msg.correlationId
        });
        this.scheduleProcessing(msg.targetPath, actor);
    }
    scheduleProcessing(path, actor) {
        if (actor.processing) return;
        actor.processing = true;
        // Use queueMicrotask for maximum throughput within this worker
        queueMicrotask(()=>this.processMailbox(path, actor));
    }
    async processMailbox(path, actor) {
        const batch = actor.mailbox;
        actor.mailbox = [];
        // Process up to 64 messages per batch
        const limit = Math.min(batch.length, 64);
        for(let i = 0; i < limit; i++){
            const envelope = batch[i];
            this.currentAskCorrelationId = envelope.correlationId;
            const context = {
                selfPath: path,
                selfName: actor.name,
                senderPath: envelope.senderPath,
                tell: (targetPath, message)=>{
                    this.port.postMessage({
                        type: 12,
                        targetPath,
                        message,
                        senderPath: path
                    });
                },
                reply: (value)=>{
                    if (envelope.correlationId !== null) {
                        this.port.postMessage({
                            type: 13,
                            correlationId: envelope.correlationId,
                            value
                        });
                    } else if (envelope.senderPath) {
                        // Reply via tell
                        this.port.postMessage({
                            type: 12,
                            targetPath: envelope.senderPath,
                            message: value,
                            senderPath: path
                        });
                    }
                },
                stop: ()=>{
                    this.stopActor(path);
                }
            };
            try {
                await actor.receive(envelope.message, context);
            } catch (e) {
                this.port.postMessage({
                    type: 16,
                    actorPath: path,
                    error: e.message ?? String(e)
                });
            }
            this.currentAskCorrelationId = null;
        }
        // If there are remaining messages, re-enqueue
        if (limit < batch.length) {
            actor.mailbox = batch.slice(limit).concat(actor.mailbox);
        }
        actor.processing = false;
        // If new messages arrived during processing, schedule again
        if (actor.mailbox.length > 0) {
            this.scheduleProcessing(path, actor);
        }
    }
    stopActor(path) {
        this.actors.delete(path);
        this.port.postMessage({
            type: 14,
            actorPath: path
        });
    }
    shutdown() {
        this.actors.clear();
        process.exit(0);
    }
}
// ============================================================================
// Worker entry point — if this module is loaded as a worker
// ============================================================================
if (!isMainThread && parentPort) {
    new WorkerShard(parentPort);
}
// ============================================================================
// ThreadPoolRef — a proxy ActorRef on the main thread
// ============================================================================
/**
 * A proxy ActorRef that lives on the main thread and transparently forwards
 * messages to the real ActorCell running on a worker thread.
 * Forwards to an actor hosted on a worker thread.
 */ export class ThreadPoolRef {
    path;
    name;
    pool;
    workerIndex;
    constructor(pool, workerIndex, path, name){
        this.pool = pool;
        this.workerIndex = workerIndex;
        this.path = path;
        this.name = name;
    }
    tell(message, sender) {
        this.pool.sendTell(this.workerIndex, this.path, message, sender?.path ?? null);
    }
    ask(message, timeoutMs = 5000) {
        return this.pool.sendAsk(this.workerIndex, this.path, message, timeoutMs);
    }
    stop() {
        this.pool.sendStop(this.workerIndex, this.path);
    }
}
/**
 * ThreadPool manages a pool of worker threads, each running a WorkerShard.
 * Actors are distributed across workers using round-robin or explicit assignment.
 *
 * Pool size and worker script follow the usual fork/join–style layout.
 */ export class ThreadPool {
    workers = [];
    poolSize;
    nextWorker = 0;
    alive = true;
    // Actor registry: path → worker index
    actorRegistry = new Map();
    // Ask tracking
    askCounter = 0;
    pendingAsks = new Map();
    // Creation promises
    pendingCreations = new Map();
    // External handler for cross-worker routing
    onTellProxy = null;
    constructor(config = {}){
        this.poolSize = config.poolSize ?? Math.max(cpus().length - 1, 1);
        const workerScript = config.workerScript ?? fileURLToPath(import.meta.url);
        for(let i = 0; i < this.poolSize; i++){
            const worker = new Worker(workerScript, {
                workerData: {
                    shardIndex: i
                }
            });
            worker.on('message', (msg)=>this.handleWorkerMessage(i, msg));
            worker.on('error', (err)=>{
                console.error(`[actor-bonilla/ThreadPool] Worker ${i} error:`, err);
            });
            this.workers.push(worker);
        }
    }
    /** Register a callback for when a worker actor wants to tell another actor. */ setTellProxyHandler(handler) {
        this.onTellProxy = handler;
    }
    /** Get the pool size. */ get size() {
        return this.poolSize;
    }
    // ========================================================================
    // Actor lifecycle
    // ========================================================================
    /**
   * Create an actor on a worker thread.
   * Returns a proxy ActorRef that forwards messages to the worker.
   */ async createActor(name, parentPath, threadedProps, workerIndex) {
        if (!this.alive) throw new Error('ThreadPool is shut down');
        const idx = workerIndex ?? this.pickWorker();
        const actorPath = `${parentPath}/${name}`;
        return new Promise((resolve, reject)=>{
            this.pendingCreations.set(actorPath, {
                resolve: (ref)=>resolve(ref),
                reject
            });
            this.workers[idx].postMessage({
                type: 1,
                actorPath,
                actorName: name,
                behaviorModule: threadedProps.behaviorModule,
                behaviorExport: threadedProps.behaviorExport,
                behaviorArgs: threadedProps.behaviorArgs ?? []
            });
            this.actorRegistry.set(actorPath, idx);
        });
    }
    // ========================================================================
    // Message routing
    // ========================================================================
    sendTell(workerIndex, targetPath, message, senderPath) {
        if (!this.alive) return;
        this.workers[workerIndex].postMessage({
            type: 2,
            targetPath,
            message,
            senderPath
        });
    }
    sendAsk(workerIndex, targetPath, message, timeoutMs) {
        return new Promise((resolve, reject)=>{
            const correlationId = ++this.askCounter;
            const timer = setTimeout(()=>{
                this.pendingAsks.delete(correlationId);
                reject(new Error(`Threaded ask timed out after ${timeoutMs}ms for ${targetPath}`));
            }, timeoutMs);
            this.pendingAsks.set(correlationId, {
                resolve,
                reject,
                timer
            });
            this.workers[workerIndex].postMessage({
                type: 5,
                targetPath,
                message,
                correlationId
            });
        });
    }
    sendStop(workerIndex, actorPath) {
        if (!this.alive) return;
        this.workers[workerIndex].postMessage({
            type: 3,
            actorPath
        });
    }
    /** Route a message to the correct worker based on actor path. */ routeMessage(targetPath, message, senderPath) {
        const workerIndex = this.actorRegistry.get(targetPath);
        if (workerIndex === undefined) return false;
        this.sendTell(workerIndex, targetPath, message, senderPath);
        return true;
    }
    /** Look up which worker owns an actor. */ getWorkerForActor(path) {
        return this.actorRegistry.get(path);
    }
    // ========================================================================
    // Worker message handling
    // ========================================================================
    handleWorkerMessage(workerIndex, msg) {
        switch(msg.type){
            case 10:
                {
                    const pending = this.pendingCreations.get(msg.actorPath);
                    if (pending) {
                        this.pendingCreations.delete(msg.actorPath);
                        const name = msg.actorPath.split('/').pop() ?? msg.actorPath;
                        const ref = new ThreadPoolRef(this, workerIndex, msg.actorPath, name);
                        pending.resolve(ref);
                    }
                    break;
                }
            case 12:
                {
                    // Worker actor wants to send to another actor — route it
                    if (this.onTellProxy) {
                        this.onTellProxy(msg.targetPath, msg.message, msg.senderPath);
                    } else {
                        // Default: try to route to another worker
                        this.routeMessage(msg.targetPath, msg.message, msg.senderPath);
                    }
                    break;
                }
            case 13:
                {
                    const pending = this.pendingAsks.get(msg.correlationId);
                    if (pending) {
                        clearTimeout(pending.timer);
                        this.pendingAsks.delete(msg.correlationId);
                        if (msg.error) {
                            pending.reject(new Error(msg.error));
                        } else {
                            pending.resolve(msg.value);
                        }
                    }
                    break;
                }
            case 14:
                {
                    this.actorRegistry.delete(msg.actorPath);
                    break;
                }
            case 15:
                {
                    const fn = msg.level === 'error' ? console.error : msg.level === 'warn' ? console.warn : console.log;
                    fn(`[actor-bonilla/Worker-${workerIndex}]`, msg.message);
                    break;
                }
            case 16:
                {
                    console.error(`[actor-bonilla/Worker-${workerIndex}] Actor ${msg.actorPath} error:`, msg.error);
                    break;
                }
        }
    }
    // ========================================================================
    // Worker selection
    // ========================================================================
    pickWorker() {
        const idx = this.nextWorker;
        this.nextWorker = (this.nextWorker + 1) % this.poolSize;
        return idx;
    }
    // ========================================================================
    // Shutdown
    // ========================================================================
    async shutdown() {
        if (!this.alive) return;
        this.alive = false;
        // Cancel pending asks
        for (const [, ask] of this.pendingAsks){
            clearTimeout(ask.timer);
            ask.reject(new Error('ThreadPool shutting down'));
        }
        this.pendingAsks.clear();
        // Send shutdown to all workers
        const exits = this.workers.map((worker, i)=>{
            return new Promise((resolve)=>{
                worker.once('exit', ()=>resolve());
                worker.postMessage({
                    type: 4
                });
                // Force kill after 2 seconds
                setTimeout(()=>{
                    worker.terminate().then(()=>resolve()).catch(()=>resolve());
                }, 2000);
            });
        });
        await Promise.all(exits);
        this.workers = [];
        this.actorRegistry.clear();
    }
}
