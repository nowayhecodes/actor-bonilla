// ============================================================================
// actor-bonilla — Public API
// ============================================================================

// Core types & factories
export {
  type ActorRef,
  type ActorContext,
  type Receive,
  type Props,
  type Envelope,
  type SupervisionStrategy,
  type CancelToken,
  type TerminatedMessage,
  type DeadLetter,
  type RouterConfig,
  type AskReplyMessage,
  type EventClassifier,
  type EventSubscriber,
  props,
  oneForOneStrategy,
  allForOneStrategy,
  SupervisionDirective,
  MailboxType,
  DispatcherType,
  RoutingStrategy,
  // Lifecycle signals
  PreStart,
  PostStop,
  PreRestart,
  PostRestart,
  Terminated,
  PoisonPill,
  Kill,
  ReceiveTimeout,
  AskReply,
} from './types.js';

// Actor System
export { ActorSystem, type ActorSystemConfig } from './actor-system.js';

// Actor Cell (reply helper)
export { ActorCell } from './actor-cell.js';

// Mailboxes
export {
  UnboundedMailbox,
  BoundedMailbox,
  PriorityMailbox,
  type Mailbox,
} from './mailbox.js';

// Dispatchers
export {
  DefaultDispatcher,
  PinnedDispatcher,
  CallingThreadDispatcher,
  type Dispatcher,
} from './dispatcher.js';

// EventStream
export {
  EventStream,
  DEAD_LETTER_CHANNEL,
  LOG_CHANNEL,
  LIFECYCLE_CHANNEL,
} from './event-stream.js';

// Router
export { Router } from './router.js';

// FSM
export {
  FSM,
  type FSMContext,
  type StateHandler,
  type StateResult,
  type TransitionHandler,
} from './fsm.js';
