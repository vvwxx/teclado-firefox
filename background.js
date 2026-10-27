// As ações de aba só podem ser feitas aqui; a página só manda o pedido.
const ACOES = {
  fechar: (aba) => browser.tabs.remove(aba.id),
  recuperar: async () => {
    const [ultima] = await browser.sessions.getRecentlyClosed({ maxResults: 1 });
    const sessao = ultima?.tab ?? ultima?.window;
    if (sessao) await browser.sessions.restore(sessao.sessionId);
  },
  novaAba: (aba) => browser.tabs.create({ index: aba.index + 1 }),
};

browser.runtime.onMessage.addListener((msg, remetente) => ACOES[msg.acao]?.(remetente.tab, msg));
