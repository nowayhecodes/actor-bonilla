// ============================================================================
// actor-bonilla — Demo: major library features
// ============================================================================

import {
  ActorSystem,
  ActorCell,
  props,
  oneForOneStrategy,
  allForOneStrategy,
  SupervisionDirective,
  MailboxType,
  RoutingStrategy,
  PreStart,
  PostStop,
  PreRestart,
  PostRestart,
  Terminated,
  PoisonPill,
  Router,
  FSM,
  DEAD_LETTER_CHANNEL,
  type ActorRef,
  type ActorContext,
  type DeadLetter,
} from '../src/index.ts';

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const divider = (title: string) =>
  console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);

// ============================================================================
// 1. Basic Actor: tell, ask, sender
// ============================================================================

async function demoBasicActor() {
  divider('1. Basic Actor — tell, ask, sender');

  const system = new ActorSystem({ name: 'basic-demo', logDeadLetters: false });

  // A simple greeter actor
  type GreetMsg =
    | { type: 'greet'; name: string }
    | { type: 'getCount' }
    | symbol;

  let greetCount = 0;

  const greeter = system.actorOf<GreetMsg>(
    props((msg, ctx) => {
      if (msg === PreStart) {
        console.log(`  [${ctx.self.path}] Started!`);
        return;
      }
      if (typeof msg === 'object' && msg !== null) {
        if (msg.type === 'greet') {
          greetCount++;
          console.log(
            `  [${ctx.self.path}] Hello, ${msg.name}! (greet #${greetCount})`
          );
          // Reply to sender if present
          if (ctx.sender) {
            ctx.sender.tell({ greeting: `Hello, ${msg.name}!` } as any);
          }
        } else if (msg.type === 'getCount') {
          // Reply via ask pattern
          ActorCell.reply(ctx, greetCount);
        }
      }
    }),
    'greeter'
  );

  // Fire-and-forget (tell)
  greeter.tell({ type: 'greet', name: 'Alice' });
  greeter.tell({ type: 'greet', name: 'Bob' });

  await sleep(50);

  // Ask pattern
  const count = await greeter.ask<number>({ type: 'getCount' });
  console.log(`  Ask result — greet count: ${count}`);

  await system.terminate();
}

// ============================================================================
// 2. Actor Hierarchy & Lifecycle
// ============================================================================

async function demoHierarchy() {
  divider('2. Actor Hierarchy & Lifecycle');

  const system = new ActorSystem({
    name: 'hierarchy-demo',
    logDeadLetters: false,
  });

  type Msg =
    | { type: 'createChild'; name: string }
    | { type: 'status' }
    | symbol;

  const parent = system.actorOf<Msg>(
    props((msg, ctx) => {
      if (msg === PreStart) {
        console.log(`  [${ctx.self.path}] PreStart`);
        return;
      }
      if (msg === PostStop) {
        console.log(`  [${ctx.self.path}] PostStop`);
        return;
      }
      if (typeof msg === 'object' && msg !== null) {
        if (msg.type === 'createChild') {
          const child = ctx.spawn<Msg>(
            props((childMsg, childCtx) => {
              if (childMsg === PreStart) {
                console.log(`  [${childCtx.self.path}] PreStart`);
                return;
              }
              if (childMsg === PostStop) {
                console.log(`  [${childCtx.self.path}] PostStop`);
                return;
              }
              if (
                typeof childMsg === 'object' &&
                childMsg !== null &&
                childMsg.type === 'status'
              ) {
                console.log(
                  `  [${childCtx.self.path}] I'm alive! Parent: ${childCtx.parent?.path}`
                );
              }
            }),
            msg.name
          );
          console.log(`  [${ctx.self.path}] Created child: ${child.path}`);
        } else if (msg.type === 'status') {
          const childNames = [...ctx.children.keys()].join(', ');
          console.log(`  [${ctx.self.path}] Children: [${childNames}]`);
        }
      }
    }),
    'parent'
  );

  parent.tell({ type: 'createChild', name: 'child-a' });
  parent.tell({ type: 'createChild', name: 'child-b' });
  await sleep(50);

  parent.tell({ type: 'status' });
  await sleep(50);

  // Stopping parent stops all children
  parent.stop();
  await sleep(50);
  console.log('  Parent and children stopped.');

  await system.terminate();
}

// ============================================================================
// 3. Supervision Strategy
// ============================================================================

async function demoSupervision() {
  divider('3. Supervision — OneForOne strategy');

  const system = new ActorSystem({
    name: 'supervision-demo',
    logDeadLetters: false,
  });

  type Msg = { type: 'fail' } | { type: 'work'; payload: string } | symbol;

  const supervisor = system.actorOf<Msg>(
    props(
      (msg, ctx) => {
        if (msg === PreStart) {
          // Create a child that might fail
          ctx.spawn<Msg>(
            props((childMsg, childCtx) => {
              if (childMsg === PreStart) {
                console.log(`  [${childCtx.self.path}] Started`);
                return;
              }
              if (childMsg === PreRestart) {
                console.log(
                  `  [${childCtx.self.path}] PreRestart — cleaning up`
                );
                return;
              }
              if (childMsg === PostRestart) {
                console.log(
                  `  [${childCtx.self.path}] PostRestart — reinitialized`
                );
                return;
              }
              if (typeof childMsg === 'object' && childMsg !== null) {
                if (childMsg.type === 'fail') {
                  throw new Error('Simulated failure!');
                }
                if (childMsg.type === 'work') {
                  console.log(
                    `  [${childCtx.self.path}] Processing: ${childMsg.payload}`
                  );
                }
              }
            }),
            'worker'
          );
          return;
        }
        // Forward all messages to child
        const worker = ctx.children.get('worker');
        if (worker && typeof msg === 'object' && msg !== null) {
          worker.tell(msg);
        }
      },
      {
        supervisionStrategy: oneForOneStrategy(
          3, // max 3 retries
          10000, // within 10 seconds
          (err) => {
            console.log(`  [supervisor] Deciding for error: ${err.message}`);
            return SupervisionDirective.Restart;
          }
        ),
      }
    ),
    'supervisor'
  );

  await sleep(50);
  supervisor.tell({ type: 'work', payload: 'task-1' });
  await sleep(20);
  supervisor.tell({ type: 'fail' });
  await sleep(50);
  supervisor.tell({ type: 'work', payload: 'task-2 (after restart)' });
  await sleep(50);

  await system.terminate();
}

// ============================================================================
// 4. Behavior Hot-Swap (become/unbecome)
// ============================================================================

async function demoBehaviorSwap() {
  divider('4. Behavior Hot-Swap — become/unbecome');

  const system = new ActorSystem({
    name: 'behavior-demo',
    logDeadLetters: false,
  });

  type Msg = { type: 'toggle' } | { type: 'process'; data: string };

  const actor = system.actorOf<Msg>(
    props((msg, ctx) => {
      if (typeof msg !== 'object' || msg === null) return;
      if (msg.type === 'process') {
        console.log(`  [NORMAL mode] Processing: ${msg.data}`);
      } else if (msg.type === 'toggle') {
        console.log('  Switching to TURBO mode (become)');
        ctx.become((turboMsg, turboCtx) => {
          if (typeof turboMsg !== 'object' || turboMsg === null) return;
          if (turboMsg.type === 'process') {
            console.log(`  [TURBO mode] 🚀 Processing: ${turboMsg.data}`);
          } else if (turboMsg.type === 'toggle') {
            console.log('  Reverting to NORMAL mode (unbecome)');
            turboCtx.unbecome();
          }
        });
      }
    }),
    'toggler'
  );

  actor.tell({ type: 'process', data: 'item-1' });
  actor.tell({ type: 'toggle' });
  actor.tell({ type: 'process', data: 'item-2' });
  actor.tell({ type: 'toggle' });
  actor.tell({ type: 'process', data: 'item-3' });
  await sleep(50);

  await system.terminate();
}

// ============================================================================
// 5. Death Watch
// ============================================================================

async function demoDeathWatch() {
  divider('5. Death Watch — context.watch');

  const system = new ActorSystem({ name: 'watch-demo', logDeadLetters: false });

  type Msg =
    | { type: 'start' }
    | { signal: symbol; ref: ActorRef<any> }
    | symbol;

  const watcher = system.actorOf<Msg>(
    props((msg, ctx) => {
      if (typeof msg === 'object' && msg !== null) {
        if ('type' in msg && msg.type === 'start') {
          const watched = ctx.spawn(
            props((m, c) => {
              if (m === PreStart) console.log(`  [${c.self.path}] Started`);
              if (m === PostStop) console.log(`  [${c.self.path}] Stopped`);
            }),
            'watched-actor'
          );
          ctx.watch(watched);
          console.log(`  [${ctx.self.path}] Watching ${watched.path}`);

          // Stop the watched actor after a delay
          setTimeout(() => watched.stop(), 30);
        }

        if ('signal' in msg && msg.signal === Terminated) {
          console.log(
            `  [${ctx.self.path}] Received Terminated for: ${msg.ref.path}`
          );
        }
      }
    }),
    'watcher'
  );

  watcher.tell({ type: 'start' });
  await sleep(100);

  await system.terminate();
}

// ============================================================================
// 6. Router (Round-Robin)
// ============================================================================

async function demoRouter() {
  divider('6. Router — Round-Robin');

  const system = new ActorSystem({
    name: 'router-demo',
    logDeadLetters: false,
  });

  type WorkMsg = { type: 'work'; id: number } | symbol;

  const routerActor = system.actorOf<WorkMsg>(
    props((msg, ctx) => {
      if (msg === PreStart) {
        const router = new Router<WorkMsg>(
          {
            strategy: RoutingStrategy.RoundRobin,
            nrOfInstances: 3,
            props: props<WorkMsg>((workerMsg, workerCtx) => {
              if (
                typeof workerMsg === 'object' &&
                workerMsg !== null &&
                workerMsg.type === 'work'
              ) {
                console.log(
                  `  [${workerCtx.self.path}] Handling work #${workerMsg.id}`
                );
              }
            }),
          },
          ctx
        );

        // Store router on context for later use
        (ctx as any).__router = router;
        return;
      }

      if (typeof msg === 'object' && msg !== null) {
        const router: Router<WorkMsg> = (ctx as any).__router;
        if (router) router.route(msg);
      }
    }),
    'router-parent'
  );

  await sleep(30);
  for (let i = 1; i <= 6; i++) {
    routerActor.tell({ type: 'work', id: i });
  }
  await sleep(100);

  await system.terminate();
}

// ============================================================================
// 7. FSM (Finite State Machine)
// ============================================================================

async function demoFSM() {
  divider('7. FSM — Traffic Light');

  const system = new ActorSystem({ name: 'fsm-demo', logDeadLetters: false });

  type Light = 'red' | 'yellow' | 'green';
  type LightMsg = { type: 'next' } | { type: 'status' };

  const trafficLightProps = FSM.create<Light, number, LightMsg>()
    .initialState('red', 0)
    .when('red', (msg, data, fsm) => {
      if (msg.type === 'next') return fsm.goto('green', data + 1);
      if (msg.type === 'status') console.log(`  🔴 RED (cycle ${data})`);
      return fsm.stay();
    })
    .when('green', (msg, data, fsm) => {
      if (msg.type === 'next') return fsm.goto('yellow', data);
      if (msg.type === 'status') console.log(`  🟢 GREEN (cycle ${data})`);
      return fsm.stay();
    })
    .when('yellow', (msg, data, fsm) => {
      if (msg.type === 'next') return fsm.goto('red', data);
      if (msg.type === 'status') console.log(`  🟡 YELLOW (cycle ${data})`);
      return fsm.stay();
    })
    .onTransition((from, to) => {
      console.log(`  Traffic light: ${from} → ${to}`);
    })
    .build();

  const light = system.actorOf<LightMsg>(trafficLightProps, 'traffic-light');

  light.tell({ type: 'status' });
  light.tell({ type: 'next' }); // red → green
  light.tell({ type: 'status' });
  light.tell({ type: 'next' }); // green → yellow
  light.tell({ type: 'status' });
  light.tell({ type: 'next' }); // yellow → red
  light.tell({ type: 'status' });
  await sleep(50);

  await system.terminate();
}

// ============================================================================
// 8. Stash
// ============================================================================

async function demoStash() {
  divider('8. Stash — buffering messages');

  const system = new ActorSystem({ name: 'stash-demo', logDeadLetters: false });

  type Msg = { type: 'init' } | { type: 'work'; id: number } | symbol;

  let initialized = false;

  const actor = system.actorOf<Msg>(
    props((msg, ctx) => {
      if (typeof msg !== 'object' || msg === null) return;

      if (!initialized && msg.type === 'work') {
        console.log(`  Stashing work #${msg.id} (not yet initialized)`);
        ctx.stash();
        return;
      }

      if (msg.type === 'init') {
        console.log('  Initialized! Unstashing all...');
        initialized = true;
        ctx.unstashAll();
        return;
      }

      if (msg.type === 'work') {
        console.log(`  Processing work #${msg.id}`);
      }
    }),
    'stasher'
  );

  // Send work before init — these get stashed
  actor.tell({ type: 'work', id: 1 });
  actor.tell({ type: 'work', id: 2 });
  actor.tell({ type: 'work', id: 3 });
  await sleep(30);

  // Now initialize — stashed messages get replayed
  actor.tell({ type: 'init' });
  await sleep(50);

  await system.terminate();
}

// ============================================================================
// 9. EventStream (pub/sub)
// ============================================================================

async function demoEventStream() {
  divider('9. EventStream — Pub/Sub');

  const system = new ActorSystem({ name: 'event-demo', logDeadLetters: false });

  const TOPIC = 'news.tech';

  // Subscribe
  system.eventStream.subscribe<string>(TOPIC, (event) => {
    console.log(`  [Subscriber A] ${event}`);
  });
  system.eventStream.subscribe<string>(TOPIC, (event) => {
    console.log(`  [Subscriber B] ${event}`);
  });

  // Dead letter subscription
  system.eventStream.subscribe<DeadLetter>(DEAD_LETTER_CHANNEL, (dl) => {
    console.log(`  [DeadLetter] Message to ${dl.recipient.path}`);
  });

  // Publish
  system.eventStream.publish(TOPIC, 'TypeScript 6.0 released!');
  system.eventStream.publish(TOPIC, 'actor-bonilla hits 1 million downloads!');

  await system.terminate();
}

// ============================================================================
// 10. Scheduling
// ============================================================================

async function demoScheduling() {
  divider('10. Scheduling — timers');

  const system = new ActorSystem({
    name: 'schedule-demo',
    logDeadLetters: false,
  });

  type Msg = { type: 'tick' } | { type: 'delayed'; payload: string } | symbol;
  let tickCount = 0;

  const actor = system.actorOf<Msg>(
    props((msg, ctx) => {
      if (msg === PreStart) {
        // Schedule a one-time message
        ctx.scheduleOnce(50, {
          type: 'delayed',
          payload: 'hello from the future!',
        });

        // Schedule a repeating tick
        const cancel = ctx.scheduleRepeatedly(20, { type: 'tick' });
        // Cancel after 5 ticks
        setTimeout(() => {
          cancel.cancel();
          console.log(`  Tick cancelled after ${tickCount} ticks`);
        }, 110);
        return;
      }
      if (typeof msg !== 'object' || msg === null) return;

      if (msg.type === 'tick') {
        tickCount++;
        console.log(`  Tick #${tickCount}`);
      } else if (msg.type === 'delayed') {
        console.log(`  Delayed message: ${msg.payload}`);
      }
    }),
    'scheduler'
  );

  await sleep(200);
  await system.terminate();
}

// ============================================================================
// Run all demos
// ============================================================================

async function main() {
  console.log('\n🎭 actor-bonilla — actor system for TypeScript\n');

  await demoBasicActor();
  await demoHierarchy();
  await demoSupervision();
  await demoBehaviorSwap();
  await demoDeathWatch();
  await demoRouter();
  await demoFSM();
  await demoStash();
  await demoEventStream();
  await demoScheduling();

  divider('All demos complete!');
}

main().catch(console.error);
