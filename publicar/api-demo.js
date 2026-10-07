// API da Área do Formando rodando no próprio navegador.
//
// Mesmas rotas do servidor.mjs (Parte 4 do plano) e mesmas regras de isolamento,
// só que sem servidor: é o que faz a versão publicada funcionar como página
// estática. O app chama window.API_DEMO no lugar do fetch.
//
// Diferenças conscientes para a demonstração:
//   - o token é uma chave de memória, não um JWT assinado (não há servidor para verificar);
//   - o código de acesso aparece na tela, como no ambiente local;
//   - o PDF vira uma prévia na própria tela, porque o visualizador não deixa a
//     página iniciar downloads.
(function () {
  const DADOS = window.DADOS_DEMO;
  const HOJE = DADOS.hojeSimulado;
  const OTP = { expiraMs: 10 * 60 * 1000, tentativas: 5, tetoDiario: 10, janelaMs: 60 * 1000 };

  const codigos = new Map();
  const pedidosDoDia = new Map();
  const sessoes = new Map();   // token -> { adesaoId, etapa? }
  const solicitacoes = [];
  const contatoPendente = new Map();   // adesaoId -> { email, telefone, pedidoEm }
  const comprovantes = [];             // { id, adesaoId, billId, arquivo, ... }
  const historicos = new Map();        // billId -> [{ quando, oQue, detalhe }]
  const lembretes = new Map();         // adesaoId -> dias de antecedência
  const presencas = new Map();         // adesaoId -> { [chaveEtapa]: 'sim' | 'nao' }
  const lidas = new Map();             // adesaoId -> Set de avisos já vistos
  const enderecos = new Map();         // adesaoId -> endereço que o formando informou

  /** O endereço como o perfil devolve — vazio é o estado inicial, de propósito. */
  function enderecoDoPerfil(adesaoId) {
    const e = enderecos.get(adesaoId);
    const falta = [];
    if (!e?.cep) falta.push('CEP');
    if (!e?.rua) falta.push('rua');
    if (!e?.numero) falta.push('número');
    if (!e?.cidade) falta.push('cidade');
    if (!e?.uf) falta.push('estado');
    return {
      rua: e?.rua || '',
      numero: e?.numero || '',
      complemento: e?.complemento || '',
      bairro: e?.bairro || '',
      cidade: e?.cidade || '',
      uf: e?.uf || '',
      cep: e?.cep ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : null,
      completo: falta.length === 0,
      falta,
    };
  }

  function registrarHistorico(billId, oQue, detalhe) {
    const lista = historicos.get(billId) || [];
    lista.push({ quando: new Date().toISOString(), oQue, detalhe: detalhe || null });
    historicos.set(billId, lista);
  }

  function historicoDoBoleto(adesaoId, b) {
    const fixos = [];
    if (b.pagoEm) fixos.push({ quando: `${b.pagoEm}T12:00:00.000Z`, oQue: 'Pagamento confirmado', detalhe: `Baixa de ${b.valorPago || b.valor}` });
    for (const c of comprovantes.filter((c) => c.adesaoId === adesaoId && c.billId === b.id)) {
      fixos.push({ quando: c.enviadoEm, oQue: 'Comprovante enviado', detalhe: c.arquivo });
    }
    for (const u of unicosPorId.values()) {
      if (unicoExpirou(u) && u.unico.parcelas.some((p) => p.id === b.id)) {
        fixos.push({ quando: `${u.vencimento}T23:59:00.000Z`, oQue: 'Boleto único cancelado', detalhe: 'Venceu sem pagamento; a parcela seguiu com o boleto dela' });
      }
    }
    return [...fixos, ...(historicos.get(b.id) || [])].sort((a, b2) => a.quando.localeCompare(b2.quando));
  }

  const chaveEtapa = (e) => `${e.data}|${e.etapa}`;

  const soDigitos = (s) => String(s || '').replace(/\D/g, '');
  const acharAdesao = (id) => DADOS.adesoes.find((a) => a.adesaoId === id);
  const acharTurma = (id) => DADOS.turmas.find((t) => t.id === id);
  const adesoesPorCpf = (cpf) => DADOS.adesoes.filter((a) => a.cpf === soDigitos(cpf));
  const novoToken = () => 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  const mascararEmail = (e) => {
    if (!e) return null;
    const [u, d] = e.split('@');
    return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`;
  };
  const mascararTelefone = (t) => {
    const d = soDigitos(t);
    return d.length < 4 ? null : `(${d.slice(2, 4)}) *****-${d.slice(-4)}`;
  };

  const erro = (status, corpo) => Object.assign(new Error(corpo.erro), { status, corpo });

  // O boleto único fica AO LADO das parcelas, que mantêm o boleto delas. Pago o
  // único, as parcelas dele são quitadas; vencido sem pagamento, só ele é cancelado.
  const unicosPorId = new Map();
  const unicoExpirou = (u) => Boolean(u) && u.status !== 'pago' && u.vencimento < HOJE;
  const unicoAtivoDa = (b) => {
    const u = b.noUnico && unicosPorId.get(b.noUnico);
    return u && u.status !== 'pago' && !unicoExpirou(u) ? u : null;
  };

  function situacaoBoleto(b) {
    if (b.unico) return b.status === 'pago' ? 'pago' : unicoExpirou(b) ? 'expirado' : 'em_aberto';
    // 2ª via com data nova tira a parcela do atraso até o novo vencimento.
    if (b.status === 'em_atraso' && b.vencimento >= HOJE) return 'em_aberto';
    return b.status;
  }

  const nomeCobranca = (b) => (b.unico ? 'Boleto único' : `Parcela ${b.parcela}`);

  function projetarBoleto(b) {
    const status = situacaoBoleto(b);
    const emitido = status === 'em_aberto' || status === 'em_atraso';
    return {
      id: b.id, parcela: b.parcela, nome: nomeCobranca(b), descricao: b.descricao, vencimento: b.vencimento,
      valor: b.valor, status, pagoEm: b.pagoEm, valorPago: b.valorPago,
      valorAtualizado: b.valorAtualizado || null,
      encargos: b.encargos || null,
      temLinhaDigitavel: emitido,
      unicoAtivo: (() => { const u = !b.unico && unicoAtivoDa(b); return u ? { id: u.id, vencimento: u.vencimento } : null; })(),
      unico: b.unico || null,
    };
  }

  // O que se deve HOJE: vencida vale a parcela mais o juro corrido até hoje.
  const comprovantePendente = (adesaoId, billId) =>
    comprovantes.some((c) => c.adesaoId === adesaoId && c.billId === billId && c.status === 'em_analise');

  // vencida com comprovante anexado aparece como "em análise", não como atraso
  // A taxa administrativa de gestão de conta vem do contrato (o plano da turma
  // define o valor) e é somada em CADA boleto — inclusive no boleto único, uma
  // vez só. Contrato sem taxa: nada é somado.
  function taxaDoContrato(adesao) {
    return Number(adesao?.contrato?.taxaBoleto) || 0;
  }

  async function projetarComValor(b, adesaoId, adesao) {
    const p = projetarBoleto(b);
    p.taxaBoleto = b.status === 'pago' ? 0 : taxaDoContrato(adesao);
    if (p.status === 'pago') p.valorDevido = b.valorPago || b.valor;
    else if (p.status === 'em_atraso' && !b.unico) {
      p.encargosHoje = calcularEncargos(b, new Date(`${HOJE}T12:00:00`));
      p.valorDevido = p.encargosHoje.total;
    } else p.valorDevido = b.valorAtualizado || b.valor;
    if (p.status === 'em_atraso' && adesaoId && comprovantePendente(adesaoId, b.id)) p.status = 'em_analise';
    // o que o banco cobra: valor devido + taxa do contrato
    p.totalBoleto = arredonda(p.valorDevido + p.taxaBoleto);
    return p;
  }

  function resumoFinanceiro(adesao, todos) {
    const projetados = todos.filter((b) => !b.unico);
    const soma = (f) => arredonda(projetados.filter(f).reduce((a, b) => a + b.valorDevido, 0));
    const proxima = projetados
      .filter((b) => ['em_aberto', 'em_atraso', 'em_analise', 'agendado', 'nao_gerado'].includes(b.status))
      .filter((b) => b.vencimento >= HOJE)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    return {
      contratado: adesao.contrato.total,
      parcelas: adesao.contrato.parcelas,
      mensalidade: adesao.contrato.mensalidade,
      pago: soma((b) => b.status === 'pago'),
      emAberto: soma((b) => b.status === 'em_aberto'),
      emAtraso: soma((b) => b.status === 'em_atraso'),
      emAnalise: soma((b) => b.status === 'em_analise'),
      aEmitir: soma((b) => b.status === 'agendado' || b.status === 'nao_gerado'),
      parcelasPagas: projetados.filter((b) => b.status === 'pago' && !b.unico).length,
      proximoVencimento: proxima ? { vencimento: proxima.vencimento, valor: proxima.valorDevido, status: proxima.status } : null,
    };
  }

  function validarSegundaVia(b, novoVencimento) {
    if (b.unico) return erro(409, { erro: 'unico_sem_segunda_via' });
    if (situacaoBoleto(b) !== 'em_atraso') return erro(409, { erro: 'nao_esta_vencida', status: situacaoBoleto(b) });
    const hojeD = new Date(`${HOJE}T12:00:00`);
    const novaData = new Date(`${novoVencimento}T12:00:00`);
    if (Number.isNaN(novaData.getTime()) || novaData < hojeD) return erro(400, { erro: 'data_invalida' });
    if ((novaData - hojeD) / 86400000 > DIAS_SEGUNDA_VIA) return erro(400, { erro: 'data_longe' });
    return null;
  }
  const DIAS_SEGUNDA_VIA = 5;   // a 2ª via vence em 5 dias

  // --- boleto único de antecipação (igual ao servidor.mjs) ----------------------
  const DIAS_VENCIMENTO_UNICO = 3;
  let sequencialUnico = 0;

  async function montarUnico(adesao, billIds) {
    const ids = Array.isArray(billIds) ? [...new Set(billIds.map(String))] : [];
    if (!ids.length) throw erro(400, { erro: 'nenhuma_parcela' });
    const escolhidas = [];
    for (const id of ids) {
      const b = adesao.boletos.find((x) => x.id === id);
      if (!b || b.unico) throw erro(400, { erro: 'parcela_invalida' });
      const s = situacaoBoleto(b);
      if (s === 'pago' || unicoAtivoDa(b)) throw erro(400, { erro: 'parcela_indisponivel' });
      escolhidas.push({ b, s });
    }
    escolhidas.sort((x, y) => x.b.parcela - y.b.parcela);

    const venc = new Date(`${HOJE}T12:00:00`);
    venc.setDate(venc.getDate() + DIAS_VENCIMENTO_UNICO);
    const vencimento = venc.toISOString().slice(0, 10);

    const parcelas = [];
    for (const { b, s } of escolhidas) {
      if (s === 'em_atraso') {
        const e = calcularEncargos(b, venc);
        parcelas.push({ id: b.id, parcela: b.parcela, vencimento: b.vencimentoOriginal || b.vencimento, vencida: true, valorDaParcela: b.valor, valor: e.total, encargos: e });
      } else {
        parcelas.push({ id: b.id, parcela: b.parcela, vencimento: b.vencimento, vencida: false, valorDaParcela: b.valor, valor: b.valorAtualizado || b.valor, encargos: b.encargos || null });
      }
    }
    const total = arredonda(parcelas.reduce((a, p) => a + p.valor, 0));
    const primeira = parcelas[0].parcela;
    const ultima = parcelas[parcelas.length - 1].parcela;
    const turma = acharTurma(adesao.turmaId);
    const id = `unico-${adesao.adesaoId}-${sequencialUnico + 1}`;
    return {
      id, parcela: null,
      descricao: `${turma.eventoCrm} - BOLETO UNICO (parcela${parcelas.length > 1 ? `s ${primeira} a ${ultima}` : ` ${primeira}`})`,
      vencimento, valor: total, status: 'em_aberto', pagoEm: null, valorPago: null,
      linhaDigitavel: linhaFalsa(`${id}-${vencimento}`), pdfUrl: null, urlPagamento: null,
      unico: {
        parcelas,
        diasParaVencer: DIAS_VENCIMENTO_UNICO,
      },
    };
  }

  // --- regras do termo de adesão (iguais às do servidor.mjs) ------------------
  // Vêm do contrato (adesao-contrato.template.ts), com a cláusula citada.
  // A parcela tem VALOR FIXO (06/10/2026): não há desconto de pontualidade a
  // perder, e o IPCA do contrato é o reajuste programado dos 12 meses, que já
  // chega dentro do valor da parcela. O atraso acrescenta só o juro de mora.
  const REGRA_ENCARGOS = 'Valor da parcela acrescido de juros de mora de 1% ao mês, calculados pro rata die';
  const CONTRATO = {
    jurosMoraMes: 0.01,                    // 4.3
    diasNotificacaoAntesNegativar: 15,     // 8.2
    honorariosCobranca: 0.10,              // 8.3
    diasInadimplenciaRescisao: 90,         // 17.1
    taxaReprogramacao: 75,                 // 17.3
  };
  const TIPOS_SOLICITACAO = {
    convites_extras: 'Convites extras',
    antecipacao: 'Antecipação de parcelas',
    renegociacao: 'Negociação de débitos',
    contestacao: 'Contestação de cobrança',
    dados_contato: 'Correção de contato',
    comprovante: 'Comprovante de pagamento',
    lembrete: 'Lembrete de vencimento',
    presenca: 'Confirmação de presença',
    quitacao: 'Declaração de quitação',
    pagamento_duplicado: 'Pagamento em duplicidade',
    outro: 'Pedido para a equipe',
  };

  const arredonda = (n) => Math.round(n * 100) / 100;

  let sequencialProtocolo = 0;
  function novaSolicitacao(adesao, tipo, payload) {
    sequencialProtocolo += 1;
    const agora = new Date();
    const s = {
      id: `sol-${solicitacoes.length + 1}`,
      protocolo: `SOL-${agora.getFullYear()}-${String(sequencialProtocolo).padStart(4, "0")}`,
      adesaoId: adesao.adesaoId,
      tipo,
      rotulo: TIPOS_SOLICITACAO[tipo] || TIPOS_SOLICITACAO.outro,
      payload,
      status: 'aberta',
      criadoEm: agora.toISOString(),
    };
    solicitacoes.push(s);
    return s;
  }

  function calcularEncargos(boleto, ate) {
    const venceu = new Date(`${boleto.vencimentoOriginal || boleto.vencimento}T12:00:00`);
    const dias = Math.max(0, Math.round((ate - venceu) / 86400000));
    const valor = arredonda(boleto.valor);
    const juros = arredonda(valor * CONTRATO.jurosMoraMes * (dias / 30));
    return {
      diasAtraso: dias,
      valorParcela: valor,
      juros,
      total: arredonda(valor + juros),
      regra: REGRA_ENCARGOS,
    };
  }
  async function extratoDoFormando(adesao) {
    // o boleto único é outra forma de pagar as mesmas parcelas: não entra na conta
    const bs = await Promise.all(adesao.boletos.filter((b) => !b.unico).map(async (b) => ({ ...b, ...(await projetarComValor(b, adesao.adesaoId, adesao)) })));
    const pagas = bs.filter((b) => b.status === 'pago')
      .sort((a, b) => (a.pagoEm || a.vencimento).localeCompare(b.pagoEm || b.vencimento));
    const totalPago = arredonda(pagas.reduce((a, b) => a + (b.valorPago || b.valor), 0));
    const emAberto = arredonda(bs.filter((b) => b.status !== 'pago').reduce((a, b) => a + b.valorDevido, 0));
    return {
      contrato: {
        total: adesao.contrato.total, parcelas: adesao.contrato.parcelas,
        mensalidade: adesao.contrato.mensalidade,
        primeiraParcela: adesao.contrato.primeiraParcela, assinadoEm: adesao.contrato.assinadoEm,
      },
      reajustes: adesao.reajustesAplicados || [],
      reajusteProgramado: adesao.reajuste?.aplicado ? null : adesao.reajuste || null,
      pagamentos: pagas.map((b) => ({
        parcela: b.parcela, vencimento: b.vencimento, pagoEm: b.pagoEm,
        valor: b.valor, valorPago: b.valorPago || b.valor, forma: b.pagoPeloUnico ? 'Boleto único' : 'Boleto',
      })),
      totais: {
        pago: totalPago, emAberto,
        parcelasPagas: pagas.length, parcelasEmAberto: bs.length - pagas.length,
        quitado: emAberto === 0,
      },
      emitidoEm: new Date().toISOString(),
    };
  }
  const contestacaoAberta = (adesaoId, billId) => {
    const s = solicitacoes.find((x) => x.adesaoId === adesaoId && x.tipo === 'contestacao' && x.status === 'aberta' && x.payload?.billId === billId);
    return s ? { protocolo: s.protocolo, criadoEm: s.criadoEm, motivo: s.payload?.motivo || null } : null;
  };

  const comprovantesDoBoleto = (adesaoId, billId) => comprovantes
    .filter((c) => c.adesaoId === adesaoId && c.billId === billId)
    .map(({ conteudo, adesaoId: _a, ...resto }) => resto);

  // --- recibo de parcela paga ------------------------------------------------
  function reciboDaParcela(adesao, turma, b) {
    return {
      numero: `REC-${turma.codigo}-${String(b.parcela).padStart(3, '0')}`,
      formando: adesao.nome.replace(/\s*\(TESTE\)\s*/i, ''),
      cpf: adesao.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
      turma: turma.rotulo,
      evento: turma.eventoCrm,
      parcela: b.parcela,
      totalParcelas: adesao.contrato.parcelas,
      descricao: b.descricao,
      vencimento: b.vencimento,
      pagoEm: b.pagoEm,
      valorPago: b.valorPago || b.valor,
      forma: 'Boleto bancário',
      emitidoEm: new Date().toISOString(),
    };
  }

  // --- informe anual de pagamentos (imposto de renda) ------------------------
  function informeAnual(adesao) {
    const pagas = adesao.boletos.map((b) => ({ ...b, status: situacaoBoleto(b) })).filter((b) => b.status === 'pago');
    const porAno = new Map();
    for (const b of pagas) {
      const ano = (b.pagoEm || b.vencimento).slice(0, 4);
      const atual = porAno.get(ano) || { ano, total: 0, parcelas: 0 };
      atual.total = arredonda(atual.total + (b.valorPago || b.valor));
      atual.parcelas += 1;
      porAno.set(ano, atual);
    }
    return {
      anos: [...porAno.values()].sort((a, b) => b.ano.localeCompare(a.ano)),
      prestador: DADOS.config.prestador || {
        razaoSocial: 'INDAIÁ EVENTOS (dados de exemplo)',
        cnpj: '00.000.000/0001-00',
      },
    };
  }

  // --- central de avisos (o sino) -------------------------------------------
  function notificacoes(adesao) {
    const turma = acharTurma(adesao.turmaId);
    const hojeD = new Date(`${HOJE}T12:00:00`);
    const emDias = (iso) => Math.round((new Date(`${iso}T12:00:00`) - hojeD) / 86400000);
    const itens = [];

    if (adesao.situacao !== 'cancelada') {
      const bs = adesao.boletos.map((b) => ({ ...b, status: situacaoBoleto(b) }));
      for (const b of bs.filter((b) => b.status === 'em_atraso')) {
        itens.push({
          id: `atraso-${b.id}`, tipo: 'atraso', prioridade: 1,
          titulo: `${nomeCobranca(b)} vencida`,
          texto: `Venceu em ${b.vencimento.split('-').reverse().join('/')} — gere a 2ª via com data nova.`,
          quando: b.vencimento, ir: 'financeiro', billId: b.id,
        });
      }
      for (const b of bs.filter((b) => b.status === 'expirado')) {
        const ps = b.unico.parcelas;
        itens.push({
          id: `expirou-${b.id}`, tipo: 'vencimento', prioridade: 2,
          titulo: 'Boleto único cancelado',
          texto: `Venceu em ${b.vencimento.split('-').reverse().join('/')} sem pagamento. ${ps.length > 1 ? `As parcelas ${ps[0].parcela} a ${ps[ps.length - 1].parcela} continuam` : `A parcela ${ps[0].parcela} continua`} como estava${ps.length > 1 ? 'm' : ''}.`,
          quando: b.vencimento, ir: 'financeiro',
        });
      }
      // "vence em N dias" só para o que já tem boleto na mão para pagar
      for (const b of bs.filter((b) => b.status === 'em_aberto')) {
        const d = emDias(b.vencimento);
        if (d >= 0 && d <= 10) {
          itens.push({
            id: `vence-${b.id}`, tipo: 'vencimento', prioridade: 2,
            titulo: `${nomeCobranca(b)} vence ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}`,
            texto: `${b.vencimento.split('-').reverse().join('/')} · R$ ${(b.valorAtualizado || b.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            quando: b.vencimento, ir: 'financeiro', billId: b.id,
          });
        }
      }
    }

    for (const s of solicitacoes.filter((s) => s.adesaoId === adesao.adesaoId)) {
      if (s.status !== 'aberta') {
        itens.push({
          id: `pedido-${s.id}`, tipo: 'pedido', prioridade: 2,
          titulo: `${s.rotulo}: ${s.status === 'atendida' ? 'resolvido' : 'não aprovado'}`,
          texto: s.protocolo, quando: s.criadoEm.slice(0, 10), ir: 'pedidos',
        });
      }
    }

    // O mural da turma não entra aqui: o sino é do que depende do formando.
    const proxima = turma.cronograma.filter((e) => e.data >= HOJE).sort((a, b) => a.data.localeCompare(b.data))[0];
    if (proxima && emDias(proxima.data) <= 45) {
      itens.push({
        id: `etapa-${chaveEtapa(proxima)}`, tipo: 'etapa', prioridade: 3,
        titulo: `Chegando: ${proxima.etapa}`,
        texto: `${proxima.data.split('-').reverse().join('/')}${proxima.local ? ` · ${proxima.local}` : ''}`,
        quando: proxima.data, ir: 'cronograma',
      });
    }

    const vistas = lidas.get(adesao.adesaoId) || new Set();
    const lista = itens
      .map((i) => ({ ...i, lida: vistas.has(i.id) }))
      .sort((a, b) => (a.prioridade - b.prioridade) || b.quando.localeCompare(a.quando));
    return { itens: lista, naoLidas: lista.filter((i) => !i.lida).length };
  }

  function daSessao(token, { permitirEscolha = false } = {}) {
    const s = sessoes.get(token);
    if (!s || (s.etapa && !permitirEscolha)) throw erro(401, { erro: 'sessao_invalida' });
    if (s.etapa && permitirEscolha) return s;
    const adesao = acharAdesao(s.adesaoId);
    if (!adesao) throw erro(401, { erro: 'sessao_invalida' });
    return adesao;
  }

  const ROTAS = {
    'GET /config': () => ({
      whatsappAtendimento: DADOS.config.whatsappAtendimento,
      nomeAtendimento: DADOS.config.nomeAtendimento,
      mostrarReajusteProgramado: DADOS.config.mostrarReajusteProgramado,
      modoDev: true,
      demo: true,
      cpfExemplo: (DADOS.adesoes.find((x) => x.adesaoId === 'ades-7506-teste') || DADOS.adesoes[0]).cpf,
      contrato: CONTRATO,
      avisoDados: DADOS.aviso,
      hojeSimulado: HOJE,
    }),

    'POST /auth/otp/solicitar': (_t, corpo) => {
      const doc = soDigitos(corpo.cpf);
      if (doc.length !== 11) throw erro(400, { erro: 'cpf_invalido' });

      const dia = new Date().toISOString().slice(0, 10);
      const contador = pedidosDoDia.get(doc);
      const atual = contador && contador.dia === dia ? contador : { dia, quantidade: 0 };
      if (atual.quantidade >= OTP.tetoDiario) throw erro(429, { erro: 'muitas_tentativas' });

      const anterior = codigos.get(doc);
      if (anterior && Date.now() - anterior.criadoEm < OTP.janelaMs) {
        throw erro(429, { erro: 'aguarde', segundos: Math.ceil((OTP.janelaMs - (Date.now() - anterior.criadoEm)) / 1000) });
      }

      const neutra = { enviado: true, canais: ['whatsapp', 'email'], destinos: {}, expiraEmSegundos: OTP.expiraMs / 1000 };
      const encontradas = adesoesPorCpf(doc);
      // Em produção a resposta é neutra; aqui, como nada é enviado, avisamos.
      if (!encontradas.length) return { ...neutra, cadastrado: false };

      const codigo = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
      codigos.set(doc, { codigo, expiraEm: Date.now() + OTP.expiraMs, tentativas: 0, criadoEm: Date.now() });
      pedidosDoDia.set(doc, { dia, quantidade: atual.quantidade + 1 });

      const alvo = encontradas[0];
      return {
        ...neutra,
        destinos: { email: mascararEmail(alvo.email), whatsapp: mascararTelefone(alvo.telefone) },
        codigoDev: codigo,
      };
    },

    'POST /auth/otp/verificar': (_t, corpo) => {
      const doc = soDigitos(corpo.cpf);
      const guardado = codigos.get(doc);
      if (!guardado || guardado.expiraEm < Date.now()) throw erro(401, { erro: 'codigo_invalido' });
      if (guardado.tentativas >= OTP.tentativas) throw erro(429, { erro: 'muitas_tentativas' });
      guardado.tentativas += 1;
      if (String(corpo.codigo || '') !== guardado.codigo) throw erro(401, { erro: 'codigo_invalido' });
      codigos.delete(doc);

      const encontradas = adesoesPorCpf(doc);
      if (encontradas.length > 1) {
        const token = novoToken();
        sessoes.set(token, { etapa: 'escolha', cpf: doc });
        return {
          precisaEscolherTurma: true,
          tokenEscolha: token,
          turmas: encontradas.map((a) => {
            const t = acharTurma(a.turmaId);
            return { adesaoId: a.adesaoId, turma: t.rotulo, curso: a.curso, dataEvento: t.dataEvento, cidade: t.cidade };
          }),
        };
      }

      const token = novoToken();
      sessoes.set(token, { adesaoId: encontradas[0].adesaoId });
      return { token, expiraEm: new Date(Date.now() + 30 * 60000).toISOString() };
    },

    'POST /auth/escolher-turma': (t, corpo) => {
      const s = daSessao(t, { permitirEscolha: true });
      if (!s.etapa) throw erro(401, { erro: 'sessao_invalida' });
      const adesao = acharAdesao(corpo.adesaoId);
      if (!adesao || adesao.cpf !== s.cpf) throw erro(404, { erro: 'nao_encontrado' });
      const token = novoToken();
      sessoes.set(token, { adesaoId: adesao.adesaoId });
      return { token, expiraEm: new Date(Date.now() + 30 * 60000).toISOString() };
    },

    // meus dados: o formando confere e pede correção; quem confirma é a equipe
    'GET /perfil': (t) => {
      const a2 = daSessao(t);
      const turma = acharTurma(a2.turmaId);
      return {
        nome: a2.nome,
        cpf: a2.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
        email: a2.email,
        telefone: a2.telefone,
        curso: a2.curso,
        turma: turma.rotulo,
        pendente: contatoPendente.get(a2.adesaoId) || null,
        lembreteDias: lembretes.get(a2.adesaoId) ?? null,
        endereco: enderecoDoPerfil(a2.adesaoId),
      };
    },

    // Endereço: a operadora não mostra o boleto de quem não tem endereço no
    // cadastro. Na demonstração ele começa VAZIO de propósito — é o estado dos
    // formandos que assinaram antes de o link exigir os campos separados, e é
    // esse caminho que a gente quer poder mostrar.
    'PATCH /perfil/endereco': (t, corpo) => {
      const a = daSessao(t);
      const cep = soDigitos(corpo.cep);
      if (cep.length !== 8) throw erro(400, { erro: 'cep_invalido', message: 'O CEP precisa ter 8 números.' });
      const uf = String(corpo.uf || '').trim().toUpperCase();
      if (uf.length !== 2) throw erro(400, { erro: 'uf_invalida', message: 'O estado precisa ter 2 letras (ex.: SC).' });
      const rua = String(corpo.endereco || corpo.rua || '').trim();
      const numero = String(corpo.numero || '').trim();
      const cidade = String(corpo.cidade || '').trim();
      if (!rua) throw erro(400, { erro: 'rua', message: 'Diga o nome da rua.' });
      if (!numero) throw erro(400, { erro: 'numero', message: 'Diga o número. Se não tiver, escreva "s/n".' });
      if (!cidade) throw erro(400, { erro: 'cidade', message: 'Diga a cidade.' });
      enderecos.set(a.adesaoId, {
        rua, numero, complemento: String(corpo.complemento || '').trim(),
        bairro: String(corpo.bairro || '').trim(), cidade, uf, cep,
      });
      return { endereco: enderecoDoPerfil(a.adesaoId), vindi: { atualizado: true, erro: null } };
    },

    // lembrete de vencimento: quantos dias antes avisar (null desliga)
    'POST /perfil/lembrete': (t, corpo) => {
      const a = daSessao(t);
      if (corpo.dias === null || corpo.dias === 0) {
        lembretes.delete(a.adesaoId);
        return { lembreteDias: null };
      }
      const n = Number(corpo.dias);
      if (![1, 3, 5, 7].includes(n)) throw erro(400, { erro: 'prazo_invalido' });
      lembretes.set(a.adesaoId, n);
      const s = novaSolicitacao(a, 'lembrete', { mensagem: `Avisar por e-mail ${n} dia(s) antes de cada vencimento.`, quantidade: n });
      return { lembreteDias: n, protocolo: s.protocolo };
    },

    'POST /perfil/contato': (t, corpo) => {
      const a2 = daSessao(t);
      const novoEmail = String(corpo.email || '').trim();
      const novoTelefone = soDigitos(corpo.telefone);
      if (novoEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(novoEmail)) throw erro(400, { erro: 'email_invalido' });
      if (novoTelefone && (novoTelefone.length < 10 || novoTelefone.length > 13)) throw erro(400, { erro: 'telefone_invalido' });
      const mudouEmail = novoEmail && novoEmail !== a2.email;
      const mudouTelefone = novoTelefone && novoTelefone !== soDigitos(a2.telefone);
      if (!mudouEmail && !mudouTelefone) throw erro(400, { erro: 'nada_mudou' });
      const pendente = {
        email: mudouEmail ? novoEmail : null,
        telefone: mudouTelefone ? novoTelefone : null,
        pedidoEm: new Date().toISOString(),
      };
      contatoPendente.set(a2.adesaoId, pendente);
      const pedido = novaSolicitacao(a2, 'dados_contato', {
        mensagem: [
          mudouEmail ? `e-mail: ${a2.email} → ${novoEmail}` : '',
          mudouTelefone ? `telefone: ${a2.telefone} → ${novoTelefone}` : '',
        ].filter(Boolean).join(' · '),
      });
      pendente.protocolo = pedido.protocolo;
      return { pendente, protocolo: pedido.protocolo };
    },

    'GET /me': (t) => {
      const a = daSessao(t);
      const turma = acharTurma(a.turmaId);
      return {
        nome: a.nome, primeiroNome: a.nome.split(' ')[0], curso: a.curso,
        situacao: a.situacao, canceladaEm: a.canceladaEm,
        turma: { codigo: turma.codigo, rotulo: turma.rotulo, dataEvento: turma.dataEvento, cidade: turma.cidade },
      };
    },

    'GET /financeiro': (t) => {
      const a = daSessao(t);
      if (a.situacao === 'cancelada') throw erro(409, { erro: 'adesao_cancelada', canceladaEm: a.canceladaEm });
      return Promise.all(a.boletos.map((b) => projetarComValor(b, a.adesaoId, a))).then((boletos) => {
        for (const p of boletos) {
          p.qtdComprovantes = comprovantes.filter((c) => c.adesaoId === a.adesaoId && c.billId === p.id).length;
          p.contestacao = contestacaoAberta(a.adesaoId, p.id);
        }
        return { resumo: resumoFinanceiro(a, boletos), boletos };
      });
    },

    // meus comprovantes: tudo o que o formando anexou
    'GET /comprovantes': (t) => {
      const a = daSessao(t);
      return {
        comprovantes: comprovantes
          .filter((c) => c.adesaoId === a.adesaoId)
          .sort((x, y) => y.enviadoEm.localeCompare(x.enviadoEm))
          .map(({ conteudo, adesaoId, ...resto }) => {
            const b = a.boletos.find((x) => x.id === resto.billId);
            return { ...resto, cobranca: b ? nomeCobranca(b) : '—', vencimento: b?.vencimento || null, temArquivo: Boolean(conteudo) };
          }),
      };
    },

    'GET /contrato': (t) => {
      const a = daSessao(t);
      const turma = acharTurma(a.turmaId);
      return {
        termo: {
          assinadoEm: a.contrato.assinadoEm,
          origem: a.contrato.docusealSubmissionId ? 'docuseal' : 'anexo',
          url: a.contrato.termoUrl,
        },
        contratoColetivo: { turma: turma.rotulo, url: a.contrato.contratoColetivoUrl },
        contratado: {
          total: a.contrato.total, parcelas: a.contrato.parcelas,
          mensalidade: a.contrato.mensalidade, primeiraParcela: a.contrato.primeiraParcela,
        },
        taxaBoleto: a.contrato.taxaBoleto ?? null,
        convites: a.convites,
        solicitacoes: solicitacoes.filter((s) => s.adesaoId === a.adesaoId),
      };
    },

    'POST /solicitacoes': (t, corpo) => {
      const a = daSessao(t);
      if (!TIPOS_SOLICITACAO[corpo.tipo]) throw erro(400, { erro: 'tipo_invalido' });
      if (corpo.tipo === 'contestacao' && corpo.billId && contestacaoAberta(a.adesaoId, corpo.billId)) {
        throw erro(409, { erro: 'contestacao_ja_aberta' });
      }
      return novaSolicitacao(a, corpo.tipo, {
        mensagem: String(corpo.mensagem || '').slice(0, 1000),
        quantidade: corpo.quantidade || null,
        conviteTipo: corpo.conviteTipo || null,
        billId: corpo.billId || null,
        motivo: corpo.motivo || null,
      });
    },

    'GET /solicitacoes': (t) => {
      const a = daSessao(t);
      return {
        solicitacoes: solicitacoes
          .filter((s) => s.adesaoId === a.adesaoId)
          .sort((x, y) => y.criadoEm.localeCompare(x.criadoEm)),
      };
    },

    'GET /extrato': (t) => extratoDoFormando(daSessao(t)),

    'GET /turma': (t) => {
      const a = daSessao(t);
      const turma = acharTurma(a.turmaId);
      const minhas = presencas.get(a.adesaoId) || {};
      return {
        codigo: turma.codigo, rotulo: turma.rotulo, curso: turma.curso, cursos: turma.cursos,
        dataEvento: turma.dataEvento, cidade: turma.cidade, espaco: turma.espaco,
        pacote: turma.pacote, formandos: turma.formandos, consultora: turma.consultora,
        comissao: turma.comissao || [],
        fotos: turma.fotos,
        cronograma: turma.cronograma.map((e) => ({ ...e, chave: chaveEtapa(e), presenca: minhas[chaveEtapa(e)] || null })),
        avisos: turma.avisos,
      };
    },

    // confirmação de presença numa etapa do cronograma
    'POST /turma/presenca': (t, corpo) => {
      const a = daSessao(t);
      const turma = acharTurma(a.turmaId);
      const etapa = turma.cronograma.find((e) => chaveEtapa(e) === corpo.chave);
      if (!etapa) throw erro(404, { erro: 'etapa_nao_encontrada' });
      if (!['sim', 'nao'].includes(corpo.resposta)) throw erro(400, { erro: 'resposta_invalida' });
      const minhas = presencas.get(a.adesaoId) || {};
      minhas[corpo.chave] = corpo.resposta;
      presencas.set(a.adesaoId, minhas);
      const s = novaSolicitacao(a, 'presenca', {
        mensagem: `${etapa.etapa} (${etapa.data}): ${corpo.resposta === 'sim' ? 'vou' : 'não vou'}.`,
      });
      return { chave: corpo.chave, presenca: corpo.resposta, protocolo: s.protocolo };
    },

    'GET /notificacoes': (t) => notificacoes(daSessao(t)),

    'POST /notificacoes/lidas': (t, corpo) => {
      const a = daSessao(t);
      const vistas = lidas.get(a.adesaoId) || new Set();
      for (const id of Array.isArray(corpo.ids) ? corpo.ids : []) vistas.add(String(id));
      lidas.set(a.adesaoId, vistas);
      return { naoLidas: notificacoes(a).naoLidas };
    },

    'GET /informe-ir': (t) => informeAnual(daSessao(t)),
  };

  // Rotas com id no caminho.
  async function rotaComId(metodo, caminho, token, corpo) {
    const m1 = caminho.match(/^\/financeiro\/([\w-]+)$/);
    if (metodo === 'GET' && m1) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === m1[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });   // boleto de outra pessoa: 404, nunca 403
      const status = situacaoBoleto(b);
      const escondido = status === 'agendado' || status === 'nao_gerado';
      return {
        ...(await projetarComValor(b, a.adesaoId, a)),
        contestacao: contestacaoAberta(a.adesaoId, b.id),
        linhaDigitavel: escondido ? null : b.linhaDigitavel,
        pdfUrl: escondido ? null : b.pdfUrl,
        urlPagamento: escondido ? null : b.urlPagamento,
        comprovantes: comprovantesDoBoleto(a.adesaoId, b.id),
        historico: historicoDoBoleto(a.adesaoId, b),
      };
    }

    // recibo da parcela paga (a página monta a prévia na tela)
    const mr = caminho.match(/^\/financeiro\/([\w-]+)\/recibo$/);
    if (metodo === 'GET' && mr) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === mr[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });
      if (situacaoBoleto(b) !== 'pago') throw erro(409, { erro: 'parcela_nao_paga' });
      return reciboDaParcela(a, acharTurma(a.turmaId), b);
    }

    // informe de pagamentos de um ano
    const mi = caminho.match(/^\/informe-ir\/(\d{4})$/);
    if (metodo === 'GET' && mi) {
      const a = daSessao(token);
      const info = informeAnual(a);
      const doAno = info.anos.find((x) => x.ano === mi[1]);
      if (!doAno) throw erro(404, { erro: 'sem_pagamentos_no_ano' });
      const turma = acharTurma(a.turmaId);
      return {
        ...doAno,
        itens: a.boletos
          .map((b) => ({ ...b, status: situacaoBoleto(b) }))
          .filter((b) => b.status === 'pago' && (b.pagoEm || b.vencimento).startsWith(mi[1]))
          .sort((x, y) => (x.pagoEm || x.vencimento).localeCompare(y.pagoEm || y.vencimento))
          .map((b) => ({ parcela: b.parcela, vencimento: b.vencimento, pagoEm: b.pagoEm, valorPago: b.valorPago || b.valor })),
        prestador: info.prestador,
        formando: a.nome.replace(/\s*\(TESTE\)\s*/i, ''),
        cpf: a.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
        turma: turma.rotulo,
      };
    }

    // prévia da 2ª via: a mesma conta do boleto, sem gerar nada
    const ms = caminho.match(/^\/financeiro\/([\w-]+)\/segunda-via\/simular$/);
    if (metodo === 'POST' && ms) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === ms[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });
      const problema = validarSegundaVia(b, corpo.novoVencimento);
      if (problema) throw problema;
      return calcularEncargos(b, new Date(`${corpo.novoVencimento}T12:00:00`));
    }

    // 2ª via de parcela vencida, com encargos
    const mv = caminho.match(/^\/financeiro\/([\w-]+)\/segunda-via$/);
    if (metodo === 'POST' && mv) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === mv[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });
      // Mesma trava do CRM: sem endereço a operadora cria a cobrança e não
      // mostra o boleto — e a antiga já foi cancelada no caminho. A tela
      // reconhece o código e pede o endereço na hora.
      const end = enderecoDoPerfil(a.adesaoId);
      if (!end.completo) {
        throw erro(409, {
          erro: 'endereco_incompleto',
          codigo: 'endereco_incompleto',
          falta: end.falta,
          message: `Para emitir o boleto, falta o seu endereço (${end.falta.join(', ')}). É rápido: informe e tente de novo.`,
        });
      }
      const problema = validarSegundaVia(b, corpo.novoVencimento);
      if (problema) throw problema;
      const novaData = new Date(`${corpo.novoVencimento}T12:00:00`);

      b.vencimentoOriginal = b.vencimentoOriginal || b.vencimento;
      const encargos = calcularEncargos(b, novaData);
      b.vencimento = corpo.novoVencimento;
      b.linhaDigitavel = linhaFalsa(`${b.id}-${corpo.novoVencimento}`);
      b.valorAtualizado = encargos.total;
      b.encargos = encargos;
      registrarHistorico(b.id, '2ª via gerada', `Novo vencimento ${corpo.novoVencimento.split('-').reverse().join('/')} · total ${encargos.total}`);
      return {
        ...projetarBoleto(b),
        linhaDigitavel: b.linhaDigitavel,
        pdfUrl: b.pdfUrl,
        urlPagamento: b.urlPagamento,
        encargos,
        comprovantes: comprovantesDoBoleto(a.adesaoId, b.id),
      };
    }

    // antecipação: /simular devolve a composição; sem sufixo, gera o boleto único
    const ma = caminho.match(/^\/financeiro\/antecipar(\/simular)?$/);
    if (metodo === 'POST' && ma) {
      const a = daSessao(token);
      const u = await montarUnico(a, corpo.billIds);
      if (ma[1]) {
        const taxa = taxaDoContrato(a);
        return { ...u, taxaBoleto: taxa, totalBoleto: arredonda(u.valor + taxa), economiaTaxa: arredonda(taxa * (u.unico.parcelas.length - 1)) };
      }
      sequencialUnico += 1;
      a.boletos.push(u);
      unicosPorId.set(u.id, u);
      for (const item of u.unico.parcelas) {
        const b = a.boletos.find((x) => x.id === item.id);
        b.noUnico = u.id;
        registrarHistorico(b.id, 'Incluída num boleto único', `Vence em ${u.vencimento.split('-').reverse().join('/')} · a parcela continua com o boleto dela`);
      }
      registrarHistorico(u.id, 'Boleto único gerado', `${u.unico.parcelas.length} parcela(s) · total ${u.valor}`);
      return { ...(await projetarComValor(u, a.adesaoId, a)), linhaDigitavel: u.linhaDigitavel };
    }

    // o arquivo do comprovante, para abrir na tela
    const mc = caminho.match(/^\/comprovantes\/([\w-]+)$/);
    if (metodo === 'GET' && mc) {
      const a = daSessao(token);
      const c = comprovantes.find((x) => x.id === mc[1] && x.adesaoId === a.adesaoId);
      if (!c) throw erro(404, { erro: 'nao_encontrado' });
      return { id: c.id, arquivo: c.arquivo, tipo: c.tipo, conteudo: c.conteudo };
    }

    // Os dados que o PDF mostraria. A página monta a prévia na tela.
    const m3 = caminho.match(/^\/financeiro\/([\w-]+)\/pdf$/);
    if (metodo === 'GET' && m3) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === m3[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });
      const turma = acharTurma(a.turmaId);
      return {
        demo: true,
        formando: a.nome,
        cpf: a.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
        turma: turma.rotulo,
        evento: turma.eventoCrm,
        parcela: b.parcela,
        unico: Boolean(b.unico),
        totalParcelas: a.contrato.parcelas,
        descricao: b.descricao,
        vencimento: b.vencimento,
        valor: b.valorAtualizado || b.valor,
        status: situacaoBoleto(b),
        pagoEm: b.pagoEm,
        linhaDigitavel: ['agendado', 'nao_gerado'].includes(situacaoBoleto(b)) ? null : b.linhaDigitavel,
      };
    }

    // Comprovante de pagamento. A parcela não muda de situação: quem dá baixa
    // é a equipe, depois de conferir.
    const m4 = caminho.match(/^\/financeiro\/([\w-]+)\/comprovante$/);
    if (metodo === 'POST' && m4) {
      const a = daSessao(token);
      const b = a.boletos.find((x) => x.id === m4[1]);
      if (!b) throw erro(404, { erro: 'nao_encontrado' });
      const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!corpo.arquivo || !TIPOS_OK.includes(corpo.tipo)) throw erro(400, { erro: 'tipo_nao_aceito' });
      if (Number(corpo.tamanho) > 8 * 1024 * 1024) throw erro(400, { erro: 'arquivo_grande' });

      const registro = {
        id: `comp-${comprovantes.length + 1}`,
        adesaoId: a.adesaoId,
        billId: b.id,
        arquivo: String(corpo.arquivo).slice(0, 120),
        tipo: corpo.tipo,
        tamanho: Number(corpo.tamanho) || 0,
        observacao: String(corpo.observacao || '').slice(0, 500),
        status: 'em_analise',
        enviadoEm: new Date().toISOString(),
        conteudo: typeof corpo.conteudo === 'string' ? corpo.conteudo : null,
      };
      comprovantes.push(registro);
      const pedidoComp = novaSolicitacao(a, 'comprovante', {
        mensagem: `${nomeCobranca(b)} · ${registro.arquivo}`,
        billId: b.id,
      });
      registro.protocolo = pedidoComp.protocolo;
      const { conteudo, adesaoId, ...semArquivo } = registro;
      return semArquivo;
    }

    return undefined;
  }

  function linhaFalsa(semente) {
    let h = 0;
    for (const c of String(semente)) h = (h * 31 + c.charCodeAt(0)) % 1e9;
    const d = String(h).repeat(8);
    return `34191.${d.slice(0, 5)} ${d.slice(5, 10)}.${d.slice(10, 16)} ${d.slice(16, 21)}.${d.slice(21, 27)} 9 ${d.slice(27, 37)}`;
  }

  // Ponto de entrada usado pelo app no lugar do fetch.
  // Assíncrona porque a 2ª via calcula o juro até a data escolhida. As rotas diretas
  // continuam síncronas — o await aqui atende as duas formas.
  window.API_DEMO = async function (metodo, caminho, corpo, token) {
    const direta = ROTAS[`${metodo} ${caminho}`];
    const resposta = direta
      ? direta(token, corpo || {})
      : await rotaComId(metodo, caminho, token, corpo || {});
    if (resposta === undefined) throw erro(404, { erro: 'rota_nao_encontrada' });
    return resposta;
  };
})();
