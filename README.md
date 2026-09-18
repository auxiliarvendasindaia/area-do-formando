# Área do Formando — protótipo

Protótipo navegável da Área do Formando de Grandes Formaturas (Indaiá Eventos).

**Site:** https://auxiliarvendasindaia.github.io/area-do-formando/

Para entrar, use o CPF `111.111.111-11`. O código de acesso de 6 dígitos aparece
na própria tela — não há envio por e-mail nem WhatsApp.

## O que é

Uma página só, que roda inteira no navegador. Serve para ver e discutir as telas
antes de qualquer linha entrar no sistema de verdade:

- **Início** — fotos do espaço, frase com o símbolo do curso, contagem para o baile
- **Financeiro** — total do contrato, parcelas com filtros, boleto e linha digitável
- **Cronograma** — as etapas da adesão ao baile
- **Contrato e convites** — termo, contratado, convites e pedidos
- **Minha turma** — turma, pacote e avisos

## O que NÃO é

Não tem ligação com nada: não chama o CRM, não chama a Vindi, não manda e-mail
nem WhatsApp, não grava em banco. Os dados vivem dentro da própria página e o que
o visitante fizer some ao recarregar.

Formandos, CPFs, e-mails, telefones, linhas digitáveis, convites, cronograma e
avisos são **fictícios**. Os valores e as datas de parcela vieram da estrutura de
uma turma real, sem nenhum dado pessoal junto.

## Como atualizar

O site é gerado a partir do protótipo local (pasta `area-do-formando` na máquina):

```
node publicar/montar.mjs     # monta publicar/saida
```

Depois copie o conteúdo para este repositório e faça commit.
