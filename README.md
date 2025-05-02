# LembreZap

Bot de WhatsApp para gerenciar tarefas e listas de compras, usando a API do Whapi.Cloud.

## 🔄 Migração para SQLite

O projeto foi atualizado para usar SQLite como banco de dados ao invés de arquivos JSON. As principais mudanças incluem:

- Criação do banco de dados `lembrezap.db`
- Tabelas:
  - `shopping_lists`: Lista de compras
  - `reminders`: Lembretes
  - `crons`: Agendamentos

### 📋 Estrutura do Banco

```sql
-- Lista de compras
CREATE TABLE shopping_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    item TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lembretes
CREATE TABLE reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date_iso TEXT,
    lembrar BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crons (agendamentos)
CREATE TABLE crons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    message TEXT NOT NULL,
    date_iso TEXT NOT NULL
);
```

### 🚀 Instalação

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente no arquivo `.env`:
```env
WHAPI_TOKEN=seu_token_aqui
OPENAI_API_KEY=sua_chave_aqui
```

3. Execute o script de migração (opcional, se tiver dados antigos):
```bash
npm run migrate
```

4. Inicie o servidor:
```bash
npm start
```

### 📝 Notas da Migração

- Os dados são agora separados por `chat_id`, garantindo que cada usuário veja apenas seus próprios dados
- O banco SQLite é criado automaticamente na primeira execução
- O script de migração (`migrate.js`) importa dados dos arquivos JSON antigos para o SQLite
- Os arquivos JSON antigos podem ser removidos após a migração bem-sucedida:
  - `shopping_list.json`
  - `reminders.json`
  - `crons.json`

### 🔒 Backup

Para fazer backup do banco de dados:

1. Pare o servidor
2. Copie o arquivo `lembrezap.db` para um local seguro
3. Reinicie o servidor

### 🛠️ Desenvolvimento

O projeto usa:
- `better-sqlite3` para acesso ao banco de dados
- `express` para o servidor web
- `node-cron` para agendamento de lembretes
- `openai` para processamento de linguagem natural
- `moment-timezone` para manipulação de datas
- `axios` para requisições HTTP
- `dotenv` para variáveis de ambiente

## Requisitos

- Node.js 14 ou superior
- NPM ou Yarn
- Conta no Whapi.Cloud
- Número do WhatsApp conectado ao Whapi.Cloud
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

## Configuração do Whapi.Cloud

1. Acesse https://whapi.cloud e crie uma conta
2. No painel, vá em "Channels" e adicione um novo canal do WhatsApp
3. Siga as instruções para conectar seu número do WhatsApp
4. Após conectado, copie o token do canal em "API Keys"
5. Cole o token no arquivo `.env` na variável `WHAPI_TOKEN`
6. Configure o webhook:
   - No painel do Whapi.Cloud, vá em "Webhooks"
   - Adicione um novo webhook com a URL: `https://seu-dominio.com/webhook`
   - Selecione o evento "messages"
   - Ative o webhook

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

## Solução de Problemas

Se você encontrar erros ao enviar mensagens, verifique:

1. Token do Whapi.Cloud:
   - O token está correto no arquivo `.env`?
   - O token tem permissões para enviar mensagens?

2. Canal do WhatsApp:
   - O número está conectado corretamente no Whapi.Cloud?
   - O status do canal está "Connected" no painel?

3. Webhook:
   - A URL do webhook está acessível publicamente?
   - O webhook está configurado para o evento "messages"?
   - O webhook está ativo no painel?

4. Logs:
   - Verifique os logs do servidor para mensagens de erro
   - Se aparecer "Channel not found", reconecte seu número no Whapi.Cloud
   - Se aparecer erro de autenticação, verifique seu token

## Comandos do Menu

O bot usa um sistema de menu interativo. Envie "menu" para começar.

Opções disponíveis:
1. Lista de Compras
   - Ver lista
   - Adicionar itens
   - Remover item
   - Limpar lista

2. Lembretes
   - Ver lembretes
   - Adicionar lembrete
   - Remover lembrete
   - Limpar todos 