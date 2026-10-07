# Área do Formando — o que falta para sair do protótipo

Levantamento de 22/09/2026. O portal hoje roda sobre `dados/exemplo.json`: toda a regra está
escrita e testada, mas nenhum dado é real. Este documento diz **o que o CRM já tem pronto**, **o que
precisa ser construído** e **as decisões que a equipe precisa fechar antes de codar**.

Caminhos deste repositório são relativos à pasta `area-do-formando/`; os demais, a `crm-backend/`.

---

## 1. Em uma frase

O portal precisa de uma API própria no CRM (`/area-formando/*`) que leia `formatura_adesoes` e
`formatura_adesao_bills`, e de quatro ações que hoje só existem no robô de cobrança ou em nenhum
lugar: **2ª via**, **boleto único**, **comprovante** e **pedido para a equipe**.

## 2. O que já existe e dá para reaproveitar

| Precisamos de | Já existe em | Observação |
| --- | --- | --- |
| Login por código (OTP) | `src/modules/area-cliente/otp.service.ts` e `area-cliente-auth.service.ts` | Envia por WhatsApp (template aprovado na Meta) e e-mail, com teto diário e tentativas. Serve como está; muda só a tabela consultada (adesão em vez de cliente). |
| Boletos do formando | tabela `formatura_adesao_bills` | Já guarda `vindi_bill_id`, `url`, `numero`, `valor` (a parcela), `vindi_valor` (o que a Vindi cobra de fato), `data_vencimento`, `status` e `vindi_sync_em`. |
| Situação real do boleto | job `src/jobs/sync-formatura-adesao-bills.job.ts` | Roda todo dia às 03:40 e confere na Vindi. O portal precisa de algo mais fresco — ver 3.3. |
| Falar com a Vindi | `src/modules/evento-financeiro/vindi-api.service.ts` | Tem `createBill`, `updateBill`, `deleteBill`, `getBill`, `getBillsByCustomerId`, `anteciparCobranca`. Nada novo precisa ser escrito para conversar com a Vindi. |
| Emitir a cobrança da adesão | `src/modules/formatura-adesoes/formatura-cobranca.service.ts` | Cria o customer e as bills em janela de 12 meses; o resto sai pelo reajuste. |
| 2ª via de boleto de formando | `src/modules/external/external-segunda-via.service.ts` + `formando-fatura.ts` | **Já funciona** pelo robô de cobrança, com registro em `cobranca_segundas_vias`. O portal chamaria o mesmo serviço. |
| IPCA e reajuste | `formatura-ipca.service.ts` e `formatura-reajuste.service.ts` | Mesma fonte (IBGE) que o protótipo usa. |
| Página de pagamento | `src/modules/pagamento-publico/` | Token por cliente, usada pela régua. Boa referência de linguagem e de "em análise". |
| Avisar o formando | `src/modules/cobranca-regua/cobranca-regua.engine.ts` | WhatsApp pelo IndaChat e e-mail pelo Resend, com controle de canal e de duplicidade. |
| Notificação no aparelho | `src/modules/area-cliente/area-cliente-webpush.service.ts` | VAPID pronto; o `sw.js` do portal já sabe receber. |
| Pedido que precisa de gente | ferramenta `transferir_para_humano` do robô (`src/modules/cobranca-atendimento/`) | Entrega na fila do gerente do Financeiro. A instrução dela é exatamente a nossa: *"registrei, vai ser analisado, te retorno por aqui"* — sem prometer prazo. |

## 3. O que falta construir, na ordem

### 3.1 API `/area-formando/*` no CRM
O contrato já está definido: é o `servidor.mjs` do protótipo, rota por rota (`/auth/otp/*`,
`/me`, `/financeiro`, `/financeiro/:id`, `/contrato`, `/extrato`, `/comprovantes`, `/solicitacoes`,
`/turma`, `/notificacoes`). Trocar a leitura de `dados/exemplo.json` por Supabase, mantendo o
isolamento por adesão (o token só enxerga a adesão escolhida). O front não muda.

### 3.2 Taxa administrativa: são três taxas diferentes, com nomes parecidos

Levantado em 22/09/2026, com consulta ao banco de produção.

| O quê | Onde fica | Unidade | Valor hoje |
| --- | --- | --- | --- |
| **Taxa de gestão de conta caixa**, por parcela | `formatura_plano.taxa_adm` (migration 591) | **reais** | R$ 2,90 em todos os planos (padronizado em 30/09/2026) |
| **Taxa administrativa do pacote** (material comercial) | `pacotes_formatura.taxa_adm` (migration 439) | **percentual** | 2,90% nos três pacotes |
| **Taxa bancária do boleto** | custo da empresa, não repassado | reais | não cobrada do formando; o boleto soma só a taxa de R$ 2,90 por fatura |

O rótulo do próprio CRM avisa da confusão: no cadastro do plano, o campo "Taxa adm. (R$)" tem a
ajuda *"Taxa de gestão de conta caixa, cobrada por parcela. No orçamento da turma 7506 é R$ 2,90.
**Não confundir com a taxa bancária do boleto**"*. O número 2,90 aparecer nos dois primeiros (uma
vez em reais, outra em porcento) é coincidência infeliz e a origem provável da mistura.

**A taxa praticada é R$ 2,90 por fatura.** A auditoria de 30/09/2026 na Vindi mostrou que o sistema
antigo já somava R$ 2,90 nas parcelas das turmas migradas. Sobre os contratos, conferido de três formas:

1. **A cláusula da taxa é recente.** O item da taxa no Termo de Adesão nasceu no commit `9d161060`,
   de **25/08/2026**, e só sai preenchido quando o plano da turma já tem valor. Antes disso nenhum
   termo falava em valor de taxa.
2. **Cruzando assinatura × plano**, só **3 adesões** assinaram depois de o plano ter taxa: uma é
   "Aline Passos teste" (sem boletos), as outras duas são da 7512 — uma sem boletos e uma com os
   boletos já refeitos com 2,90. Na 7513, as 19 adesões assinaram entre 21 e 25/08 e o plano dela
   só foi criado em **08/09**: nenhum termo da turma promete R$ 2,90.
3. **A 7512 foi acordo comercial, não cláusula.** Os boletos foram refeitos em 17/09 com R$ 2,90 a
   pedido da consultora; os termos assinados daquela turma não trazem cláusula de taxa.

Em 30/09/2026 os boletos em aberto foram padronizados em R$ 2,90 por fatura: os da 7513, da
ORC-2026-02221 e os demais que ainda estavam com outra taxa foram refeitos nos mesmos vencimentos
(mensalidade + R$ 2,90).

**Padrão de R$ 2,90 por fatura (30/09/2026).** É o praticado no mercado de formatura, e todas as
turmas foram padronizadas nesse valor. O sistema cobra o que estiver cadastrado no plano da turma;
turma nova já nasce com 2,90 e turma sem valor cobra 2,90.

**Cuidado ao cadastrar:** o campo do plano é em **reais por parcela**, e o material comercial dos
pacotes fala em **2,90%**. Os dois dizem "taxa administrativa de gestão de conta" e o número 2,90
aparece nos dois — ao preencher, é o valor em reais do contrato que vale, nunca o percentual do
pacote.

**O que muda para quem ainda vai assinar:** o termo traz na cláusula 3.4 a taxa da turma, R$ 2,90
por fatura, e o boleto cobra exatamente esse valor.

### Decisão da equipe (22/09/2026)

**O boleto soma apenas a taxa administrativa de gestão de conta prevista no contrato da turma
(`formatura_plano.taxa_adm`, R$ 2,90 na maioria). A taxa bancária do boleto é custo da empresa e não
é repassada ao formando.** A regra geral, que vale para qualquer valor: **o sistema sempre cobra o
que está no contrato**.

Com isso, contrato e cobrança passam a dizer a mesma coisa — a cláusula 3.4 do Termo de Adesão é
exatamente essa taxa.

**Já implementado no CRM em 22/09/2026** (ainda não commitado — ver o fim desta seção):

- `formatura-adesoes/formatura-taxa-adm.ts` (novo): ponto único que lê `formatura_plano.taxa_adm`,
  com `TAXA_ADM_PADRAO = 2,90` por fatura para turma sem taxa cadastrada (30/09/2026).
- `formatura-cobranca.service.ts`: o `amount` de cada bill passa a ser parcela + taxa do contrato;
  turma sem cadastro gera aviso no resultado da emissão.
- `external/formando-fatura.ts` + `external-cobranca.service.ts`: o robô confere o valor aceitando a
  taxa do contrato **e** a legada, porque as duas gerações de boleto convivem.
- `formatura-plano.service.ts`: recusa salvar o plano sem taxa em turma nova (ou que já tinha o
  valor), com mensagem explicando que 0,00 é resposta válida.
- `crm-frontend/.../plano-financeiro-section.tsx`: campo obrigatório com asterisco, aviso em
  vermelho e botão bloqueado; turma antiga sem taxa não fica travada.
- Testes: `formatura-taxa-adm.test.ts` (6) e casos novos em `formando-fatura.test.ts`.

- **Migration 911** (`911_formatura_bill_taxa_adm.sql`): `formatura_adesao_bills.taxa_adm` guarda
  quanto de taxa está dentro do amount daquele boleto. Sem isso não dá para separar parcela de taxa
  ao gerar a parcela seguinte. **Precisa ser aplicada antes do deploy** — o código já grava a coluna.
- `formatura-reajuste.service.ts`: os outros dois caminhos que criam boleto passaram a conferir o
  contrato também. No **reajuste**, o índice corrige só a parcela e a taxa entra pelo valor acordado
  hoje (antes o IPCA era aplicado sobre parcela + taxa, reajustando a taxa junto). No
  **reabastecimento da janela**, a parcela seguinte sai com a taxa do contrato sempre que a bill de
  referência souber dizer quanto dela era taxa; referência antiga, de composição desconhecida, é
  replicada como sempre foi — somar taxa por cima dobraria o que já está lá. Como todo boleto novo
  grava a composição, em um ciclo de janela a série inteira migra sozinha.

**O que fazer (decidido em 22/09/2026):**

1. **Boleto já criado fica como está.** Nada é refeito — nem os 204 agendados da 7513, nem os 283
   das turmas sem taxa cadastrada.
2. **Toda geração de boleto consulta o contrato da turma** — cada contrato pode ter acordado um
   valor diferente, então o valor nunca é herdado do boleto anterior nem de constante no código.
   Vale para os três caminhos que criam boleto: emissão da adesão, reajuste/reabastecimento e a
   2ª via do robô.
3. **O campo "Taxa adm. (R$)" passa a ser obrigatório no cadastro da turma**, aceitando **0,00**.
   Zero significa "esta turma não cobra taxa", e é diferente de vazio: sem preenchimento o sistema
   não tem como saber se cobra e quanto. Mexe em três lugares: o formulário
   (`crm-frontend/src/components/formatura/plano-financeiro-section.tsx`), o schema
   (`formatura-adesoes.schema.ts`, hoje `nullable().optional()`) e as 11 turmas que estão sem valor.
4. **Emissão com turma sem taxa cadastrada:** como o campo passa a ser obrigatório, a emissão deve
   recusar com aviso claro ("cadastre a taxa administrativa da turma") em vez de assumir um valor.
   Sem isso, a regra volta a ser um número escondido no código.
5. Nunca ler `pacotes_formatura.taxa_adm` para cobrança: é percentual e não é a taxa do boleto.
6. Se um dia a empresa decidir repassar a taxa bancária, ela precisa estar escrita no termo — hoje
   nenhum documento a menciona.

No portal, a mecânica já está pronta e é indiferente ao valor: ele mostra o que estiver em
`contrato.taxaBoleto`. A demonstração usa R$ 2,90 numa turma e R$ 5,90 na outra, para deixar visível
que o valor vem do contrato e não do código.

### 3.3 Webhook da Vindi cobrindo formatura
`src/modules/evento-financeiro/vindi-webhook.routes.ts` já recebe `bill_paid` / `bill_created`, mas
só resolve **evento** (casa o customer por `E00000`). O customer de formando usa `FMT-xxxxxxxx`
(`formatura_adesoes.codigo_cobranca`), então esses avisos são descartados hoje. Acrescentar esse
caminho dá três coisas de uma vez: baixa na hora (em vez de esperar as 03:40), fim do boleto único
quando ele é pago e detecção de **pagamento em duplicidade**.

### 3.4 Boleto único (antecipação)
Regra fechada com a equipe: gerar **uma bill nova** com as parcelas escolhidas, vencimento em
**3 dias**, **sem mexer** nos boletos das parcelas. Pago e compensado: baixar as parcelas e cancelar
as bills delas (`deleteBill`). Vencido sem pagamento: cancelar **só** o boleto único. A taxa entra
uma vez só. Precisa de uma tabela de ligação (boleto único → parcelas) — não existe nada parecido.

### 3.5 2ª via: a regra do portal é a decidida
**Decisão da equipe (22/09/2026): a 2ª via do portal vence em 5 dias e sai com o encargo do
atraso** — e desde 06/10/2026 esse encargo é só o juro de mora de 1% ao mês, pro rata die, sobre o
valor da parcela (cláusula 4.3). O desconto de pontualidade e a correção pelo IPCA saíram: a parcela
tem valor fixo, e a correção monetária do contrato é o reajuste programado dos 12 meses.

O robô de cobrança segue outra regra: adia **até 7 dias** e **não mexe no valor**
(`external-segunda-via.regras.ts`, "regra da casa"). Como `external-segunda-via.service.ts` é o
serviço que o portal vai chamar, ele precisa aceitar as duas formas — por origem do pedido, não por
"quem pediu primeiro". Sem isso, o mesmo formando recebe valores diferentes conforme peça no
WhatsApp ou no portal. A diferença, que era de cerca de R$ 50 numa parcela de R$ 193,75 com 30 dias
de atraso (quando o desconto de 20% caía), virou **R$ 1,94** com a regra de 06/10 — só o juro de
mora. Continua valendo decidir se a régua passa a cobrar o juro, mas a incoerência deixou de ser
visível para o formando.

### 3.6 Comprovantes — e o que é "em análise" (decidido em 24/09/2026)

**Quem decide o "em análise" é o comprovante, não o calendário.** Parcela vencida com comprovante
anexado fica **em análise**; sem comprovante, **em atraso**. Vale dos dois lados:

| | Formando (portal) | Equipe (CRM) |
| --- | --- | --- |
| Vencida **com** comprovante | Em análise | **Em análise**, dizendo que há comprovante anexado, com o arquivo à mão para conferir |
| Vencida **sem** comprovante | Em atraso | Em aberto, como hoje |

A janela de compensação de 3 dias da central de pagamentos (`pagamento-publico`) **não** vale para o
formando: lá ela existe porque não há comprovante para olhar.

Falta construir: o bucket (o CRM já usa `storage.from(...)` em vários módulos), a **visualização do
comprovante dentro do CRM** — é o que fecha a integração desta decisão —, a tela da equipe para
aceitar ou recusar e o efeito da recusa (a parcela volta a "em atraso" e o formando precisa saber
por quê).

### 3.7 Pedido do formando abre uma conversa no WhatsApp (decidido em 24/09/2026)

**O pedido não vira tarefa: vira atendimento.** Contestação, negociação de débitos, pagamento em
duplicidade e comprovante recusado **iniciam um contato no WhatsApp, na fila do Financeiro**, com a
mensagem dizendo do que se trata — no formato `Contestação: Já paguei esta parcela`. A partir daí é
atendimento humano normal: a resposta vai pelo WhatsApp, e o portal só mostra o protocolo e
"solicitação em aberto com a equipe".

O IndaChat já faz isso em uma chamada: `indaChatService.sendText(telefone, conexão, texto, { teamId,
folderId })` manda a mensagem e entrega na fila. A fila fica em `indachat_config`, por fluxo, como a
régua de cobrança já usa — não é id no código.

**O ponto a resolver na implementação:** o WhatsApp só aceita texto livre dentro da janela de 24h
desde a última mensagem do cliente. Fora dela, exige template aprovado pela Meta. Duas saídas:

1. **O portal abre o WhatsApp do próprio formando com a mensagem pronta** (link `wa.me` com o texto),
   ele confirma o envio e a conversa entra na fila pelo caminho normal. Sem template, sem janela, e a
   mensagem é genuinamente dele. Custa um toque a mais e depende de ele enviar.
2. **O CRM manda sozinho**, com `sendText` dentro da janela e um template aprovado fora dela. É
   automático, mas exige criar e homologar o template na Meta.

A opção 1 resolve hoje; a 2 pode vir depois, se a equipe quiser o disparo automático.

### 3.8 Aviso de vencimento por e-mail
Decisão da equipe: **só e-mail**, para não atropelar a régua, que já fala por WhatsApp. O portal já
guarda a preferência (1, 3, 5 ou 7 dias antes). Falta a rotina diária que lê as parcelas a vencer e
manda pelo Resend, com link para a parcela.

### 3.9 Notificação no aparelho
Chaves VAPID, guardar a assinatura do aparelho e o envio — reusando o serviço da Área do Cliente.
É o último da fila: só faz sentido depois que 3.7 e 3.8 estiverem de pé.

## 4. Decisões

**Já decididas (22/09/2026):**

- **2ª via:** 5 dias, com os encargos do atraso (item 3.5). Falta o robô de cobrança aceitar essa
  regra ao lado da dele.
- **Taxa:** o boleto cobra só a taxa administrativa do contrato da turma; a bancária não é
  repassada. Vale a regra geral — **o sistema sempre cobra o que está no contrato** (item 3.2).
- **"Em análise" é o comprovante:** vencida com comprovante fica em análise no portal e no CRM, que
  mostra o arquivo; sem comprovante segue em atraso (item 3.6).
- **Pedido abre conversa no WhatsApp**, na fila do Financeiro, com a mensagem do tipo
  "Contestação: Já paguei esta parcela". A resposta vai pelo WhatsApp; o portal mostra o protocolo
  (item 3.7).

**Ainda em aberto:**

1. **Taxa das turmas:** resolvido em 30/09/2026 — todas as turmas estão com R$ 2,90 por fatura, e
   turma nova já nasce com esse padrão (item 3.2).
2. **Numeração das cláusulas:** o termo que o portal cita e o termo que o CRM gera são o mesmo
   documento? Disso depende poder citar a cláusula 3.4 ao lado da taxa na tela (item 3.2).

## 5. Antes de escrever a primeira linha

- Conta Vindi: a emissão usa a **WINDI COBRANCAS** (`vindiApiService.getWindiCompany()`); confirmar
  que o mesmo par de chaves vale para cancelar bill e emitir a 2ª via.
- Ambiente: um formando de teste com adesão, plano e bills reais em homologação.
- O portal fica **fora do CRM** (página estática, como hoje), consumindo a API — a decisão de não
  criar rota pública dentro do CRM sem combinar antes continua valendo.
