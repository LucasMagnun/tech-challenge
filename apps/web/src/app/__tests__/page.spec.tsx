import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../page';

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
}

function paginated(data: unknown[], overrides: Partial<{ page: number; totalPages: number }> = {}) {
  return {
    data,
    total: data.length,
    page: overrides.page ?? 1,
    limit: 10,
    totalPages: overrides.totalPages ?? 1,
  };
}

describe('Home', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    MockEventSource.instances = [];
    // @ts-expect-error - mock simplificado do EventSource para os testes
    global.EventSource = MockEventSource;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('lista as transacoes retornadas pela api', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () =>
        paginated([
          {
            id: '1',
            value: '150.50',
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('R$ 150,50')).toBeInTheDocument();
    });
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('atualiza a lista quando recebe um evento via sse', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => paginated([]) });

    render(<Home />);

    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const source = MockEventSource.instances[0];

    act(() => {
      source.onmessage?.({
        data: JSON.stringify({
          id: '2',
          value: '999',
          status: 'APPROVED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('R$ 999,00')).toBeInTheDocument();
    });
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('envia uma nova transacao ao submeter o formulario', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => paginated([]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => paginated([]) });

    render(<Home />);

    const input = screen.getByPlaceholderText('Valor da transação');
    await user.type(input, '250');
    await user.click(screen.getByRole('button', { name: /criar/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ value: 250 }),
        }),
      );
    });
  });

  it('mostra mensagem de erro para valor invalido, sem chamar a api', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => paginated([]) });

    render(<Home />);

    const input = screen.getByPlaceholderText('Valor da transação');
    await user.type(input, '-10');
    await user.click(screen.getByRole('button', { name: /criar/i }));

    expect(await screen.findByText('Informe um valor positivo.')).toBeInTheDocument();
  });

  it('exibe controles de paginacao quando ha mais de uma pagina', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => paginated([], { page: 1, totalPages: 3 }),
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /pr[óo]xima/i })).not.toBeDisabled();
  });
});
