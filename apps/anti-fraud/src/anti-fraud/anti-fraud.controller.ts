import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AntiFraudService } from './anti-fraud.service';

@Controller()
export class AntiFraudController {
  constructor(private readonly antiFraudService: AntiFraudService) {}

  @EventPattern('transaction.created')
  async handleTransactionCreated(@Payload() payload: unknown) {
    await this.antiFraudService.evaluate(payload);
  }
}
