const express = require('express');
const fs = require('fs');
const cron = require('node-cron');
const dotenv = require('dotenv');
const moment = require('moment-timezone');
const OpenAI = require('openai');
const axios = require('axios');
const activeCrons = []

// Carrega as variáveis de ambiente
dotenv.config();

// Configura o moment para português do Brasil
moment.locale('pt-br');

// Inicializa o cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Arquivos de dados
const SHOPPING_LIST_FILE = 'shopping_list.json';
const REMINDERS_FILE = 'reminders.json';
const CRONS_FILE = 'crons.json';

const CONTEXTS = {
    MAIN: 'MAIN',
    SHOPPING: 'SHOPPING',
    REMINDERS: 'REMINDERS'
};

// Estados possíveis da conversa
const STATES = {
    // Estados do menu principal
    MAIN_MENU: 'MAIN_MENU',
    
    // Estados da lista de compras
    SHOPPING_MENU: 'SHOPPING_MENU',
    SHOPPING_ADDING_ITEMS: 'SHOPPING_ADDING_ITEMS',
    SHOPPING_REMOVING_ITEM: 'SHOPPING_REMOVING_ITEM',
    SHOPPING_CONFIRM_CLEAR: 'SHOPPING_CONFIRM_CLEAR',
    
    // Estados dos lembretes
    REMINDERS_MENU: 'REMINDERS_MENU',
    REMINDERS_ADDING: 'REMINDERS_ADDING',
    REMINDERS_CONFIRM_REMINDER: 'REMINDERS_CONFIRM_REMINDER',
    REMINDERS_ADDING_DATE: 'REMINDERS_ADDING_DATE',
    REMINDERS_REMOVING: 'REMINDERS_REMOVING',
    REMINDERS_CONFIRM_CLEAR: 'REMINDERS_CONFIRM_CLEAR'
};

// Opções de menu para cada estado
const STATE_OPTIONS = {
    [STATES.MAIN_MENU]: [
        { number: 1, text: '🧺 Lista de compras' },
        { number: 2, text: '🔔 Lembretes' }
    ],
    [STATES.SHOPPING_MENU]: [
        { number: 1, text: '📋 Ver lista' },
        { number: 2, text: '➕ Adicionar item(s)' },
        { number: 3, text: '❌ Remover item' },
        { number: 4, text: '🗑️ Limpar lista' },
        { number: 5, text: '↩️ Voltar ao menu principal' }
    ],
    [STATES.REMINDERS_MENU]: [
        { number: 1, text: '📋 Ver lembretes' },
        { number: 2, text: '➕ Adicionar lembrete(s)' },
        { number: 3, text: '❌ Remover lembrete' },
        { number: 4, text: '🗑️ Limpar todos os lembretes' },
        { number: 5, text: '↩️ Voltar ao menu principal' }
    ]
};

// Armazena o estado da conversa para cada usuário
const userStates = new Map();

// Função para enviar mensagens via Whapi.Cloud
async function sendMessage(chatId, text) {
    try {
        const response = await axios.post('https://gate.whapi.cloud/messages/text', 
            { chatId, text },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
        throw error;
    }
}

// Endpoint para receber webhooks do Whapi.Cloud
app.post('/webhook', async (req, res) => {
    try {
        const { messages } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Payload inválido' });
        }

        // Processa cada mensagem recebida
        for (const message of messages) {
            // Ignora mensagens enviadas pelo bot
            if (message.from_me === true) {
                continue;
            }

            const from = message.chat_id;
            const body = message.text?.body;

            if (!body) {
                continue;
            }

            // Cria um objeto de mensagem compatível com a lógica existente
            const compatMessage = {
                from,
                body,
                reply: async (text) => await sendMessage(from, text)
            };

            // Obtém o estado atual do usuário
            const userState = userStates.get(from) || { context: CONTEXTS.MAIN, state: STATES.MAIN_MENU };
            const input = body.trim();

            // Comando menu sempre disponível
            if (input.toLowerCase() === 'menu') {
                await sendMessage(from, showMenu(from));
                continue;
            }

            // Tenta converter input para número
            const numericInput = parseInt(input);

            // Processa a mensagem com base no contexto atual
            switch (userState.context) {
                case CONTEXTS.MAIN:
                    switch (userState.state) {
                        case STATES.MAIN_MENU:
                            switch (numericInput) {
                                case 1: // Lista de compras
                                    await sendMessage(from, showShoppingMenu(from));
                                    break;
                                case 2: // Lembretes
                                    await sendMessage(from, showRemindersMenu(from));
                                    break;
                                default:
                                    await sendMessage(from, `❌ Opção inválida.\n\n${showOptionsForState(STATES.MAIN_MENU)}`);
                                    userStates.set(from, { context: CONTEXTS.MAIN, state: STATES.MAIN_MENU });
                            }
                            break;
                    }
                    break;

                case CONTEXTS.SHOPPING:
                    switch (userState.state) {
                        case STATES.SHOPPING_MENU:
                            await handleShoppingMenuState(compatMessage, numericInput);
                            break;
                        case STATES.SHOPPING_ADDING_ITEMS:
                            if (numericInput) {
                                await handleAddingItemsOptions(compatMessage, numericInput);
                            } else {
                                await handleAddingItems(compatMessage);
                            }
                            break;
                        case STATES.SHOPPING_REMOVING_ITEM:
                            await handleRemovingItem(compatMessage, numericInput);
                            break;
                        case STATES.SHOPPING_CONFIRM_CLEAR:
                            await handleConfirmClear(compatMessage, numericInput);
                            break;
                    }
                    break;

                case CONTEXTS.REMINDERS:
                    switch (userState.state) {
                        case STATES.REMINDERS_MENU:
                            await handleRemindersMenuState(compatMessage, numericInput);
                            break;
                        case STATES.REMINDERS_ADDING:
                        case STATES.REMINDERS_CONFIRM_REMINDER:
                        case STATES.REMINDERS_ADDING_DATE:
                            await handleAddingReminderTitle(compatMessage);
                            break;
                        case STATES.REMINDERS_REMOVING:
                            await handleRemovingReminder(compatMessage, numericInput);
                            break;
                        case STATES.REMINDERS_CONFIRM_CLEAR:
                            await handleConfirmClearReminders(compatMessage, numericInput);
                            break;
                    }
                    break;
            }
        }

        res.status(200).json({ status: 'OK' });
    } catch (error) {
        console.error('Erro ao processar webhook:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Funções auxiliares para manipulação de arquivos JSON
function loadJsonFile(filename) {
    try {
        if (fs.existsSync(filename)) {
            const data = fs.readFileSync(filename, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error(`Erro ao carregar ${filename}:`, error);
        return [];
    }
}

function saveJsonFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar ${filename}:`, error);
    }
}

// Função para mostrar opções do estado atual
function showOptionsForState(state) {
    const options = STATE_OPTIONS[state] || STATE_OPTIONS[STATES.MAIN_MENU];
    return options.map(opt => `${opt.number}. ${opt.text}`).join('\n');
}

// Função para mostrar o menu principal
function showMenu(from) {
    userStates.set(from, { context: CONTEXTS.MAIN, state: STATES.MAIN_MENU });
    return `🤖 Olá! O que você deseja gerenciar?\n\n${showOptionsForState(STATES.MAIN_MENU)}`;
}

// Função para mostrar o menu de compras
function showShoppingMenu(from) {
    userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    return `🧺 Menu da lista de compras:\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`;
}

// Função para mostrar o menu de lembretes
function showRemindersMenu(from) {
    userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    return `🔔 Menu de lembretes:\n\n${showOptionsForState(STATES.REMINDERS_MENU)}`;
}

// Função para mostrar a lista de compras
function showShoppingList(from, showOptions = true) {
    const list = loadJsonFile(SHOPPING_LIST_FILE);
    let message = '';
    
    if (list.length === 0) {
        message = "📋 Lista vazia.";
    } else {
        message = `📋 Lista de compras:\n${list.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
    }

    if (showOptions) {
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
        message += `\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`;
    }

    return message;
}

// Função para processar os títulos dos lembretes com IA
async function processReminderTitlesWithAI(rawText) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "Você deve reformular cada item da lista de lembretes para torná-los mais claros e descritivos. Retorne um objeto JSON com uma array 'reminders' contendo as strings reformuladas."
                },
                {
                    role: "user",
                    content: `Reformule estes lembretes, separados por vírgula: "${rawText}"`
                }
            ]
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return result.reminders;
    } catch (error) {
        console.error('Erro ao processar lembretes com IA:', error);
        // Em caso de erro, retorna a lista original dividida por vírgula
        return rawText.split(',').map(item => item.trim());
    }
}

// Função para interpretar datas com IA
async function interpretDateWithAI(text) {
    try {
        const currentDateTime = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm');
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `Você é um assistente que interpreta datas fornecidas de forma informal por usuários brasileiros.

Tarefa:
- Receba um texto curto (ex: "Terca feita", "sabadu", "23/4") e interprete como uma data no futuro.
- Corrija erros ortográficos comuns em dias da semana ou datas informais.
- Sempre converta para o formato ISO \`YYYY-MM-DDT08:00:00-03:00\`, fixando a hora para 08:00 da manhã (fuso horário: America/Sao_Paulo).
- A data deve estar no futuro. Se a entrada for ambígua ou passada, retorne \`invalid_date: true\`.

Exemplos:
Entrada: "Terca feita" → Resultado: { "date_iso": "2025-04-22T08:00:00-03:00", "invalid_date": false }
Entrada: "23/4" → Resultado: { "date_iso": "2025-04-23T08:00:00-03:00", "invalid_date": false }
Entrada: "sabado" → Resultado: { "date_iso": "2025-04-26T08:00:00-03:00", "invalid_date": false }
Entrada: "ontem" → Resultado: { "invalid_date": true }

Responda apenas com um JSON válido com os campos:
- date_iso (se válido)
- invalid_date (true ou false)

Data e hora atual: ${currentDateTime}`
                },
                {
                    role: "user",
                    content: `Interprete esta data: "${text}"`
                }
            ]
        });

        const result = JSON.parse(completion.choices[0].message.content);
        
        // Se a data for inválida, retorna null
        if (result.invalid_date) {
            return null;
        }

        return result.date_iso;
    } catch (error) {
        console.error('Erro ao interpretar data com IA:', error);
        return null;
    }
}

// Função para mostrar os lembretes do usuário
async function showUserReminders(message, showOptions = true) {
    const { from } = message;
    const reminders = loadJsonFile(REMINDERS_FILE);
    const userReminders = reminders.filter(reminder => reminder.from === from);

    if (userReminders.length === 0) {
        if (showOptions) {
            await sendMessage(from, "📋 Você ainda não tem nenhum lembrete cadastrado.\n\nO que deseja fazer agora?\n" + showOptionsForState(STATES.REMINDERS_MENU));
        }
        return "📋 Você ainda não tem nenhum lembrete cadastrado.";
    }

    const remindersList = userReminders
        .map((reminder, index) => {
            const date = moment.tz(reminder.date_iso, 'America/Sao_Paulo');
            const formattedDate = date.format('DD/MM/YYYY');
            return `${index + 1}. ${reminder.title} - ${formattedDate}`;
        })
        .join('\n');

    const response = `📋 Seus lembretes:\n\n${remindersList}`;
    
    if (showOptions) {
        await sendMessage(from, `${response}\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    }
    return response;
}

// Função para processar lembrete com data
async function processNextReminder(message, reminders, processedReminders = []) {
    const { from } = message;
    
    // Se não há mais lembretes para processar, mostra o resumo e retorna ao menu
    if (reminders.length === 0) {
        await sendMessage(from, `O que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
        return;
    }

    // Pega o próximo lembrete da fila
    const currentReminder = reminders[0];
    const remainingReminders = reminders.slice(1);

    // Pergunta a data para o lembrete atual
    userStates.set(from, {
        context: CONTEXTS.REMINDERS,
        state: STATES.REMINDERS_ADDING_DATE,
        tempReminder: currentReminder,
        remainingReminders,
        processedReminders
    });
    await sendMessage(from, `📅 Quando você quer ser lembrado sobre: "${currentReminder}"?\nInforme apenas o dia (ex: "terça-feira", "25/04").`);
}

async function handleAddingReminderTitle(message) {
    const { from, body } = message;
    const userState = userStates.get(from);

    // Se estiver no estado inicial de adicionar lembrete
    if (userState.state === STATES.REMINDERS_ADDING) {
        // Processa os lembretes com IA
        const reminders = await processReminderTitlesWithAI(body);
        
        if (reminders.length === 0) {
            message.reply("❌ Nenhum lembrete válido fornecido. Por favor, tente novamente.");
            return;
        }

        // Inicia o processamento sequencial dos lembretes
        await processNextReminder(message, reminders);
        return;
    }
    
    // Se estiver adicionando a data para um lembrete específico
    if (userState.state === STATES.REMINDERS_ADDING_DATE) {
        const { tempReminder, remainingReminders, processedReminders } = userState;
        
        // Processa o lembrete com a data fornecida usando IA
        const date_iso = await interpretDateWithAI(body);
        
        // Se a data for inválida
        if (!date_iso) {
            message.reply("❌ Data inválida ou passada. Por favor, envie uma data futura no formato 'DD/MM' ou um dia da semana (ex: 'terça-feira').");
            return;
        }
        
        // Formata o título do lembrete (primeira letra maiúscula)
        const formatted_title = tempReminder.charAt(0).toUpperCase() + tempReminder.slice(1);
        
        // Salva o lembrete
        saveReminder(from, { formatted_title, date_iso }, true);
        
        // Envia a mensagem de confirmação
        await message.reply(`✅ Lembrete "${formatted_title}" salvo com sucesso!`);

        // Aguarda um pequeno intervalo para garantir que a mensagem de confirmação seja exibida primeiro
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Continua com os lembretes restantes
        await processNextReminder(message, remainingReminders || [], [...(processedReminders || []), { formatted_title, date_iso }]);
    }
}

// Função para enviar lembretes diários
async function sendDailyReminders() {
    console.log('🔔 Iniciando envio de lembretes diários...');
    const reminders = loadJsonFile(REMINDERS_FILE);
    
    // Agrupa os lembretes por usuário
    const remindersByUser = reminders.reduce((acc, reminder) => {
        if (reminder.lembrar) {
            if (!acc[reminder.from]) {
                acc[reminder.from] = [];
            }
            acc[reminder.from].push(reminder);
        }
        return acc;
    }, {});

    // Envia mensagens para cada usuário
    for (const [from, userReminders] of Object.entries(remindersByUser)) {
        if (userReminders.length > 0) {
            const remindersList = userReminders
                .map((reminder, index) => `${index + 1}. ${reminder.title}`)
                .join('\n');

            const message = `🔔 Bom dia! Aqui estão seus lembretes de hoje:\n\n${remindersList}`;
            
            try {
                await sendMessage(from, message);
                console.log(`✅ Lembretes enviados para ${from}`);
            } catch (error) {
                console.error(`❌ Erro ao enviar lembretes para ${from}:`, error);
            }
        }
    }
}

// Função para salvar um lembrete
function saveReminder(from, reminderData, remember = true) {
    const reminders = loadJsonFile(REMINDERS_FILE);
    const reminder = {
        title: reminderData.formatted_title,
        lembrar: remember,
        createdAt: new Date().toISOString(),
        from: from,
        date_iso: reminderData.date_iso || null
    };
    
    reminders.push(reminder);
    saveJsonFile(REMINDERS_FILE, reminders);
    
    // Se deve lembrar e tem data, agenda o cron
    if (remember && reminderData.date_iso) {
        const targetDate = moment.tz(reminderData.date_iso, 'America/Sao_Paulo');
        const now = moment().tz('America/Sao_Paulo');
        
        // Verifica se a data já passou
        if (targetDate.isBefore(now, 'day')) {
            console.log(`❌ Data já passou: ${targetDate.format('DD/MM/YYYY')}`);
            return reminder;
        }
        
        // Força o horário para 08:00
        targetDate.hour(8).minute(0).second(0);
        
        // Usa o horário 08:00 para o cron
        const cronExpression = `0 8 ${targetDate.date()} ${targetDate.month() + 1} *`;
        
        console.log(`🔔 Agendando lembrete para ${targetDate.format('DD/MM/YYYY [às] 08:00')}`);
        
        // Salva o cron job no arquivo
        saveCronJob(from, reminderData.date_iso, `🔔 Lembrete: ${reminderData.formatted_title}`);
        
        const job = cron.schedule(cronExpression, async () => {
            try {
                await sendMessage(from, `🔔 Lembrete: ${reminderData.formatted_title}`);
                console.log(`✅ Lembrete enviado para ${from}`);
                
                // Remove o cron após executar
                const crons = loadJsonFile(CRONS_FILE);
                const updatedCrons = crons.filter(c => 
                    c.from !== from || 
                    c.date_iso !== reminderData.date_iso || 
                    c.message !== `🔔 Lembrete: ${reminderData.formatted_title}`
                );
                saveJsonFile(CRONS_FILE, updatedCrons);
                job.stop();
            } catch (error) {
                console.error(`❌ Erro ao enviar lembrete para ${from}:`, error);
            }
        });
    }
    
    return reminder;
}

// Função para salvar um cron job
function saveCronJob(from, date_iso, message) {
    const crons = loadJsonFile(CRONS_FILE);
    const cronJob = { from, date_iso, message };
    crons.push(cronJob);
    saveJsonFile(CRONS_FILE, crons);
}

// Função para restaurar os cron jobs agendados
function restoreScheduledCrons() {
    const crons = loadJsonFile(CRONS_FILE);
    for (const cronJob of crons) {
        const { from, date_iso, message } = cronJob;
        saveReminder(from, { formatted_title: message, date_iso }, true);
    }
}

// Função para remover um lembrete
async function handleRemovingReminder(message, index) {
    const { from } = message;
    const reminders = loadJsonFile(REMINDERS_FILE);
    index = index - 1;

    if (index >= 0 && index < reminders.length) {
        const removedReminder = reminders.splice(index, 1)[0];
        saveJsonFile(REMINDERS_FILE, reminders);
        await sendMessage(from, `✅ Lembrete "${removedReminder.title}" removido com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else {
        await sendMessage(from, `❌ Número inválido.\n\n${await showUserReminders(message, false)}`);
    }
}

// Função para confirmar a remoção de todos os lembretes
async function handleConfirmClearReminders(message, option) {
    const { from } = message;

    if (option === 1) {
        // Carrega e filtra os lembretes, mantendo apenas os de outros usuários
        const reminders = loadJsonFile(REMINDERS_FILE);
        const updated = reminders.filter(r => r.from !== from);
        saveJsonFile(REMINDERS_FILE, updated);

        // Atualiza também o arquivo de crons
        const crons = loadJsonFile(CRONS_FILE);
        const updatedCrons = crons.filter(c => c.from !== from);
        saveJsonFile(CRONS_FILE, updatedCrons);

        await sendMessage(from, `✅ Todos os seus lembretes foram apagados com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else if (option === 2) {
        await sendMessage(from, `🚫 Operação cancelada.\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else {
        await sendMessage(from, "❌ Opção inválida.\n1. ✅ Sim\n2. ❌ Não");
    }
}

// Funções da lista de compras
async function handleShoppingMenuState(message, option) {
    const { from } = message;

    switch (option) {
        case 1: // Ver lista
            await sendMessage(from, showShoppingList(from));
            break;

        case 2: // Adicionar items
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_ADDING_ITEMS });
            await sendMessage(from, "➕ Digite os itens que deseja adicionar, separados por vírgula:");
            break;

        case 3: // Remover item
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_REMOVING_ITEM });
            await sendMessage(from, `${showShoppingList(from, false)}\n\n❌ Digite o número do item que deseja remover:`);
            break;

        case 4: // Limpar lista
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_CONFIRM_CLEAR });
            await sendMessage(from, "⚠️ Tem certeza que deseja limpar toda a lista?\n1. ✅ Sim\n2. ❌ Não");
            break;

        case 5: // Voltar ao menu principal
            await sendMessage(from, showMenu(from));
            break;

        default:
            await sendMessage(from, `❌ Opção inválida.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    }
}

async function handleAddingItemsOptions(message, option) {
    const { from } = message;

    switch (option) {
        case 1: // Ver lista
            await sendMessage(from, showShoppingList(from));
            break;

        case 2: // Adicionar mais
            userStates.set(from, { state: STATES.SHOPPING_ADDING_ITEMS });
            await sendMessage(from, "➕ Digite os itens que deseja adicionar, separados por vírgula:");
            break;

        case 3: // Remover item
            userStates.set(from, { state: STATES.SHOPPING_REMOVING_ITEM });
            await sendMessage(from, `${showShoppingList(from, false)}\n\n❌ Digite o número do item que deseja remover:`);
            break;

        case 4: // Voltar ao menu principal
            await sendMessage(from, showMenu(from));
            break;

        default:
            await sendMessage(from, `❌ Opção inválida.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    }
}

async function handleAddingItems(message) {
    const { from, body } = message;
    const items = body.split(',').map(item => item.trim()).filter(item => item);

    if (items.length > 0) {
        const list = loadJsonFile(SHOPPING_LIST_FILE);
        list.push(...items);
        saveJsonFile(SHOPPING_LIST_FILE, list);
        await sendMessage(from, `✅ Itens adicionados com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    } else {
        await sendMessage(from, `❌ Nenhum item válido fornecido.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    }
}

async function handleRemovingItem(message, index) {
    const { from } = message;
    const list = loadJsonFile(SHOPPING_LIST_FILE);
    index = index - 1;

    if (index >= 0 && index < list.length) {
        const removedItem = list.splice(index, 1)[0];
        saveJsonFile(SHOPPING_LIST_FILE, list);
        await sendMessage(from, `✅ Item "${removedItem}" removido com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else {
        await sendMessage(from, `❌ Número inválido.\n\n${showShoppingList(from, false)}\n\nDigite o número do item que deseja remover:`);
    }
}

async function handleConfirmClear(message, option) {
    const { from } = message;

    if (option === 1) {
        saveJsonFile(SHOPPING_LIST_FILE, []);
        await sendMessage(from, `✅ Lista limpa com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else if (option === 2) {
        await sendMessage(from, `🚫 Operação cancelada.\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else {
        await sendMessage(from, "❌ Opção inválida.\n1. ✅ Sim\n2. ❌ Não");
    }
}

// Configura o cron job para executar às 8h da manhã
cron.schedule('0 8 * * *', () => {
    sendDailyReminders();
}, {
    timezone: 'America/Sao_Paulo'
});

// Restaura os cron jobs agendados ao iniciar
restoreScheduledCrons();

// Configuração do servidor Express
app.get('/', (req, res) => {
    res.send('Bot WhatsApp rodando!');
});

app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});