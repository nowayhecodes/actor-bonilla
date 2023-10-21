import { Actor } from '../sys/actor';
import { Box } from '../mail/box';
import { Message } from '../mail/message';

export class Supervisor {
    private actors: Actor[] = [];

    /**
     * Start the actor and add it to the list of actors.
     *
     * @return {Actor} The newly created actor.
     */
    startActor(): Actor {
        const actor = new Actor();
        this.actors.push(actor);
        return actor;
    }

    /**
     * Sends a message to the specified actor.
     *
     * @param {Actor} actor - The actor to send the message to.
     * @param {any} message - The message to send.
     * @return {void} This function does not return anything.
     */
    sendMessage(actor: Actor, message: any): void {
        actor.sendMessage(message);
    }

    /**
     * Restarts the provided actor.
     *
     * @param {Actor} actor - The actor to restart.
     * @return {void} 
     */
    restartActor(actor: Actor): void {
        // Restart logic goes here
    }

    /**
     * Discard an actor.
     *
     * @param {Actor} actor - The actor to discard.
     * @return {void} - This function does not return a value.
     */
    discardActor(actor: Actor): void {
        // Discard logic goes here
    }
}