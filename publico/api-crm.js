// ---------------------------------------------------------------------------
// LIGAÇÃO COM A API REAL DO CRM — /api/area-formando/* (25/09/2026)
//
// O portal nasceu sobre dados de exemplo e fala o dialeto do protótipo
// (`/auth/otp/solicitar`, resposta crua). O CRM responde no padrão dele
// (`/auth/codigo`, envelope `{ success, data }`). A tradução vive AQUI, num
// arquivo só, para o resto do app não saber de qual lado veio o dado — e para
// sumir sem deixar rastro quando o protótipo deixar de existir.
//
// LIGA/DESLIGA: `window.API_URL`. Sem ela, nada muda — o portal segue na
// demonstração. Com ela, passa a ler dados reais.
//
// O QUE A API AINDA NÃO TEM (e por isso a tela mostra menos): boleto único,
// 2ª via e os encargos de atraso. Cada um entra no CRM com a sua trava; até lá
// o adaptador devolve vazio em vez de inventar.
// ---------------------------------------------------------------------------

(function () {
  const BASE = window.API_URL;
  if (!BASE) return;

  const url = (caminho) => `${String(BASE).replace(/\/$/, '')}${caminho}`;

  /** O CRM responde { success, data } — o app espera o conteúdo direto. */
  async function pedir(metodo, caminho, corpo, token) {
    const r = await fetch(url(caminho), {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const envelope = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(envelope.message || 'falha');
      erro.status = r.status;
      // O CRM já responde em português e explicando ("a 2ª via vence em até 5
      // dias"). Guardar a frase deixa a tela mostrar ISSO em vez de um "não foi
      // possível" genérico — o protótipo devolvia códigos, e o app traduzia.
      if (envelope.message) erro.detalhe = envelope.message;
      throw erro;
    }
    return envelope.data ?? {};
  }

  /**
   * Envio de arquivo. O portal lê o comprovante como data URL (era o que o
   * protótipo guardava); o CRM quer `multipart`, como todo upload dele. A
   * conversão mora aqui — o app continua sem saber do outro lado.
   */
  async function enviarArquivo(caminho, corpo, token) {
    const blob = await (await fetch(corpo.conteudo)).blob();
    const forma = new FormData();
    forma.append('comprovante', blob, corpo.arquivo || 'comprovante');
    // O que o formando escreveu junto ("paguei no caixa"): fica guardado com o
    // arquivo, porque é o contexto que o atendimento lê depois.
    if (corpo.observacao) forma.append('observacao', corpo.observacao);
    // Sem `content-type` de propósito: quem monta o limite do multipart é o
    // navegador, e escrever o cabeçalho na mão quebra o parse no servidor.
    const r = await fetch(url(caminho), {
      method: 'POST',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: forma,
    });
    const envelope = await r.json().catch(() => ({}));
    if (!r.ok) {
      const erro = new Error(envelope.message || 'falha');
      erro.status = r.status;
      throw erro;
    }
    return envelope.data ?? {};
  }

  /** Destinos vêm mascarados numa lista; a tela mostra por canal. */
  function porCanal(destinos) {
    const lista = Array.isArray(destinos) ? destinos : [];
    return {
      whatsapp: lista.find((d) => !String(d).includes('@')) || null,
      email: lista.find((d) => String(d).includes('@')) || null,
    };
  }

  const dataBR = (iso) => (iso ? String(iso).slice(0, 10) : null);

  /**
   * O comprovante no CRM não tem status: a equipe só consulta, não aprova
   * (decisão de 25/09). Para o FORMANDO, porém, um comprovante anexado está
   * esperando a baixa — que é o que a tela dele chama de "em análise". Traduzir
   * aqui evita espalhar `status || 'em_analise'` por toda a interface.
   */
  const comoOPortalLe = (c) => ({ ...c, status: 'em_analise', analisadoEm: null });

  /** Pedido que ainda dá trabalho para a equipe — os mesmos nomes do CRM. */
  const ABERTOS = ['pendente', 'em_atendimento'];

  /**
   * A composição do boleto único no vocabulário do protótipo.
   *
   * A tela lê `unico.parcelas`, `unico.economia` (o desconto de pontualidade
   * preservado) e `unico.diasParaVencer`; o CRM devolve a mesma coisa em
   * `itens`, `descontoMantido` e a data pronta.
   */
  const comoOPortalLeOUnico = (r) => ({
    valor: r.subtotal,
    vencimento: r.vencimento,
    taxaBoleto: r.taxaBoleto,
    totalBoleto: r.total,
    economiaTaxa: r.economiaTaxa,
    unico: {
      economia: r.descontoMantido || 0,
      diasParaVencer: 3,
      parcelas: (r.itens || []).map((i) => ({
        id: i.billId,
        parcela: i.parcela,
        vencimento: i.vencimento,
        vencida: i.vencida,
        valorComPontualidade: i.valorDaParcela,
        valor: i.valor,
        encargos: i.encargos,
      })),
    },
  });

  /**
   * Uma cobrança, no vocabulário do portal.
   *
   * `valorDevido` é o que se paga SEM a taxa administrativa — o protótipo
   * separa as duas coisas para a tela poder dizer "inclui R$ 2,90 de taxa". Na
   * vencida esse valor já vem com IPCA e juros (cláusula 4.3), e é por isso que
   * ele não pode ser a parcela limpa: o boleto antigo ficou desatualizado, e
   * pagar por ele deixa a dívida de pé.
   */
  const doBoleto = (b) => ({
    ...b,
    valorDevido: Math.round(((b.totalBoleto || 0) - (b.taxaBoleto || 0)) * 100) / 100,
    // `unico`/`unicoAtivo` vêm da API desde 28/09 (mig 947): um diz que a
    // cobrança É o boleto único, o outro que a parcela está dentro de um.
    // `qtdComprovantes` vem da API desde 25/09 — é o que acende o selo
    // "Comprovante enviado" e o que faz a vencida virar "em análise".
    qtdComprovantes: b.qtdComprovantes || 0,
    contestacao: null,
  });

  /**
   * Tradução de uma chamada do protótipo para a API do CRM.
   * Devolve `undefined` quando a rota ainda não existe lá — quem chama decide
   * o que fazer (as telas dessas partes ficam escondidas).
   */
  async function traduzir(metodo, caminho, corpo, token) {
    // ── login ────────────────────────────────────────────────────────────────
    if (caminho === '/auth/otp/solicitar') {
      const r = await pedir('POST', '/auth/codigo', { cpf: corpo?.cpf }, null);
      // `codigoDev` só vem de ambiente que não é produção, onde nada é enviado —
      // é o que deixa testar o login sem mandar mensagem para o formando.
      if (r.enviado) return { cadastrado: true, destinos: porCanal(r.destinos), codigoDev: r.codigoDev };
      // Em produção a resposta é a mesma exista o CPF ou não: quem não tem
      // cadastro simplesmente não recebe código. Só o que a pessoa pode
      // corrigir volta como motivo.
      if (r.motivo === 'cpf_invalido') throw new Error('cpf_invalido');
      if (r.motivo === 'aguarde') throw new Error('aguarde');
      if (r.motivo === 'muitas_tentativas') throw new Error('muitas_tentativas');
      return { cadastrado: true, destinos: porCanal([]) };
    }

    if (caminho === '/auth/otp/verificar') {
      try {
        const r = await pedir('POST', '/auth/verificar', { cpf: corpo?.cpf, codigo: corpo?.codigo }, null);
        if (r.etapa === 'escolha') {
          return {
            precisaEscolherTurma: true,
            tokenEscolha: r.token,
            turmas: (r.adesoes || []).map((a) => ({
              adesaoId: a.adesaoId,
              turma: a.turma?.codigo || '',
              curso: a.turma?.curso || '',
              cidade: '',
              dataEvento: null,
            })),
          };
        }
        return { token: r.token };
      } catch (err) {
        // A tela sabe falar de código inválido; o resto vira falha genérica.
        throw new Error(err.status === 401 ? 'codigo_invalido' : 'falha');
      }
    }

    if (caminho === '/auth/escolher-turma') {
      const r = await pedir('POST', '/auth/escolher', { adesaoId: corpo?.adesaoId }, token);
      return { token: r.token };
    }

    // ── sessão ───────────────────────────────────────────────────────────────
    if (caminho === '/me') {
      const r = await pedir('GET', '/me', null, token);
      return {
        nome: r.nome,
        primeiroNome: r.primeiroNome,
        curso: r.curso,
        situacao: r.situacao,
        canceladaEm: null,
        turma: {
          codigo: r.turma?.codigo || '',
          rotulo: r.turma?.rotulo || r.turma?.codigo || '',
          instituicao: r.turma?.instituicao || null,
          dataEvento: dataBR(r.turma?.dataEvento),
          cidade: '',
        },
      };
    }

    if (caminho === '/financeiro') {
      const r = await pedir('GET', '/financeiro', null, token);
      const boletos = (r.boletos || []).map(doBoleto);
      const resumo = r.resumo || {};
      return {
        resumo: {
          ...resumo,
          mensalidade: resumo.parcelas ? Math.round((resumo.contratado / resumo.parcelas) * 100) / 100 : 0,
          emAnalise: resumo.emAnalise || 0,
        },
        boletos,
      };
    }

    const umBoleto = caminho.match(/^\/financeiro\/([\w-]+)$/);
    if (umBoleto && metodo === 'GET') {
      // A tela do boleto mostra os comprovantes e a contestação DAQUELA parcela;
      // a API lista os do formando inteiro, então o filtro é aqui.
      const [b, todos, pedidos] = await Promise.all([
        pedir('GET', `/financeiro/${umBoleto[1]}`, null, token),
        pedir('GET', '/comprovantes', null, token).catch(() => ({ comprovantes: [] })),
        pedir('GET', '/solicitacoes', null, token).catch(() => ({ solicitacoes: [] })),
      ]);
      const contestacao = (pedidos.solicitacoes || []).find(
        (s) => s.tipo === 'contestacao' && s.billId === umBoleto[1] && ABERTOS.includes(s.status),
      );
      return {
        ...doBoleto(b),
        comprovantes: (todos.comprovantes || []).filter((c) => c.billId === umBoleto[1]).map(comoOPortalLe),
        historico: [],
        contestacao: contestacao
          ? { protocolo: contestacao.protocolo, criadoEm: contestacao.criadoEm, motivo: contestacao.mensagem }
          : null,
      };
    }

    // ── 2ª via ───────────────────────────────────────────────────────────────
    const simular2via = caminho.match(/^\/financeiro\/([\w-]+)\/segunda-via\/simular$/);
    if (simular2via && metodo === 'POST') {
      // A tela lê a composição direto (correcaoIpca, juros, total); no CRM ela
      // vem dentro de `encargos`, junto do total já com a taxa.
      const r = await pedir('POST', `/financeiro/${simular2via[1]}/segunda-via/simular`, corpo || {}, token);
      return r.encargos || {};
    }

    const emitir2via = caminho.match(/^\/financeiro\/([\w-]+)\/segunda-via$/);
    if (emitir2via && metodo === 'POST') {
      const r = await pedir('POST', `/financeiro/${emitir2via[1]}/segunda-via`, corpo || {}, token);
      // No protótipo a parcela mantém o id; aqui a 2ª via é uma cobrança NOVA,
      // e a antiga sai da lista. Quem chama precisa saber qual abrir depois.
      return { ...r, novoBillId: r.novoBillId || null };
    }

    // ── boleto único ─────────────────────────────────────────────────────────
    if (caminho === '/financeiro/antecipar/simular' && metodo === 'POST') {
      return comoOPortalLeOUnico(await pedir('POST', '/financeiro/antecipar/simular', corpo || {}, token));
    }
    if (caminho === '/financeiro/antecipar' && metodo === 'POST') {
      const r = await pedir('POST', '/financeiro/antecipar', corpo || {}, token);
      // A tela abre o boleto recém-criado pelo `id`.
      return { ...comoOPortalLeOUnico(r), id: r.billId, url: r.url };
    }

    // ── comprovante ──────────────────────────────────────────────────────────
    const anexar = caminho.match(/^\/financeiro\/([\w-]+)\/comprovante$/);
    if (anexar && metodo === 'POST') {
      return enviarArquivo(`/financeiro/${anexar[1]}/comprovante`, corpo || {}, token);
    }

    // ── o que ainda não existe no CRM ────────────────────────────────────────
    // Silêncio explícito: melhor a tela não mostrar a seção do que mostrar um
    // dado inventado. Quando a rota nascer, some daqui.
    //
    // ⚠️ Toda rota que o app chama no início PRECISA estar aqui, mesmo vazia: o
    // Início pede /financeiro e /turma juntos, e uma promessa rejeitada trava a
    // entrada inteira — foi o que aconteceu no primeiro teste.
    if (caminho === '/turma') {
      const eu = await pedir('GET', '/me', null, token);
      return {
        codigo: eu.turma?.codigo || '',
        rotulo: eu.turma?.rotulo || '',
        instituicao: eu.turma?.instituicao || null,
        dataEvento: dataBR(eu.turma?.dataEvento),
        cidade: '',
        cronograma: [],
        convites: [],
        comissao: [],
      };
    }
    // ── pedidos (viram demanda no CRM) ───────────────────────────────────────
    if (caminho === '/solicitacoes' && metodo === 'POST') {
      try {
        // O corpo do protótipo já é o que a API quer; o resto (motivo,
        // quantidade, tipo de convite) vai inteiro como memória do pedido.
        return await pedir('POST', '/solicitacoes', corpo || {}, token);
      } catch (err) {
        // 409 é a contestação já aberta — a tela sabe falar disso.
        if (err.status === 409) throw new Error('contestacao_ja_aberta');
        throw err;
      }
    }
    if (caminho === '/solicitacoes') {
      const r = await pedir('GET', '/solicitacoes', null, token);
      return { solicitacoes: r.solicitacoes || [] };
    }

    if (caminho === '/notificacoes') return { avisos: [], naoLidos: 0 };
    if (caminho === '/comprovantes') {
      const r = await pedir('GET', '/comprovantes', null, token);
      return { comprovantes: (r.comprovantes || []).map(comoOPortalLe) };
    }
    if (caminho === '/solicitacoes') return { solicitacoes: [] };

    const naoImplementada = new Error('indisponivel_no_crm');
    naoImplementada.status = 501;
    throw naoImplementada;
  }

  /**
   * O que a API do CRM ainda NÃO faz. A tela esconde essas ações em vez de
   * oferecer um botão que dá erro — foi o que acontecia com "Gerar 2ª via",
   * que chamava uma rota inexistente e morria na cara do formando.
   *
   * Cada uma some daqui quando a rota nascer, e a tela volta sozinha.
   */
  window.API_RECURSOS = { segundaVia: true, boletoUnico: true, encargos: true };

  window.API_CRM = traduzir;
})();
