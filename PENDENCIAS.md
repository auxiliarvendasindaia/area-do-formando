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

> Levantamento completo do que o CRM tinha pronto quando isto começou:
> **[INTEGRACAO.md](INTEGRACAO.md)** (22/09/2026).

**Conferido item por item em 07/10/2026, contra o código da `dev` e o banco de produção.** O que
estava listado aqui como pendente já tinha sido construído — esta seção dizia que faltava emissão
lendo o contrato, webhook do boleto único e as migrations 944 e 945, e nada disso faltava mais.

### Construído e no banco

- **API do portal** (`/api/area-formando/*`) lendo o CRM e a Vindi de verdade. Acabaram os dados de
  exemplo.
- **2ª via** — cancela o boleto vencido na Vindi e emite o novo, com parcela + juros de mora até o
  dia escolhido mais a taxa do contrato. `/simular` faz a mesma conta sem escrever, para prévia e
  boleto nunca discordarem. **Cancela antes de criar**, de propósito: na ordem inversa, uma falha
  deixaria dois boletos válidos da mesma parcela.
- **Boleto único** — junta as parcelas escolhidas (vencimento em 3 dias) sem mexer nos boletos
  delas, cobra a taxa uma vez só e prende as parcelas na cobrança.
- **Baixa na hora.** O webhook da Vindi, ao receber o único como pago, compensa as parcelas e
  cancela os boletos delas no mesmo instante; o job das 03:40 é a rede de proteção. Sem isso os
  dois ficariam pagáveis por um dia inteiro.
- **Comprovantes** — bucket privado `comprovantes-pagamento`, tabela `formatura_bill_comprovantes`,
  link assinado de 1 hora, e a vencida com anexo passa a *em análise*. Sem aprovação, de propósito:
  comprovante é prova arquivada, não etapa de fluxo — quem resolve a parcela é a baixa.
- **Pedidos do formando** — viram demanda em `formatura_solicitacoes` e aparecem em *Área do
  Formando → Solicitações* no CRM. Inclui "Pagamento em duplicidade", para o caso de a mesma
  parcela ser paga pelo boleto dela e pelo único.
- **Contestação** — um índice UNIQUE parcial garante uma contestação aberta por parcela; encerrar a
  solicitação no CRM é o que libera abrir outra.
- **Taxa administrativa do contrato** — a emissão lê o plano da turma. Os 22 planos estão com
  R$ 2,90; nenhum sem valor.
- **Parcela de valor fixo** (06/10) — sem desconto de pontualidade; o atraso cobra juros de mora de
  1% ao mês, pro rata die. A Cláusula Quarta do termo acompanha.
- **Domínio próprio** — `areaformando.eventosindaia.com.br`, com HTTPS. O repositório do site mudou
  para a organização `git-rbc` em 07/10; o endereço `auxiliarvendasindaia.github.io/area-do-formando`
  deixou de existir.
- **Modo simulação** para turma de teste (`ORC-TESTE-*`): linha digitável, 2ª via e boleto único
  nascendo no espelho local, sem tocar na Vindi. É o que permite avaliar o portal sem cobrança
  nascendo no nome de quem testa.

### O que falta de verdade

1. **Deploy em produção.** Tudo acima está na `dev`; o que roda em produção ainda é o código
   anterior. Os PRs `dev`→`master` (back #805, front #801) estão abertos, com 34 commits de seis
   pessoas, esperando o time. **É o único item que impede o resto.**
2. **Exercitar com um formando de verdade** — login, 2ª via, comprovante e pedido. Isso escreve
   cobrança na Vindi, então é a equipe que escolhe a hora e a parcela, com acompanhamento.
3. **Piloto com uma turma** antes de abrir para os 230.
4. **Ligar os freios**, quando a equipe decidir: `AREA_FORMANDO_LIBERADO` (nenhuma mensagem do CRM
   manda o formando ao portal enquanto estiver desligado) e `FORMATURA_LEMBRETE_ATIVO`. Os dois
   nascem desligados e só "true" liga. Hoje, em produção, o primeiro está `false`.
5. **Endereço de 10 formandos** que assinaram antes de o link exigir os campos separados. Eles
   resolvem sozinhos na primeira 2ª via — o portal pede e grava. Falta sincronizar o endereço da
   Rosele na Vindi (o CRM tem, a operadora não), que está sem parcela em aberto.
