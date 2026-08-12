import type {
  SagaMessage,
  SagaMessageHandler,
  SagaMessageName,
} from '../contracts/saga-message.contract';

export const MESSAGE_BUS = Symbol('MESSAGE_BUS');

export interface MessageBus {
  publish(message: SagaMessage): Promise<void>;
  register(
    queue: string,
    routingKey: SagaMessageName,
    handler: SagaMessageHandler,
  ): void;
}
