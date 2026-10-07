# Área do Formando — pendências

O que ficou para depois, com o motivo. Atualizado em 25/09/2026.

## Para estudar

- **Aviso de vencimento por e-mail.** A tela de escolher o prazo (1, 3, 5 ou 7 dias antes) já existe e
  guarda a preferência, mas nada é enviado. O envio é trabalho no CRM: uma rotina diária que lê as
  parcelas a vencer e manda o e-mail pelo Resend, com link para a parcela. Decisão da equipe: só
  e-mail, para não atropelar a régua de cobrança, que já fala por WhatsApp.
- **Notificação no aparelho (push).** O site já é instalável (manifesto, service worker e o passo a
  passo em "Instalar no celular"), e o service worker já sabe receber a notificação. Falta o lado do
  servidor: chaves VAPID, guardar a assinatura do aparelho e o envio. A Área do Cliente já tem isso
  pronto em `crm-backend/src/modules/area-cliente/area-cliente-webpush.service.ts` — dá para reusar.

- **Cartão de crédito e crédito recorrente.** A equipe vai avaliar trabalhar com cartão e deixar o
  cartão cadastrado para cobrança recorrente. Hoje o portal só trabalha com boleto (Pix está fora).
- **Autonomia na negociação de débitos.** Hoje, com mais de duas parcelas vencidas, o formando só
  abre um pedido para a equipe entrar em contato. A ideia é ele conseguir negociar sozinho no
  sistema (cláusula 17.3: taxa fixa de R$ 75,00 por reprogramação).

## Decisões em aberto

- **Reajuste anual (IPCA + 2%).** A partir de abril de 2027 a parcela muda de valor e a tela não
  explica. Desde 06/10/2026 o IPCA não aparece em tela nenhuma — ele é só o reajuste programado, que
  chega dentro do valor da parcela. Ver se a tela precisa avisar quando isso acontecer.
- **Convites nomeados** na aba Contrato ("2 de 6 com nome na lista"): sem o prazo de nomes, pode
  ter perdido o sentido.

## Ideias guardadas (não recusadas)

- Simulação de cancelamento pela cláusula 6.2 (10 / 15 / 20 / 25 % conforme a antecedência).
- "Quem paga minha parcela" (outra pessoa pagando pelo formando).
- Acesso próprio do responsável financeiro (pai, mãe).
- Funcionalidades vistas em outros portais: votação da turma, prestação de contas, venda de
  convites e ingressos extras, cashback / indicação.

## Para sair do protótipo (fase 3 do plano)

> Levantamento completo do que o CRM já tem pronto, o que falta construir e as decisões que travam
> o começo: **[INTEGRACAO.md](INTEGRACAO.md)** (22/09/2026).

- Ler Vindi e CRM de verdade no lugar de `dados/exemplo.json`.
- **2ª via — pronta (25/09).** `POST /api/area-formando/financeiro/:billId/segunda-via` cancela o
  boleto vencido na Vindi e emite o novo, com o valor da cláusula 4.3 (parcela + juros de mora até o
  dia escolhido) mais a taxa do contrato; `/simular` faz a mesma conta sem escrever nada, para prévia e
  boleto nunca discordarem. Vencimento em até 5 dias, nunca no passado.
  **Cancela antes de criar**, de propósito: na ordem inversa, uma falha deixaria dois boletos válidos
  da mesma parcela e alguém pagaria os dois.
  Falta exercitar com um formando de verdade — isso escreve cobrança em PRODUÇÃO, então é a equipe
  que escolhe a hora e a parcela.
- Boleto único na Vindi: gerar a cobrança com as parcelas escolhidas (vencimento em 3 dias) sem
  mexer nos boletos das parcelas. Compensado o pagamento, baixar as parcelas e cancelar os boletos
  delas; vencido sem pagamento, cancelar só o boleto único.
- Ligar o aviso de pagamento da Vindi às funções `compensarUnico` e `compensarParcela` do
  `servidor.mjs`. Se a mesma parcela for paga duas vezes (pelo boleto dela e pelo boleto único),
  elas já abrem sozinhas um chamado "Pagamento em duplicidade" para a equipe resolver — falta esse
  chamado virar tarefa no CRM.
- **Comprovantes — metade pronta (25/09).** O lado do formando está construído: `POST
  /api/area-formando/financeiro/:billId/comprovante` sobe o arquivo no bucket privado
  `comprovantes-pagamento` (o mesmo das faturas de evento), `GET /comprovantes` lista com link
  assinado de 1 hora, e a parcela vencida com anexo esperando conferência passa a **em análise**.
  A tela da equipe também está pronta: **Área do Formando → Comprovantes** no CRM, com busca por
  nome ou CPF e o arquivo abrindo por link assinado de 1 hora.
  **Não há aprovação** (decisão de 25/09): o colaborador só consulta. A tela existe para quando o
  formando liga dizendo "já paguei esse boleto" — quem atende abre o comprovante em vez de pedir de
  novo, e só pede quando não houver nenhum. Comprovante é prova arquivada, não etapa de fluxo: quem
  resolve a parcela continua sendo a **baixa**, da Vindi ou do financeiro.
  Falta só **aplicar a migration 944** — o banco é produção, então é decisão da equipe. Sem ela nada
  quebra: a leitura degrada para "nenhum comprovante", a lista aparece vazia e só o envio falha.
- **Pedidos do formando — pronto (25/09).** O que ele pede no portal (contestação, negociação,
  antecipação, convite extra, quitação, duplicidade) vira **demanda** em `formatura_solicitacoes`
  (migration 945) e aparece em **Área do Formando → Solicitações** no CRM: fila do dia, protocolo,
  busca por nome/CPF/protocolo, assumir, concluir e recusar (recusa exige motivo, que o formando lê
  no portal). Mesmo molde e mesmos nomes de status da fila do app do casal (`area_cliente_solicitacoes`,
  mig 478), para a equipe não aprender dois vocabulários.
  A fila **não cobra, não dá baixa e não renegocia**: o operador resolve pelo fluxo normal do CRM e
  volta para encerrar. Falta aplicar a **migration 945** (banco é produção).
- **Taxa administrativa: a cobrança precisa ler o contrato.** Decisão de 22/09: o boleto soma só a
  taxa administrativa de gestão de conta do contrato da turma (R$ 2,90 na 7506); a taxa bancária é
  custo da empresa. No portal já funciona assim. No CRM falta: emissão lendo o plano (nos três
  caminhos que criam boleto), campo da taxa **obrigatório** no cadastro da turma aceitando 0,00, e
  preencher as 11 turmas sem valor. Boleto já criado não é refeito. Detalhes em
  [INTEGRACAO.md](INTEGRACAO.md), item 3.2.
- **Domínio do portal.** O site vai deixar de ser `auxiliarvendasindaia.github.io/area-do-formando`
  e passar a `areaformando.eventosindaia.com.br`. A ordem importa: primeiro o registro **CNAME**
  `areaformando` → `auxiliarvendasindaia.github.io` no DNS, e **só depois** o arquivo `CNAME` no
  repositório `site-github`. Invertendo, o GitHub Pages para de servir no endereço antigo antes de
  o novo resolver, e o portal fica fora do ar no intervalo. Por isso o arquivo ainda não foi criado.

- **Contestação — o bloqueio agora é do banco.** Um índice UNIQUE parcial (mig 945) garante uma
  contestação aberta por parcela; **encerrar a solicitação no CRM é o que libera abrir outra**. A
  cobrança aparece como contestada no portal; marcar isso também na tela da turma, para quem olha a
  cobrança e não a fila, ficou para depois.
