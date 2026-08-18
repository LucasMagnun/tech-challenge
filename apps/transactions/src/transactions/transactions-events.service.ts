import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Transaction } from '@prisma/client';

@Injectable()
export class TransactionsEventsService {
  private readonly subject = new Subject<Transaction>();

  emit(transaction: Transaction) {
    this.subject.next(transaction);
  }

  stream() {
    return this.subject.asObservable();
  }
}
