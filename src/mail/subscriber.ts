import { Message } from "./message";

export interface Subscriber<T> {
    partitions: string[];
    onReceive(message: Message<T>): Promise<boolean>;
}

export class ExampleSubscriber implements Subscriber<string> {
    partitions: string[];

    constructor(partitions: string[]) {
        this.partitions = partitions;
    }

    async onReceive(message: Message<string>): Promise<boolean> {
        // Process the received message
        console.log(`Received message: ${message.value.content}`);

        // Return true to indicate the message was successfully processed
        return true;
    }
}