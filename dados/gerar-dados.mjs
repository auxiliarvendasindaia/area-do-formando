// Gera os dados de exemplo da Área do Formando a partir do painel de formaturas.
//
// Origem: ../../painel-formaturas-gestao-16-09-2026.html (turma 7506, E08058).
// O que é preservado do real: estrutura da turma, valores, parcelas, vencimentos,
// datas de pagamento e a situação de cada boleto (paid / pending / scheduled).
// O que é substituído por ficção: nome, CPF, e-mail e telefone de cada formando,
// linha digitável, URLs de boleto, convites, cronograma e avisos.
//
// Rodar: node dados/gerar-dados.mjs

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PAINEL = path.resolve(AQUI, '..', '..', 'painel-formaturas-gestao-16-09-2026.html');
const SAIDA = path.join(AQUI, 'exemplo.json');
const HOJE = '2026-09-17';

const NOMES = [
  'Ana Beatriz Ferraz', 'Bruno Kowalski Lima', 'Carolina Stein Duarte', 'Diego Marchiori',
  'Eduarda Villas Boas', 'Felipe Andrade Rocha', 'Gabriela Mendes Pires', 'Heitor Sanches',
  'Isabela Cunha Moretti', 'João Vitor Bastos', 'Karina Zanella', 'Lucas Ferrarini',
  'Mariana Toledo Braga', 'Nicolas Prado Cardoso', 'Olívia Rezende', 'Pedro Henrique Lacerda',
  'Quezia Bittencourt', 'Rafael Nogueira Alves', 'Sofia Bergamini', 'Thiago Cordeiro Maia',
  'Valentina Rossi Leão', 'William Borges Tavares', 'Yasmin Delgado', 'Arthur Vasconcelos',
  'Beatriz Paim Colombo', 'Caio Sartori', 'Débora Fontanella', 'Enzo Ribas Peixoto',
  'Fernanda Guimarães Sá', 'Gustavo Menegotto', 'Helena Bregnini', 'Ícaro Mattos',
  'Júlia Camargo Weber', 'Kauã Pilotto', 'Larissa Bonassi',
];

function cpfValido(seed) {
  const base = String(10000000000 + seed * 137717).slice(0, 9).split('').map(Number);
  const dv = (nums) => {
    let peso = nums.length + 1;
    const soma = nums.reduce((a, n) => a + n * peso--, 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return base.join('') + d1 + d2;
}

const somaMeses = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, d)).toISOString().slice(0, 10);
};

const linhaDigitavel = (semente) => {
  const d = crypto.createHash('sha256').update(String(semente)).digest('hex').replace(/\D/g, '').padEnd(44, '7');
  return `34191.${d.slice(0, 5)} ${d.slice(5, 10)}.${d.slice(10, 16)} ${d.slice(16, 21)}.${d.slice(21, 27)} 9 ${d.slice(27, 37)}`;
};
// --- lê o painel -------------------------------------------------------------
const html = fs.readFileSync(PAINEL, 'utf8');
const linha = html.split('\n').find((l) => l.trimStart().startsWith('const D = {'));
if (!linha) throw new Error('Bloco "const D = {...}" não encontrado no painel.');
const D = JSON.parse(linha.slice(linha.indexOf('{'), linha.lastIndexOf('}') + 1));

const turmaReal = D.turmas.find((t) => String(t.cod) === '7506');
const formandosReais = D.formandos.filter((f) => String(f.turma_cod) === '7506');

// --- turma -------------------------------------------------------------------
const turma = {
  id: 'turma-7506',
  codigo: turmaReal.cod,
  orcamento: turmaReal.numero,
  rotulo: `${turmaReal.cod} · ${turmaReal.curso}`,
  curso: turmaReal.curso,
  cursos: turmaReal.cursos,
  eventoCrm: turmaReal.evento_crm,
  dataEvento: turmaReal.data_evento,
  cidade: turmaReal.cidade,
  espaco: 'Espaço Indaiá Joinville',
  consultora: turmaReal.consultora,
  pacote: 'Pacote Completo — Baile de Gala, Culto Ecumênico, Colação e Family Day',
  formandos: turmaReal.formandos,
  // Fotos do espaço escolhido, montado para formatura (aba Início, faixa que roda).
  fotos: [
    { arquivo: 'salao-montado.jpg', legenda: 'O salão montado para o jantar' },
    { arquivo: 'cerejeira-luzes.jpg', legenda: 'Cerejeira e luzes no teto' },
    { arquivo: 'mesas-flores.jpg', legenda: 'Mesas e arranjos de flores' },
    { arquivo: 'vista-salao.jpg', legenda: 'Vista do salão' },
    { arquivo: 'salao-pronto.jpg', legenda: 'Tudo pronto para a festa' },
  ],
  // Tudo o que acontece daqui até a formatura (aba Cronograma).
  // `endereco` alimenta o link do mapa; `confirmar` liga a confirmação de presença;
  // `hora` entra no convite de calendário (.ics).
  cronograma: [
    { etapa: 'Assinatura do termo de adesão', data: '2026-03-21', tipo: 'marco', local: 'On-line, por assinatura digital', observacao: 'Turma fechada com 29 formandos.', concluido: true },
    { etapa: 'Primeira reunião de comissão', data: '2026-08-15', tipo: 'reuniao', local: 'Escritório Indaiá — Joinville', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '19:00', observacao: 'Apresentação da equipe e do cronograma.', concluido: true },
    { etapa: 'Escolha da decoração', data: '2027-03-12', tipo: 'reuniao', local: 'Showroom Indaiá', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '19:00', observacao: 'Cenário, flores e iluminação do baile.' },
    { etapa: 'Family Day', data: '2027-11-13', tipo: 'evento', local: 'Espaço Indaiá Joinville', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '12:00', observacao: 'Encontro das famílias, almoço e apresentação do baile.', confirmar: true },
    { etapa: 'Escolha do traje', data: '2028-06-20', tipo: 'marco', local: 'Showroom parceiro — Joinville', endereco: 'R. das Palmeiras, 40 — Joinville, SC', observacao: 'Agendamento individual pela comissão.', confirmar: true },
    { etapa: 'Ensaio fotográfico da turma', data: '2028-09-09', tipo: 'evento', local: 'Estúdio Indaiá', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '14:00', observacao: 'Book coletivo incluso no pacote.', confirmar: true },
    { etapa: 'Reunião final de alinhamento', data: '2029-02-10', tipo: 'reuniao', local: 'Espaço Indaiá Joinville', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '19:00', observacao: 'Roteiro do baile minuto a minuto.' },
    { etapa: 'Última parcela antes do baile', data: '2029-02-10', tipo: 'prazo', local: null, observacao: 'A turma precisa estar em dia para a entrega das mesas.' },
    { etapa: 'Culto ecumênico', data: '2029-03-15', tipo: 'evento', local: 'A definir com a comissão', observacao: null, confirmar: true },
    { etapa: 'Colação de grau', data: '2029-03-16', tipo: 'evento', local: 'Centreventos Cau Hansen', endereco: 'Av. José Vieira, 315 — Joinville, SC', hora: '19:00', observacao: 'Organização da instituição de ensino.' },
    { etapa: 'Baile de gala', data: '2029-03-17', tipo: 'baile', local: 'Espaço Indaiá Joinville', endereco: 'R. Blumenau, 178 — Joinville, SC', hora: '21:00', observacao: 'Recepção às 21h, jantar às 22h.' },
  ],
  // Quem responde pela turma no dia a dia (aba Minha turma).
  comissao: [
    { nome: 'Ana Beatriz Duarte', papel: 'Presidente da comissão', curso: 'Biomedicina' },
    { nome: 'Rafael Prado Lima', papel: 'Tesoureiro', curso: 'Nutrição' },
    { nome: 'Juliana Steil', papel: 'Comunicação', curso: 'Fisioterapia' },
  ],
  avisos: [
    { id: 'av-1', titulo: 'Fotos da reunião de comissão', texto: 'As fotos da reunião de 15/08 estão no álbum enviado no grupo da turma.', publicadoEm: '2026-08-18' },
  ],
};

// --- formandos ---------------------------------------------------------------
const STATUS_VINDI = { paid: 'pago', pending: 'em_aberto', scheduled: 'agendado' };

const adesoes = formandosReais.map((f, i) => {
  const seed = i + 1;
  const nome = NOMES[i % NOMES.length];
  const primeiro = nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bills = (f.bills || []).slice().sort((a, b) => a.venc.localeCompare(b.venc));

  const boletos = bills.map((b, j) => {
    let status = STATUS_VINDI[b.status] || 'em_aberto';
    if (status === 'em_aberto' && b.venc < HOJE) status = 'em_atraso';
    const emitido = status === 'em_aberto' || status === 'em_atraso';
    return {
      id: `bill-${seed}-${j + 1}`,
      vindiBillId: 8000000 + seed * 100 + j,
      parcela: j + 1,
      descricao: b.item,
      vencimento: b.venc,
      valor: b.valor,
      status,
      pagoEm: b.pago_em || null,
      valorPago: b.status === 'paid' ? b.valor : null,
      linhaDigitavel: emitido ? linhaDigitavel(seed * 50 + j) : null,
      pdfUrl: emitido ? `/exemplo/boleto/bill-${seed}-${j + 1}.pdf` : null,
      urlPagamento: emitido ? `https://exemplo.vindi.com.br/boleto/bill-${seed}-${j + 1}` : null,
      billingAt: b.billing_at || null,
    };
  });

  // Parcelas contratadas que ainda não viraram boleto na Vindi (o corte de dez/2026).
  const ultima = boletos.length ? boletos[boletos.length - 1].vencimento : f.primeira_parcela;
  const faltam = Math.max(0, (f.contrato_parcelas || boletos.length) - boletos.length);
  for (let k = 1; k <= faltam; k++) {
    boletos.push({
      id: `parc-${seed}-${boletos.length + 1}`,
      vindiBillId: null,
      parcela: boletos.length + 1,
      descricao: `${turma.eventoCrm} - PARC FORMATURA`,
      vencimento: somaMeses(ultima, k),
      valor: f.mensalidade,
      status: 'nao_gerado',
      pagoEm: null, valorPago: null, linhaDigitavel: null,
      pdfUrl: null, urlPagamento: null, billingAt: null,
    });
  }

  return {
    adesaoId: `ades-7506-${String(seed).padStart(2, '0')}`,
    turmaId: turma.id,
    nome,
    cpf: cpfValido(seed),
    email: `${primeiro}.exemplo${seed}@teste.local`,
    telefone: `5547999${String(100000 + seed * 31).slice(0, 6)}`,
    curso: f.curso,
    situacao: 'assinada',
    canceladaEm: null,
    contrato: {
      total: f.contrato_total,
      parcelas: f.contrato_parcelas,
      mensalidade: f.mensalidade,
      primeiraParcela: f.primeira_parcela,
      assinadoEm: '2026-03-21',
      // taxa administrativa de gestão de conta, somada em cada boleto. Vem do
      // contrato da turma (plano): a 7506 fechou em R$ 2,90. A taxa bancária do
      // boleto é custo da empresa e não é repassada (decisão de 22/09/2026).
      taxaBoleto: 2.9,
      docusealSubmissionId: seed % 4 === 0 ? null : 900000 + seed,
      termoUrl: `/exemplo/termo/ades-7506-${String(seed).padStart(2, '0')}.pdf`,
      contratoColetivoUrl: '/exemplo/contrato-coletivo-7506.pdf',
    },
    reajuste: {
      indice: 'IPCA + 2%',
      proximoCiclo: '2027-04-10',
      valorAtual: f.mensalidade,
      valorEstimado: Math.round(f.mensalidade * 1.0642 * 100) / 100,
      aplicado: false,
    },
    // `nomeados`: quantos acompanhantes já têm nome na lista (prazo no cronograma).
    convites: [
      { tipo: 'Convite de baile', quantidade: 4 + (seed % 3), valorUnitario: 320, incluso: 4, nomeados: seed % 4 },
      { tipo: 'Convite de festa 50%', quantidade: 2, valorUnitario: 160, incluso: 2, nomeados: seed % 3 },
      { tipo: 'Family Day', quantidade: 3 + (seed % 2), valorUnitario: 0, incluso: 4, nomeados: 0 },
      { tipo: 'Encerramento', quantidade: 2, valorUnitario: 180, incluso: 2, nomeados: 0 },
    ],
    vindiCustomerId: 3100000 + seed,
    boletos,
  };
});

// Caso de teste: adesão cancelada (tela própria, sem financeiro).
adesoes.push({
  ...adesoes[0],
  adesaoId: 'ades-7506-99',
  nome: 'Marina Schutz Ribeiro',
  cpf: cpfValido(99),
  email: 'marina.exemplo99@teste.local',
  telefone: '5547999888777',
  situacao: 'cancelada',
  canceladaEm: '2026-07-04',
  boletos: [],
});

// Cadastro fixo do usuário, para entrar sempre com o mesmo CPF e e-mail.
// Só o CPF e o e-mail são reais; o resto é inventado. A carteira de boletos foi montada
// à mão para ter um caso de cada situação na mesma tela.
const TESTE = {
  cpf: '12522539906',
  email: 'auxiliar.vendas.indaia@gmail.com',
  mensalidade: 193.75,
  parcelas: 32,
  primeira: '2026-04-10',
};

const boletosTeste = [
  // pagas
  ...['2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15'].map((venc, i) => ({
    venc, status: 'pago', pagoEm: venc,
  })),
  { venc: '2026-09-15', status: 'em_atraso', pagoEm: null },   // vencida e não paga
  { venc: '2026-09-30', status: 'em_aberto', pagoEm: null },   // emitida, ainda no prazo
  { venc: '2026-10-15', status: 'agendado', pagoEm: null },    // dá para "pagar agora"
  { venc: '2026-11-15', status: 'agendado', pagoEm: null },
  { venc: '2026-12-15', status: 'agendado', pagoEm: null },
].map((b, j) => {
  const emitido = b.status === 'em_aberto' || b.status === 'em_atraso';
  return {
    id: `bill-teste-${j + 1}`,
    vindiBillId: 8900000 + j,
    parcela: j + 1,
    descricao: `${turma.eventoCrm} - PARC FORMATURA`,
    vencimento: b.venc,
    valor: TESTE.mensalidade,
    status: b.status,
    pagoEm: b.pagoEm,
    valorPago: b.status === 'pago' ? TESTE.mensalidade : null,
    linhaDigitavel: emitido ? linhaDigitavel(`teste-${j}`) : null,
    pdfUrl: emitido ? `/exemplo/boleto/bill-teste-${j + 1}.pdf` : null,
    urlPagamento: emitido ? `https://exemplo.vindi.com.br/boleto/bill-teste-${j + 1}` : null,
    billingAt: null,
  };
});

// As parcelas contratadas que ainda nem viraram boleto (o corte de dez/2026).
const faltamNoTeste = TESTE.parcelas - boletosTeste.length;
for (let k = 1; k <= faltamNoTeste; k++) {
  boletosTeste.push({
    id: `parc-teste-${boletosTeste.length + 1}`,
    vindiBillId: null,
    parcela: boletosTeste.length + 1,
    descricao: `${turma.eventoCrm} - PARC FORMATURA`,
    vencimento: somaMeses('2026-12-15', k),
    valor: TESTE.mensalidade,
    status: 'nao_gerado',
    pagoEm: null, valorPago: null, linhaDigitavel: null,
    pdfUrl: null, urlPagamento: null, billingAt: null,
  });
}

adesoes.push({
  adesaoId: 'ades-7506-teste',
  turmaId: turma.id,
  nome: 'Renata Alves Monteiro (TESTE)',
  cpf: TESTE.cpf,
  email: TESTE.email,
  telefone: '5547999000000',
  curso: 'BIOMEDICINA E NUTRIÇÃO',
  situacao: 'assinada',
  canceladaEm: null,
  contrato: {
    total: Math.round(TESTE.mensalidade * TESTE.parcelas * 100) / 100,
    parcelas: TESTE.parcelas,
    mensalidade: TESTE.mensalidade,
    primeiraParcela: TESTE.primeira,
    assinadoEm: '2026-03-21',
    taxaBoleto: 2.9,
    docusealSubmissionId: 999999,
    termoUrl: '/exemplo/termo/ades-7506-teste.pdf',
    contratoColetivoUrl: '/exemplo/contrato-coletivo-7506.pdf',
  },
  reajuste: {
    indice: 'IPCA + 2%',
    proximoCiclo: '2027-04-10',
    valorAtual: TESTE.mensalidade,
    valorEstimado: Math.round(TESTE.mensalidade * 1.0642 * 100) / 100,
    aplicado: false,
  },
  convites: [
    { tipo: 'Convite de baile', quantidade: 6, valorUnitario: 320, incluso: 4, nomeados: 2 },
    { tipo: 'Convite de festa 50%', quantidade: 2, valorUnitario: 160, incluso: 2, nomeados: 0 },
    { tipo: 'Family Day', quantidade: 4, valorUnitario: 0, incluso: 4, nomeados: 4 },
    { tipo: 'Encerramento', quantidade: 3, valorUnitario: 180, incluso: 2, nomeados: 0 },
  ],
  vindiCustomerId: 3199999,
  boletos: boletosTeste,
});

// Caso de teste: mesmo CPF em duas turmas (o login precisa perguntar qual).
const outraTurmaReal = D.turmas.find((t) => String(t.cod) !== '7506' && t.formandos > 5);
const turma2 = {
  id: `turma-${outraTurmaReal.cod}`,
  codigo: outraTurmaReal.cod,
  orcamento: outraTurmaReal.numero,
  rotulo: `${outraTurmaReal.cod} · ${outraTurmaReal.curso}`,
  curso: outraTurmaReal.curso,
  cursos: outraTurmaReal.cursos,
  eventoCrm: outraTurmaReal.evento_crm,
  dataEvento: outraTurmaReal.data_evento,
  cidade: outraTurmaReal.cidade,
  espaco: 'Espaço Indaiá',
  consultora: outraTurmaReal.consultora,
  pacote: 'Pacote Baile + Colação',
  formandos: outraTurmaReal.formandos,
  fotos: turma.fotos.slice(0, 4),
  cronograma: turma.cronograma.slice(2).map((e) => ({ ...e, data: somaMeses(e.data, -6) })),
  comissao: turma.comissao.slice(0, 2),
  avisos: [{ id: 'av2-1', titulo: 'Reunião de comissão', texto: 'Próxima reunião no dia 05/10, às 19h, no escritório de Joinville.', publicadoEm: '2026-09-10' }],
};

const gemea = {
  ...adesoes[1],
  adesaoId: 'ades-dupla-02',
  turmaId: turma2.id,
  curso: turma2.cursos[0],
  // a outra turma fechou a taxa em outro valor: ela vem do contrato, não do código
  contrato: { ...adesoes[1].contrato, total: 4800, parcelas: 24, mensalidade: 200, taxaBoleto: 5.9 },
  boletos: adesoes[1].boletos.slice(0, 6).map((b, j) => ({ ...b, id: `bill-dupla-${j + 1}`, valor: 200 })),
};

const saida = {
  geradoEm: new Date().toISOString(),
  origem: path.basename(PAINEL),
  hojeSimulado: HOJE,
  aviso: 'Dados de exemplo. Nome, CPF, e-mail, telefone, linha digitável, convites, cronograma e avisos são fictícios.',
  turmas: [turma, turma2],
  adesoes: [...adesoes, gemea],
  config: {
    whatsappAtendimento: '5547999999999',
    nomeAtendimento: 'Atendimento Grandes Formaturas',
    permitirEmitirBoletoAgendado: true,
    mostrarReajusteProgramado: true,
    bloquearLoginCancelada: false,
  },
};

fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 2), 'utf8');
console.log(`OK: ${path.relative(process.cwd(), SAIDA)}`);
console.log(`  turmas: ${saida.turmas.length} · adesões: ${saida.adesoes.length}`);
console.log(`  boletos: ${saida.adesoes.reduce((a, x) => a + x.boletos.length, 0)}`);
