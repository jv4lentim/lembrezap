# LembreZap

Bot de WhatsApp para gerenciar tarefas e listas de compras, usando a API do Whapi.Cloud.

## Requisitos

- Node.js 14 ou superior
- NPM ou Yarn
- Token de acesso do Whapi.Cloud

## Instalação

1. Clone este repositório
2. Execute `npm install` ou `yarn` para instalar as dependências
3. Crie um arquivo `.env` com as seguintes variáveis:
   ```
   WHAPI_TOKEN=seu_token_do_whapi_cloud
   OPENAI_API_KEY=sua_chave_da_openai
   PORT=3000
   ```
4. Execute `npm start` ou `yarn start` para iniciar o bot

## Comandos Disponíveis

- `!tarefa <texto da tarefa>` - Adiciona uma nova tarefa
- `!tarefas` - Lista todas as tarefas salvas
- `!concluir <número>` - Remove a tarefa pelo número
- `!lista adicionar <item>` - Adiciona um item na lista de compras
- `!lista` - Mostra todos os itens da lista de compras

## Funcionalidades

- Integração com Whapi.Cloud para envio e recebimento de mensagens
- Armazenamento persistente em arquivos JSON
- Lista de compras com adição, remoção e listagem de itens
- Sistema de lembretes com datas e notificações
- Processamento de linguagem natural para datas e lembretes usando OpenAI
- Lembretes diários automáticos às 8h da manhã

## Arquivos de Dados

O bot utiliza três arquivos JSON para armazenar os dados:
- `reminders.json` - Armazena os lembretes
- `shopping_list.json` - Armazena a lista de compras
- `crons.json` - Armazena os agendamentos de lembretes

## Configuração do Webhook

1. Acesse o painel do Whapi.Cloud
2. Configure o webhook para apontar para `https://seu-dominio.com/webhook`
3. Certifique-se de que seu servidor está acessível publicamente
4. O bot receberá automaticamente as mensagens enviadas para o número configurado 