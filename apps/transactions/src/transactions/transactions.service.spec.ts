import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { KAFKA_CLIENT } from '../kafka/kafka.module';
import { TransactionsEventsService } from './transactions-events.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: {
    transaction: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let kafkaClient: { emit: jest.Mock };
  let transactionsEvents: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };
    kafkaClient = { emit: jest.fn() };
    transactionsEvents = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KAFKA_CLIENT, useValue: kafkaClient },
        { provide: TransactionsEventsService, useValue: transactionsEvents },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('deve criar uma transacao, publicar no kafka e emitir no sse', async () => {
    const expected = {
      id: 'uuid-fake',
      value: '150.50',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.transaction.create.mockResolvedValue(expected);

    const result = await service.create({ value: 150.5 });

    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: { value: 150.5 },
    });
    expect(transactionsEvents.emit).toHaveBeenCalledWith(expected);
    expect(kafkaClient.emit).toHaveBeenCalledWith('transaction.created', {
      transactionId: expected.id,
      amount: 150.5,
      createdAt: expected.createdAt.toISOString(),
    });
    expect(result).toEqual(expected);
  });

  it('deve listar transacoes paginadas ordenadas por data de criacao desc', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(25);

    const result = await service.findAll(2, 10);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      data: [],
      total: 25,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('deve limitar o tamanho maximo de pagina a 100', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.count.mockResolvedValue(0);

    await service.findAll(1, 500);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('deve atualizar o status e emitir no sse quando o evento for valido', async () => {
    const updated = {
      id: '11111111-1111-1111-1111-111111111111',
      value: '500',
      status: 'APPROVED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.transaction.update.mockResolvedValue(updated);

    await service.updateStatus({
      transactionId: '11111111-1111-1111-1111-111111111111',
      status: 'APPROVED',
    });

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      data: { status: 'APPROVED' },
    });
    expect(transactionsEvents.emit).toHaveBeenCalledWith(updated);
  });

  it('nao deve atualizar nem emitir quando o evento for invalido', async () => {
    await service.updateStatus({ foo: 'bar' });

    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(transactionsEvents.emit).not.toHaveBeenCalled();
  });
});
