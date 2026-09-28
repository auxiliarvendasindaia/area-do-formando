# Área do Formando — ambiente local de testes

Protótipo navegável da Área do Formando de Grandes Formaturas, construído a partir do
`PLANO-Area-do-Formando.html`. Roda inteiro na sua máquina, sem tocar em banco, Vindi,
e-mail ou WhatsApp.

## Como abrir

```powershell
cd C:\Users\User\Desktop\Comercial\area-do-formando
node servidor.mjs
```

Depois abra **http://localhost:4173/** no navegador. O menu lateral aparece a partir de
900px de largura; abaixo disso ele vira gaveta. Para ver como fica no celular, use o modo
responsivo do navegador (F12 → ícone de celular).

Outra porta: `$env:PORTA = 5000; node servidor.mjs`.
Ou use `.\iniciar.ps1`, que sobe o servidor e já abre o navegador.

## Como entrar

O código de acesso **aparece na própria tela** (caixa dourada) e no terminal, porque o
modo de desenvolvimento está ligado. Em produção ele só sairia por WhatsApp e e-mail.

Se aparecer "você já pediu muitos códigos hoje", é o teto de 10 por CPF por dia funcionando:
reinicie o servidor para zerar o contador, que vive na memória do processo.

| CPF | Quem é | Para testar |
|---|---|---|
| **`125.225.399-06`** | **o seu cadastro de teste** | **carteira completa: 5 pagas, 1 em atraso, 1 em aberto, 3 a emitir, 22 programadas** |
| `100.001.377-40` | Ana Beatriz Ferraz | caso normal, com 1 parcela em atraso |
| `100.004.131-00` | Carolina Stein Duarte | tudo em dia, nada em atraso |
| `100.136.339-61` | Marina Schutz Ribeiro | adesão cancelada (tela própria, sem financeiro) |
| `100.002.754-68` | Bruno Kowalski Lima | mesmo CPF em duas turmas (pede para escolher) |

A lista completa dos 32 cadastros está em `dados/exemplo.json`, e o servidor imprime
os principais ao subir.

O cadastro `125.225.399-06` é o seu, para entrar sempre no mesmo lugar: usa o seu CPF e o
e-mail `auxiliar.vendas.indaia@gmail.com`; o resto (nome "Renata Alves Monteiro (TESTE)",
turma, valores, convites) é inventado. Ele vive no `dados/gerar-dados.mjs`, então sobrevive
a regerar os dados. Nenhum e-mail sai daqui — o código continua aparecendo na tela.

## Como o portal está montado

**A moldura** segue a Área do Cliente (`areacliente.eventosindaia.com.br`): menu lateral fixo
no computador e a mesma barra virando gaveta no celular, aberta pelo ☰.

**O visual** vem do site editorial de formaturas
(`vendasindaia.github.io/formatura-decoracao/editorial`), de onde foram tirados:

- a logo **Indaiá Eventos · Formaturas** (`publico/logo-formaturas.png`, o mesmo arquivo do
  site — branca na barra lateral, escurecida por filtro na tela de acesso);
- a paleta inteira: paper `#F4F1EA`, ink `#191320`, night `#160C24`, violet `#7B4EC2`,
  violet-soft `#A986E0`, violet-deep `#2E1A4F`, gold `#C9A24B`, emerald `#1F8763`;
- as três fontes: Cormorant Garamond nos títulos (com trechos em itálico violeta, como em
  "Meu *financeiro*"), Montserrat no texto e **Daniel** na manuscrita — a fonte foi extraída
  do próprio site e vive em `publico/Daniel.ttf`, então funciona sem internet;
- os detalhes de composição: olho-de-seção em caixa alta com entrelinha de `.34em` e traço
  à esquerda, botões retos em violeta com sombra, o grifo violeta sob a palavra-chave e a
  assinatura "transformando histórias." na barra lateral e na tela de acesso.

Cinco itens no menu, sem as abas de serviço do app do casal (nada de assessoria,
cerimonial, vestido, papelaria ou loja):

| Item | O que traz |
|---|---|
| **Início** | faixa com as fotos do espaço montado para formatura, frase de impacto com o símbolo do curso, data do baile com contagem regressiva, a parcela a pagar em destaque, resumo do contrato, próximo passo e o último aviso da equipe |
| **Financeiro** | o foco — cartão do total do contrato no padrão da Área do Cliente, destaque da parcela, aviso de reajuste, chips de filtro e a lista agrupada por ano |
| **Cronograma** | todas as etapas até a formatura, por ano, com tipo (evento, reunião, prazo, marco), quanto falta para cada uma e destaque da próxima |
| **Contrato e convites** | termo, contrato coletivo, o que foi contratado, convites e pedidos |
| **Minha turma** | turma, pacote, avisos e o próximo passo |

O item Financeiro mostra um contador vermelho quando há parcela em atraso. A coluna de
conteúdo é centralizada (980px), como na Área do Cliente.

**A faixa de fotos do Início** usa cinco fotos do Espaço Joinville tiradas do acervo do CRM
(tabela `midias`, ambiente `loc-esp-joinville`), recortadas em 16:9 a 1800px (`publico/fotos/`). Ela troca sozinha a cada 5 segundos, para quando o ponteiro
está em cima e tem bolinhas para navegar. As fotos vêm do endpoint `/turma` (campo
`fotos`), então no ambiente real saem do cadastro do espaço.

**A frase e o símbolo do curso** são escolhidos pelo nome do curso da adesão, no mapa
`CURSOS` em `publico/app.js`: 15 cursos com símbolo próprio em SVG (biomedicina,
enfermagem, medicina, nutrição, fisioterapia, psicologia, direito, arquitetura, odontologia,
farmácia, veterinária, educação física, engenharia, licenciatura, gestão) e um genérico com
o capelo. Cada um tem a sua frase.

## O que dá para testar

**Entrar** — CPF → código de 6 dígitos → escolha de turma quando o CPF está em duas.
As regras de segurança da Parte 6 estão valendo: teto de 10 códigos por CPF por dia,
60 segundos entre pedidos, 5 tentativas por código, 10 minutos de validade, e resposta
neutra quando o CPF não existe (não revela nada).

**Financeiro** — resumo (contratado, pago, em aberto, em atraso, próximo vencimento),
barra de quitação, aviso do reajuste IPCA + 2% programado, e a lista de parcelas com
filtros: *todas*, *vencidas*, *aguardando*, *programadas* e *pagas*. Cada parcela abre com linha digitável,
copiar, **abrir PDF**, **compartilhar** e link de pagamento. No topo, a próxima parcela a pagar aparece em
destaque, com ação direta.

**Boleto ainda não emitido** — as parcelas marcadas como *a emitir* (o `scheduled` da Vindi)
têm o botão "quero pagar agora", que muda o boleto para em aberto e mostra a linha digitável.
É a única escrita no financeiro prevista no plano.

**Parcelas programadas** — as parcelas contratadas que ainda nem viraram boleto na Vindi
(o corte de dezembro/2026 que o plano cita) aparecem como *programada*, sem botão.

**Contrato e convites** — termo assinado, contrato coletivo, o que foi contratado,
convites por tipo (baile, festa 50%, Family Day, encerramento) e o pedido de convites
extras, que vira uma solicitação para a equipe e **não** gera cobrança sozinho.

**Minha turma** — data do baile, local, pacote, consultora, avisos da equipe e o próximo passo
(a jornada inteira ficou na aba Cronograma).

**2ª via de parcela vencida** — boleto vencido o banco recusa, então a parcela em atraso abre
com o aviso e o botão "Gerar 2ª via": o formando escolhe a data (2, 5 ou 10 dias) e vê o valor
com multa e juros. Regra do protótipo: **multa de 2% + juros de 1% ao mês**, pro rata.

**Extrato de pagamentos** — tudo o que já foi pago, com data e valor, o demonstrativo de como a
parcela é formada (contratada, reajustes aplicados, próximo ciclo) e PDF. Quando o contrato fecha,
aparece o pedido de declaração de quitação.

**Renegociar o atraso** — entrada de 20% do vencido e saldo em até 3×, sem desconto. Regra do
protótipo, a confirmar.

**Contestar cobrança** — na parcela, "Não reconheço esta cobrança", com motivo e descrição.

**Aviso de cobrança externa** — a partir de 45 dias de atraso a tela avisa o que acontece aos 60.

**Meus pedidos** — todo pedido sai com protocolo (SOL-ANO-0000), data e prazo de 2 dias úteis.

**Lembrete de vencimento** — em Meus dados, escolher aviso 1, 3 ou 5 dias antes.

**PDF e compartilhar** — o botão "Abrir PDF" baixa um PDF de uma página gerado pelo próprio
servidor (`GET /financeiro/:id/pdf`), com formando, CPF, evento, vencimento, valor, situação e
linha digitável. O "Compartilhar" usa a folha nativa do celular com o PDF anexado; sem suporte
a arquivo, manda só o texto; sem Web Share (no computador), abre o WhatsApp Web. No ambiente
real, o PDF passa a ser o do boleto na Vindi.

**Tema claro e escuro** — o botão na barra lateral alterna e a escolha fica salva no navegador.
Sem escolha, vale o tema do sistema.

**Isolamento** — cada chamada parte do `adesaoId` do token. Pedir o boleto de outra pessoa
devolve 404, e o token intermediário da escolha de turma não abre dado nenhum.

## De onde vêm os dados

`dados/exemplo.json` é gerado por `dados/gerar-dados.mjs` a partir do
`painel-formaturas-gestao-16-09-2026.html` (turma 7506 · E08058 · Biomedicina e Nutrição
2028/2 · Joinville · 17/03/2029).

- **Real:** estrutura da turma, valores contratados, número de parcelas, vencimentos,
  datas de pagamento e a situação de cada boleto na Vindi (`paid` / `pending` / `scheduled`).
- **Fictício:** nome, CPF, e-mail e telefone de cada formando, linha digitável, URLs de
  boleto, convites, cronograma e avisos.

Nenhum dado pessoal de formando real está neste diretório. Para regerar:
`node dados/gerar-dados.mjs`.

A data de "hoje" é fixada em **17/09/2026** (`HOJE` no gerador e `hojeSimulado` no JSON),
para que atraso, próximo vencimento e a linha do tempo fiquem estáveis entre os testes.

## O que ainda é simulação

| Ponto | Aqui | No ambiente real |
|---|---|---|
| Código de acesso | aparece na tela | WhatsApp (template HSM) e e-mail |
| Financeiro | JSON local | cache em `formatura_adesao_bills` + Vindi na hora |
| Emitir boleto | muda o status em memória | `anteciparCobranca` na Vindi (`scheduled` → `pending`) |
| PDF do termo e do boleto | só avisa na tela | URL assinada de curta duração |
| Solicitações e acessos | memória do processo | `formatura_solicitacoes` e `formatura_acessos` |
| Sessão | HMAC com segredo novo a cada boot | JWT com `scope: 'area-formando'` |

Reiniciar o servidor derruba as sessões, as solicitações e os boletos emitidos no teste.

## Arquivos

```
area-do-formando/
  servidor.mjs            servidor + endpoints /area-formando/* (Parte 4 do plano)
  iniciar.ps1             sobe o servidor e abre o navegador
  dados/gerar-dados.mjs   gera o exemplo a partir do painel de formaturas
  dados/exemplo.json      os dados de teste
  publico/index.html      casca da página
  publico/estilo.css      moldura, paleta e tipografia do editorial de formaturas
  publico/app.js          as telas e as chamadas à API
  publico/logo-formaturas.png  logo Indaiá Eventos · Formaturas
  publico/Daniel.ttf      fonte manuscrita da identidade de formaturas
```

## Endpoints no ar

Iguais aos da Parte 4 do plano, para que a troca pelo backend real seja só de endereço:

```
POST /area-formando/auth/otp/solicitar      GET  /area-formando/financeiro
POST /area-formando/auth/otp/verificar      GET  /area-formando/financeiro/:billId
POST /area-formando/auth/escolher-turma     POST /area-formando/financeiro/:billId/emitir
POST /area-formando/auth/refresh            GET  /area-formando/contrato
GET  /area-formando/me                      POST /area-formando/solicitacoes
GET  /area-formando/config                  GET  /area-formando/turma
```

Só do protótipo: `GET /area-formando/_acessos`, que mostra o que a equipe veria na aba de
acessos da turma dentro do CRM (quem entrou, em que tela, e as solicitações abertas).

## Quando for para valer

Este protótipo cobre a fase 2 do plano (o front que o formando toca). Para ligar no real
faltam as fases 0 e 1: as migrations da Parte 3, o backfill da amarração com a Vindi, e o
módulo `area-formando` no crm-backend. O front então muda em um ponto só: `API_BASE` no
`publico/app.js`, mais o token vindo do JWT de verdade.

E as 8 decisões da Parte 9 continuam abertas. O que foi assumido aqui, para o protótipo
andar, está em `dados/exemplo.json` → `config`: WhatsApp e e-mail como canais, emissão do
boleto agendado liberada para o formando, reajuste programado visível, e adesão cancelada
entrando para ver a tela de aviso em vez de ser barrada no login.
