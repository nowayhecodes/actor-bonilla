# Features

## Actor model

- **`ActorSystem`** — root container; create top-level actors under `/user` with `actorOf(props, name)`, look up via `actorFor('/user/name')`, shut down with `terminate()`.
- **`ActorCell`** (internal) backs each **`ActorRef`**: `tell`, `ask`, `stop`, hierarchical paths.
- **`props(receive, options)`** — bundles behavior and optional mailbox / dispatcher / supervision.

## Mailboxes

`MailboxType` selects **`UnboundedMailbox`** (default ring buffer), **`BoundedMailbox`** (drops when full → dead letters), or **`PriorityMailbox`** (heap + comparator).

## Dispatchers

`DispatcherType` selects **`DefaultDispatcher`** (batched microtasks / `setImmediate`), **`PinnedDispatcher`**, or **`CallingThreadDispatcher`** (run inline — useful for deterministic tests).

## Supervision

`oneForOneStrategy` / `allForOneStrategy` plus **`SupervisionDirective`** (`Resume`, `Restart`, `Stop`, `Escalate`) drive child failure handling.

## Routing

**`Router`** + **`RoutingStrategy`** (round-robin, random, smallest-mailbox, broadcast, consistent hash) fans messages to child actors created from `RouterConfig`.

## FSM

**`FSM`** builds **`Props`** for state-machine actors: `when`, `goto` / `stay` / `stop`, optional transition listeners and state timeouts.

## Event stream

**`EventStream`** is a simple pub/sub API; built-in classifiers include **`DEAD_LETTER_CHANNEL`**, **`LOG_CHANNEL`**, **`LIFECYCLE_CHANNEL`**.

See type definitions and exports in [API reference](./api-reference.md).
