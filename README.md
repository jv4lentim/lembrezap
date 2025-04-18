# LembreZap

Bot de WhatsApp para gerenciar tarefas e listas de compras.

## Requisitos

- Node.js 14 ou superior
- NPM ou Yarn

## Instalação

1. Clone este repositório
2. Execute `npm install` ou `yarn` para instalar as dependências
3. Execute `npm start` ou `yarn start` para iniciar o bot
4. Escaneie o QR Code que aparecerá no terminal com seu WhatsApp

## Comandos Disponíveis

- `!tarefa <texto da tarefa>` - Adiciona uma nova tarefa
- `!tarefas` - Lista todas as tarefas salvas
- `!concluir <número>` - Remove a tarefa pelo número
- `!lista adicionar <item>` - Adiciona um item na lista de compras
- `!lista` - Mostra todos os itens da lista de compras

## Funcionalidades

- Autenticação via QR Code
- Armazenamento persistente em arquivos JSON
- Gerenciamento de tarefas
- Lista de compras
- Mensagens de confirmação para cada ação

## Arquivos de Dados

O bot utiliza dois arquivos JSON para armazenar os dados:
- `tasks.json` - Armazena as tarefas
- `shopping_list.json` - Armazena a lista de compras 