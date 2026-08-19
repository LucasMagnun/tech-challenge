import type { Transaction } from '@prisma/client';
import type { TransactionResource } from '@tech-challenge/shared';

export function toTransactionResource(transaction: Transaction): TransactionResource {
  return {
    transactionExternalId: transaction.id,
    transactionType: { name: String(transaction.transferTypeId) },
    transactionStatus: { name: transaction.status },
    value: transaction.value.toString(),
    createdAt: transaction.createdAt.toISOString(),
  };
}
