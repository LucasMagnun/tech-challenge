'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TransactionStatus } from '@tech-challenge/shared';

type Transaction = {
  transactionExternalId: string;
  transactionType: { name: string };
  transactionStatus: { name: TransactionStatus };
  value: string;
  createdAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const statusStyles: Record<TransactionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export default function TransactionDetail() {
  const params = useParams<{ id: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchTransaction() {
      setLoading(true);
      setNotFound(false);
      setError(false);
      try {
        const response = await fetch(`${API_URL}/transactions/${params.id}`);
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setError(true);
          return;
        }
        setTransaction((await response.json()) as Transaction);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchTransaction();
  }, [params.id]);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-blue-600 hover:underline">
        ← Voltar para a lista
      </Link>

      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Detalhe da transação</h1>

      {loading && <p className="text-sm text-gray-500">Carregando...</p>}

      {!loading && notFound && <p className="text-sm text-red-600">Transação não encontrada.</p>}

      {!loading && error && (
        <p className="text-sm text-red-600">Não foi possível carregar a transação.</p>
      )}

      {!loading && transaction && (
        <dl className="space-y-4 rounded border border-gray-200 p-6">
          <div>
            <dt className="text-xs text-gray-500">Identificador</dt>
            <dd className="font-mono text-sm text-gray-900">{transaction.transactionExternalId}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Valor</dt>
            <dd className="text-lg font-medium text-gray-900">
              {currencyFormatter.format(Number(transaction.value))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[transaction.transactionStatus.name]}`}
              >
                {transaction.transactionStatus.name}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Tipo de transferência</dt>
            <dd className="text-sm text-gray-900">{transaction.transactionType.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Criada em</dt>
            <dd className="text-sm text-gray-900">
              {new Date(transaction.createdAt).toLocaleString('pt-BR')}
            </dd>
          </div>
        </dl>
      )}
    </main>
  );
}
