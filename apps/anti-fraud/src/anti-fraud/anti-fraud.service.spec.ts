import { Test, TestingModule } from '@nestjs/testing';
import { AntiFraudService } from './anti-fraud.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';

describe('AntiFraudService', () => {
  let service: AntiFraudService;
  let kafkaClient: { emit: jest.Mock };

  beforeEach(async () => {
    kafkaClient = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AntiFraudService, { provide: KAFKA_CLIENT, useValue: kafkaClient }],
    }).compile();

    service = module.get<AntiFraudService>(AntiFraudService);
  });

  it('deve aprovar transacao com valor menor ou igual a 1000', async () => {
    await service.evaluate({
      transactionId: '11111111-1111-1111-1111-111111111111',
      amount: 500,
      createdAt: new Date().toISOString(),
    });

    expect(kafkaClient.emit).toHaveBeenCalledWith('transaction.status.updated', {
      transactionId: '11111111-1111-1111-1111-111111111111',
      status: 'APPROVED',
    });
  });

  it('deve rejeitar transacao com valor maior que 1000', async () => {
    await service.evaluate({
      transactionId: '22222222-2222-2222-2222-222222222222',
      amount: 1500,
      createdAt: new Date().toISOString(),
    });

    expect(kafkaClient.emit).toHaveBeenCalledWith('transaction.status.updated', {
      transactionId: '22222222-2222-2222-2222-222222222222',
      status: 'REJECTED',
    });
  });

  it('nao deve publicar evento se o payload for invalido', async () => {
    await service.evaluate({ foo: 'bar' });

    expect(kafkaClient.emit).not.toHaveBeenCalled();
  });
});
