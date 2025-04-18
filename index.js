const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const dotenv = require('dotenv');
const moment = require('moment-timezone');
const activeCrons = []

// Carrega as variáveis de ambiente
dotenv.config();

// Configura o moment para português do Brasil
moment.locale('pt-br');

const app = express();
const PORT = process.env.PORT || 3000;

// Arquivos de dados
const SHOPPING_LIST_FILE = 'shopping_list.json';
const REMINDERS_FILE = 'reminders.json';

// Arquivo para persistência dos cron jobs
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

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "client-one" }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
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

// Eventos do cliente WhatsApp
client.on('qr', (qr) => {
    console.log('QR Code gerado! Escaneie-o com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Bot está conectado e pronto para uso!');

    // Restaura os cron jobs agendados
    restoreScheduledCrons();

    // Configura o cron job para executar às 8h da manhã
    cron.schedule('0 8 * * *', () => {
        sendDailyReminders();
    }, {
        timezone: 'America/Sao_Paulo'
    });
});

client.on('message', async (message) => {
    const { from, body } = message;
    const userState = userStates.get(from) || { context: CONTEXTS.MAIN, state: STATES.MAIN_MENU };
    const input = body.trim();

    // Comando menu sempre disponível
    if (input.toLowerCase() === 'menu') {
        message.reply(showMenu(from));
        return;
    }

    // Tenta converter input para número
    const numericInput = parseInt(input);

    switch (userState.context) {
        case CONTEXTS.MAIN:
            switch (userState.state) {
                case STATES.MAIN_MENU:
                    switch (numericInput) {
                        case 1: // Lista de compras
                            message.reply(showShoppingMenu(from));
                            break;
                        case 2: // Lembretes
                            message.reply(showRemindersMenu(from));
                            break;
                        default:
                            message.reply(`❌ Opção inválida.\n\n${showOptionsForState(STATES.MAIN_MENU)}`);
                            userStates.set(from, { context: CONTEXTS.MAIN, state: STATES.MAIN_MENU });
                    }
                    break;
            }
            break;

        case CONTEXTS.SHOPPING:
            switch (userState.state) {
                case STATES.SHOPPING_MENU:
                    handleShoppingMenuState(message, numericInput);
                    break;
                case STATES.SHOPPING_ADDING_ITEMS:
                    if (numericInput) {
                        handleAddingItemsOptions(message, numericInput);
                    } else {
                        handleAddingItems(message);
                    }
                    break;
                case STATES.SHOPPING_REMOVING_ITEM:
                    handleRemovingItem(message, numericInput);
                    break;
                case STATES.SHOPPING_CONFIRM_CLEAR:
                    handleConfirmClear(message, numericInput);
                    break;
            }
            break;

        case CONTEXTS.REMINDERS:
            switch (userState.state) {
                case STATES.REMINDERS_MENU:
                    handleRemindersMenuState(message, numericInput);
                    break;
                case STATES.REMINDERS_ADDING:
                case STATES.REMINDERS_CONFIRM_REMINDER:
                case STATES.REMINDERS_ADDING_DATE:
                    await handleAddingReminderTitle(message);
                    break;
                case STATES.REMINDERS_REMOVING:
                    handleRemovingReminder(message, numericInput);
                    break;
                case STATES.REMINDERS_CONFIRM_CLEAR:
                    handleConfirmClearReminders(message, numericInput);
                    break;
            }
            break;
    }
});

function handleShoppingMenuState(message, option) {
    const { from } = message;

    switch (option) {
        case 1: // Ver lista
            message.reply(showShoppingList(from));
            break;

        case 2: // Adicionar items
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_ADDING_ITEMS });
            message.reply("➕ Digite os itens que deseja adicionar, separados por vírgula:");
            break;

        case 3: // Remover item
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_REMOVING_ITEM });
            message.reply(`${showShoppingList(from, false)}\n\n❌ Digite o número do item que deseja remover:`);
            break;

        case 4: // Limpar lista
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_CONFIRM_CLEAR });
            message.reply("⚠️ Tem certeza que deseja limpar toda a lista?\n1. ✅ Sim\n2. ❌ Não");
            break;

        case 5: // Voltar ao menu principal
            message.reply(showMenu(from));
            break;

        default:
            message.reply(`❌ Opção inválida.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
            userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    }
}

function handleRemindersMenuState(message, option) {
    const { from } = message;

    switch (option) {
        case 1: // Ver lembretes
            showUserReminders(message);
            break;

        case 2: // Adicionar lembrete
            userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_ADDING });
            message.reply("🔔 Digite o lembrete que deseja salvar (você pode adicionar vários separados por vírgula).\n\nExemplos:\n- Ir ao dentista\n- Comprar ração para o cachorro\n- Buscar camisa na lavanderia");
            break;

        case 3: // Remover lembrete
            userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_REMOVING });
            message.reply(`${showUserReminders(message, false)}\n\n❌ Digite o número do lembrete que deseja remover:`);
            break;

        case 4: // Limpar todos os lembretes
            userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_CONFIRM_CLEAR });
            message.reply("⚠️ Tem certeza que deseja limpar todos os lembretes?\n1. ✅ Sim\n2. ❌ Não");
            break;

        case 5: // Voltar ao menu principal
            message.reply(showMenu(from));
            break;

        default:
            message.reply(`❌ Opção inválida.\n\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
            userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    }
}

function handleAddingItemsOptions(message, option) {
    const { from } = message;

    switch (option) {
        case 1: // Ver lista
            message.reply(showShoppingList(from));
            break;

        case 2: // Adicionar mais
            userStates.set(from, { state: STATES.SHOPPING_ADDING_ITEMS });
            message.reply("➕ Digite os itens que deseja adicionar, separados por vírgula:");
            break;

        case 3: // Remover item
            userStates.set(from, { state: STATES.SHOPPING_REMOVING_ITEM });
            message.reply(`${showShoppingList(from, false)}\n\n❌ Digite o número do item que deseja remover:`);
            break;

        case 4: // Voltar ao menu principal
            message.reply(showMenu(from));
            break;

        default:
            message.reply(`❌ Opção inválida.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    }
}

function handleAddingItems(message) {
    const { from, body } = message;
    const items = body.split(',').map(item => item.trim()).filter(item => item);

    if (items.length > 0) {
        const list = loadJsonFile(SHOPPING_LIST_FILE);
        list.push(...items);
        saveJsonFile(SHOPPING_LIST_FILE, list);
        message.reply(`✅ Itens adicionados com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    } else {
        message.reply(`❌ Nenhum item válido fornecido.\n\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
    }
}

function handleRemovingItem(message, index) {
    const { from } = message;
    const list = loadJsonFile(SHOPPING_LIST_FILE);
    index = index - 1;

    if (index >= 0 && index < list.length) {
        const removedItem = list.splice(index, 1)[0];
        saveJsonFile(SHOPPING_LIST_FILE, list);
        message.reply(`✅ Item "${removedItem}" removido com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else {
        message.reply(`❌ Número inválido.\n\n${showShoppingList(from, false)}\n\nDigite o número do item que deseja remover:`);
    }
}

function handleConfirmClear(message, option) {
    const { from } = message;

    if (option === 1) {
        saveJsonFile(SHOPPING_LIST_FILE, []);
        message.reply(`✅ Lista limpa com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else if (option === 2) {
        message.reply(`🚫 Operação cancelada.\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.SHOPPING_MENU)}`);
        userStates.set(from, { context: CONTEXTS.SHOPPING, state: STATES.SHOPPING_MENU });
    } else {
        message.reply("❌ Opção inválida.\n1. ✅ Sim\n2. ❌ Não");
    }
}

// Função para mostrar os lembretes do usuário
function showUserReminders(message, showOptions = true) {
    const { from } = message;
    const reminders = loadJsonFile(REMINDERS_FILE);
    const userReminders = reminders.filter(reminder => reminder.from === from);

    if (userReminders.length === 0) {
        message.reply("📋 Você ainda não tem nenhum lembrete cadastrado.\n\nO que deseja fazer agora?\n" + showOptionsForState(STATES.REMINDERS_MENU));
        return;
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
        message.reply(`${response}\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else {
        return response;
    }
}

// Função para processar a data informada pelo usuário
function parseDateFromUserInput(dateText) {
    // Remove espaços extras e converte para minúsculas
    dateText = dateText.trim().toLowerCase();
    
    // Mapa de dias da semana para números (0 = domingo, 1 = segunda, etc)
    const weekDays = {
        'domingo': 0, 'dom': 0,
        'segunda': 1, 'segunda-feira': 1, 'seg': 1,
        'terça': 2, 'terca': 2, 'terça-feira': 2, 'ter': 2,
        'quarta': 3, 'quarta-feira': 3, 'qua': 3,
        'quinta': 4, 'quinta-feira': 4, 'qui': 4,
        'sexta': 5, 'sexta-feira': 5, 'sex': 5,
        'sábado': 6, 'sabado': 6, 'sab': 6
    };

    // Regex para data no formato DD/MM
    const dateRegex = /^(\d{1,2})\/(\d{1,2})$/;
    
    // Inicializa a data base como hoje às 08:00
    let targetDate = moment().tz('America/Sao_Paulo').hour(8).minute(0).second(0);
    
    // Se for um dia da semana
    if (dateText in weekDays) {
        const targetDay = weekDays[dateText];
        const currentDay = targetDate.day();
        
        // Calcula quantos dias adicionar para chegar ao dia desejado
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0 || (daysToAdd === 0 && targetDate.hour() >= 8)) {
            daysToAdd += 7;
        }
        
        targetDate.add(daysToAdd, 'days');
    }
    // Se for uma data específica (DD/MM)
    else if (dateRegex.test(dateText)) {
        const [, day, month] = dateText.match(dateRegex);
        
        // Configura a data alvo
        targetDate.date(parseInt(day));
        targetDate.month(parseInt(month) - 1);
        
        // Se a data já passou este ano, adiciona um ano
        if (targetDate.isBefore(moment(), 'day') || 
            (targetDate.isSame(moment(), 'day') && moment().hour() >= 8)) {
            targetDate.add(1, 'year');
        }
    }
    // Data inválida
    else {
        return { date_iso: null };
    }
    
    return { date_iso: targetDate.format() };
}

// Função para processar lembrete com data
async function processNextReminder(message, reminders, processedReminders = []) {
    const { from } = message;
    
    // Se não há mais lembretes para processar, mostra o resumo e retorna ao menu
    if (reminders.length === 0) {
        message.reply(`O que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
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
    message.reply(`📅 Quando você quer ser lembrado sobre: "${currentReminder}"?\nInforme apenas o dia (ex: "terça-feira", "25/04").`);
}

async function handleAddingReminderTitle(message) {
    const { from, body } = message;
    const userState = userStates.get(from);

    // Se estiver no estado inicial de adicionar lembrete
    if (userState.state === STATES.REMINDERS_ADDING) {
        const reminders = body.split(',').map(r => r.trim()).filter(r => r);
        
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
        
        // Processa o lembrete com a data fornecida
        const { date_iso } = parseDateFromUserInput(body);
        
        // Se a data for inválida
        if (!date_iso) {
            message.reply("❌ Data inválida. Por favor, envie uma data no formato 'DD/MM' ou um dia da semana (ex: 'terça-feira').");
            return;
        }
        
        // Formata o título do lembrete (primeira letra maiúscula)
        const formatted_title = tempReminder.charAt(0).toUpperCase() + tempReminder.slice(1).toLowerCase();
        
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
                await client.sendMessage(from, message);
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
                await client.sendMessage(from, `🔔 Lembrete: ${reminderData.formatted_title}`);
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
function handleRemovingReminder(message, index) {
    const { from } = message;
    const reminders = loadJsonFile(REMINDERS_FILE);
    index = index - 1;

    if (index >= 0 && index < reminders.length) {
        const removedReminder = reminders.splice(index, 1)[0];
        saveJsonFile(REMINDERS_FILE, reminders);
        message.reply(`✅ Lembrete "${removedReminder.title}" removido com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else {
        message.reply(`❌ Número inválido.\n\n${showUserReminders(message, false)}`);
    }
}

// Função para confirmar a remoção de todos os lembretes
function handleConfirmClearReminders(message, option) {
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

        message.reply(`✅ Todos os seus lembretes foram apagados com sucesso!\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else if (option === 2) {
        message.reply(`🚫 Operação cancelada.\n\nO que deseja fazer agora?\n${showOptionsForState(STATES.REMINDERS_MENU)}`);
        userStates.set(from, { context: CONTEXTS.REMINDERS, state: STATES.REMINDERS_MENU });
    } else {
        message.reply("❌ Opção inválida.\n1. ✅ Sim\n2. ❌ Não");
    }
}

// Inicia o cliente
client.initialize();

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