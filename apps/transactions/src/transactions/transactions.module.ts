import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsEventsService } from './transactions-events.service';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [KafkaModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsEventsService],
})
export class TransactionsModule {}
