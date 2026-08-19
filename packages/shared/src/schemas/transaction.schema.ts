import { z } from 'zod';

export const TransactionStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const CreateTransactionSchema = z.object({
  accountExternalIdDebit: z.string().uuid(),
  accountExternalIdCredit: z.string().uuid(),
  transferTypeId: z.number().int().positive(),
  value: z.number().positive(),
});

export const TransactionResourceSchema = z.object({
  transactionExternalId: z.string().uuid(),
  transactionType: z.object({ name: z.string() }),
  transactionStatus: z.object({ name: TransactionStatusSchema }),
  value: z.string(),
  createdAt: z.string(),
});

export const TransactionCreatedEventSchema = z.object({
  transactionId: z.string().uuid(),
  amount: z.number().positive(),
  createdAt: z.string().datetime(),
});

export const TransactionStatusUpdatedEventSchema = z.object({
  transactionId: z.string().uuid(),
  status: TransactionStatusSchema,
});

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
export type CreateTransactionDto = z.infer<typeof CreateTransactionSchema>;
export type TransactionResource = z.infer<typeof TransactionResourceSchema>;
export type TransactionCreatedEvent = z.infer<typeof TransactionCreatedEventSchema>;
export type TransactionStatusUpdatedEvent = z.infer<typeof TransactionStatusUpdatedEventSchema>;
