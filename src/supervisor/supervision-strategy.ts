/**
 * What should happen if an actor runs into an critical error?
 */
export type SupervisionStrategy = 'Restart' | 'Resume' | 'Shutdown';
