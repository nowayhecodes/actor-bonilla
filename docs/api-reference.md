# API reference

Everything below is imported from **`actor-bonilla`** (single export surface).

## Core types & factories

`ActorRef`, `ActorContext`, `Receive`, `Props`, `Envelope`, `SupervisionStrategy`, `CancelToken`, `TerminatedMessage`, `DeadLetter`, `RouterConfig`, `ActorSystemConfig`, `AskReplyMessage`, `EventClassifier`, `EventSubscriber`, `LifecycleSignal`, `props`, `oneForOneStrategy`, `allForOneStrategy`, `SupervisionDirective`, `MailboxType`, `DispatcherType`, `RoutingStrategy`, lifecycle symbols (`PreStart`, `PostStop`, …), `PoisonPill`, `Kill`, `ReceiveTimeout`, `AskReply`.

## Runtime

`ActorSystem`, `ActorCell`, mailboxes (`UnboundedMailbox`, `BoundedMailbox`, `PriorityMailbox`), dispatchers (`DefaultDispatcher`, `PinnedDispatcher`, `CallingThreadDispatcher`), `EventStream`, `Router`, `FSM` (+ `FSMContext`, `StateHandler`, `StateResult`, `TransitionHandler`).

## Thread pool

`ThreadedActorSystem`, `ThreadedActorSystemConfig`, `ThreadPool`, `ThreadPoolRef`, `WorkerMsgType`, `ThreadPoolConfig`, `ThreadedProps`, `ThreadedReceive`, `ThreadedActorContext`, `MainToWorkerMsg`, `WorkerToMainMsg`.

## Validation helpers

`assertActorSystemConfig`, `assertThreadPoolConfig`, `assertThreadedProps`.

For exact signatures, use your editor’s “Go to definition” on imports or read the `.d.ts` files under `dist/` in the package.
