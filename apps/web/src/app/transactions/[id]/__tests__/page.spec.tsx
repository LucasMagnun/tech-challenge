import { render, screen, waitFor } from '@testing-library/react';
import TransactionDetail from '../page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-1111-1111-111111111111' }),
}));

function makeTransaction() {
  return {
    transactionExternalId: '11111111-1111-1111-1111-111111111111',
    transactionType: { name: '1' },
    transactionStatus: { name: 'APPROVED' },
    value: '500',
    createdAt: new Date().toISOString(),
  };
}

describe('TransactionDetail', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('exibe os dados da transacao quando encontrada', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransaction(),
    });

    render(<TransactionDetail />);

    await waitFor(() => {
      expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
    });
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('11111111-1111-1111-1111-111111111111')).toBeInTheDocument();
  });

  it('exibe mensagem de nao encontrada quando a api retorna 404', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    render(<TransactionDetail />);

    expect(await screen.findByText('Transação não encontrada.')).toBeInTheDocument();
  });

  it('exibe mensagem de erro generico quando a api falha', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network error'));

    render(<TransactionDetail />);

    expect(await screen.findByText('Não foi possível carregar a transação.')).toBeInTheDocument();
  });
});
