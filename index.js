const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({ clientId: "client-one" }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

// Arquivos de dados
const SHOPPING_LIST_FILE = 'shopping_list.json';
const REMINDERS_FILE = 'reminders.json';

// Lista de comandos disponíveis
const COMANDOS = {
    '!adicionar': 'Adiciona itens à lista (separe por vírgula para múltiplos itens)\nExemplo: !adicionar pão, leite, café',
    '!lista': 'Mostra todos os itens da lista numerados',
    '!remover': 'Remove um item da lista pelo número\nExemplo: !remover 2 (remove o segundo item)',
    '!limpar': 'Remove todos os itens da lista',
    '!lembrete': 'Adiciona um ou mais lembretes (separe por vírgula)\nExemplo: !lembrete Reunião 10h, Comprar pão, Ligar médico',
    '!lembretes': 'Mostra todos os lembretes ativos',
    '!limpar_lembretes': 'Remove todos os lembretes ativos',
    '!concluir': 'Conclui um lembrete pelo número\nExemplo: !concluir 1',
    '!comandos': 'Mostra esta lista de comandos disponíveis'
};

// Comandos administrativos (não visíveis na lista de comandos)
const ADMIN_COMANDOS = {
    '!desconectar': 'Desconecta o bot para permitir conexão com outro número'
};

// Função para limpar autenticação
async function clearAuth() {
    const authFolder = '.wwebjs_auth';
    const sessionFolder = path.join(authFolder, 'session-client-one');
    
    if (fs.existsSync(sessionFolder)) {
        fs.rmSync(sessionFolder, { recursive: true, force: true });
        console.log('Autenticação removida com sucesso!');
        return true;
    }
    return false;
}

// Função para carregar dados do arquivo JSON
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

// Função para salvar dados em arquivo JSON
function saveJsonFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar ${filename}:`, error);
    }
}

// Gera e mostra o QR Code
client.on('qr', (qr) => {
    console.log('QR Code gerado! Escaneie-o com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('LembreZap está conectado e pronto para uso! 🚀');
});

// Manipulador de mensagens
client.on('message', async (message) => {
    const autorizados = ['5521973232284@c.us', '5521979907505@c.us'];
    const command = message.body.toLowerCase();

    if (message.from.includes('@g.us') && autorizados.includes(message.author) || autorizados.includes(message.from)) {
        // Comando: !adicionar
        if (command.startsWith('!adicionar ')) {
            const itemsText = message.body.slice(10).trim();
            const items = itemsText.split(',').map(item => item.trim()).filter(item => item.length > 0);
            
            if (items.length === 0) {
                message.reply('❌ Por favor, especifique pelo menos um item para adicionar.');
                return;
            }

            const shoppingList = loadJsonFile(SHOPPING_LIST_FILE);
            shoppingList.push(...items);
            saveJsonFile(SHOPPING_LIST_FILE, shoppingList);
            
            const itemCount = items.length;
            const itemsAdded = items.map(item => `• ${item}`).join('\n');
            message.reply(`✅ ${itemCount} ${itemCount === 1 ? 'item adicionado' : 'itens adicionados'} à lista:\n${itemsAdded}`);
        }

        // Comando: !lista
        else if (command === '!lista') {
            const shoppingList = loadJsonFile(SHOPPING_LIST_FILE);
            
            if (shoppingList.length === 0) {
                message.reply('📝 A lista está vazia. Use !adicionar para incluir itens.');
            } else {
                const listaNumerada = shoppingList
                    .map((item, index) => `${index + 1}. ${item}`)
                    .join('\n');
                message.reply(`📝 *Lista de Itens:*\n\n${listaNumerada}\n\n_Use !remover <número> para remover um item_`);
            }
        }

        // Comando: !lembrete (adicionar novos lembretes)
        else if (command.startsWith('!lembrete ')) {
            const reminderText = message.body.slice(10).trim();
            const newReminders = reminderText
                .split(',')
                .map(reminder => reminder.trim())
                .filter(reminder => reminder.length > 0);

            if (newReminders.length === 0) {
                message.reply('❌ Por favor, especifique pelo menos um lembrete.');
                return;
            }

            const reminders = loadJsonFile(REMINDERS_FILE);
            const now = new Date().toISOString();
            
            newReminders.forEach(reminder => {
                reminders.push({
                    text: reminder,
                    createdAt: now
                });
            });

            saveJsonFile(REMINDERS_FILE, reminders);
            
            const reminderCount = newReminders.length;
            const remindersList = newReminders.map(reminder => `• ${reminder}`).join('\n');
            message.reply(`✅ ${reminderCount} ${reminderCount === 1 ? 'lembrete adicionado' : 'lembretes adicionados'}:\n${remindersList}\n\n_Use !lembretes para ver todos os lembretes_`);
        }

        // Comando: !lembretes
        else if (command === '!lembretes') {
            const reminders = loadJsonFile(REMINDERS_FILE);
            
            if (reminders.length === 0) {
                message.reply('📝 Não há lembretes ativos. Use !lembrete para adicionar um novo.');
            } else {
                const lembretesList = reminders
                    .map((reminder, index) => {
                        const data = new Date(reminder.createdAt).toLocaleDateString('pt-BR');
                        return `${index + 1}. ${reminder.text}\n   _Criado em: ${data}_`;
                    })
                    .join('\n\n');
                message.reply(`📝 *Lembretes Ativos:*\n\n${lembretesList}\n\n_Use !concluir <número> para marcar como concluído_`);
            }
        }

        // Comando: !remover (atualizado para usar o número correto)
        else if (command.startsWith('!remover ')) {
            const itemIndex = parseInt(message.body.slice(9)) - 1;
            const shoppingList = loadJsonFile(SHOPPING_LIST_FILE);
            
            if (itemIndex >= 0 && itemIndex < shoppingList.length) {
                const removedItem = shoppingList.splice(itemIndex, 1)[0];
                saveJsonFile(SHOPPING_LIST_FILE, shoppingList);
                message.reply(`✅ Item removido: "${removedItem}"\n\n_Use !lista para ver a lista atualizada_`);
            } else {
                message.reply('❌ Número de item inválido! Use !lista para ver os números corretos.');
            }
        }

        // Comando: !concluir
        else if (command.startsWith('!concluir ')) {
            const reminderIndex = parseInt(message.body.slice(10)) - 1;
            const reminders = loadJsonFile(REMINDERS_FILE);
            
            if (reminderIndex >= 0 && reminderIndex < reminders.length) {
                const removedReminder = reminders.splice(reminderIndex, 1)[0];
                saveJsonFile(REMINDERS_FILE, reminders);
                message.reply(`✅ Lembrete concluído: "${removedReminder.text}"`);
            } else {
                message.reply('❌ Número de lembrete inválido!');
            }
        }

        // Comando: !comandos (atualizado para mostrar apenas comandos não administrativos)
        else if (command === '!comandos') {
            const comandosLista = Object.entries(COMANDOS)
                .map(([cmd, desc]) => `*${cmd}*\n${desc}`)
                .join('\n\n');
            
            message.reply(`📝 *Comandos Disponíveis:*\n\n${comandosLista}`);
        }

        // Comando: !desconectar (comando administrativo)
        else if (command === '!desconectar') {
            message.reply('🔄 Desconectando... Você precisará escanear o QR code novamente para conectar outro número.');
            await client.destroy();
            const cleared = await clearAuth();
            if (cleared) {
                client.initialize();
            } else {
                message.reply('❌ Erro ao desconectar. Tente novamente.');
            }
        }

        // Comando: !limpar
        else if (command === '!limpar') {
            const shoppingList = loadJsonFile(SHOPPING_LIST_FILE);
            
            if (shoppingList.length === 0) {
                message.reply('📝 A lista já está vazia!');
            } else {
                const itemCount = shoppingList.length;
                saveJsonFile(SHOPPING_LIST_FILE, []);
                message.reply(`🗑️ Lista limpa com sucesso!\n${itemCount} ${itemCount === 1 ? 'item foi removido' : 'itens foram removidos'}.`);
            }
        }

        // Comando: !limpar_lembretes
        else if (command === '!limpar_lembretes') {
            const reminders = loadJsonFile(REMINDERS_FILE);
            
            if (reminders.length === 0) {
                message.reply('📝 Não há lembretes para limpar.');
            } else {
                const reminderCount = reminders.length;
                saveJsonFile(REMINDERS_FILE, []);
                message.reply(`🗑️ ${reminderCount} ${reminderCount === 1 ? 'lembrete foi removido' : 'lembretes foram removidos'} com sucesso!`);
            }
        }
    }
});

// Inicia o cliente
client.initialize();

app.get('/', (req, res) => {
    res.send('LembreZap rodando!');
  });
  
app.listen(PORT, () => {
    console.log(`Servidor HTTP iniciado na porta ${PORT}`);
});