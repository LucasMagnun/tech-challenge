import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import {
  TransactionCreatedEventSchema,
  type TransactionStatusUpdatedEvent,
} from '@tech-challenge/shared';

const FRAUD_THRESHOLD = 1000;

@Injectable()
export class AntiFraudService {
  private readonly logger = new Logger(AntiFraudService.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly kafkaClient: ClientKafka) {}

  async evaluate(rawPayload: unknown) {
    const parsed = TransactionCreatedEventSchema.safeParse(rawPayload);

    if (!parsed.success) {
      this.logger.error(`Evento invalido recebido: ${JSON.stringify(parsed.error.flatten())}`);
      return;
    }

    const { transactionId, value } = parsed.data;
    const status = value > FRAUD_THRESHOLD ? 'REJECTED' : 'APPROVED';

    const event: TransactionStatusUpdatedEvent = { transactionId, status };

    this.kafkaClient.emit('transaction.status.updated', event);
    this.logger.log(`Transacao ${transactionId} avaliada como ${status}`);
  }
}
