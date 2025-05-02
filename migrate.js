const fs = require('fs');
const { shoppingListDb, remindersDb, cronsDb } = require('./database');

// Função para carregar dados de um arquivo JSON
function loadJsonFile(filename) {
    try {
        if (fs.existsSync(filename)) {
            const data = fs.readFileSync(filename, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error(`❌ Erro ao carregar ${filename}:`, error);
        return [];
    }
}

// Migra dados da lista de compras
function migrateShoppingList() {
    console.log('🔄 Migrando lista de compras...');
    const items = loadJsonFile('shopping_list.json');
    
    if (items.length > 0) {
        // Assume que todos os itens são do mesmo chat_id (limitação do formato antigo)
        const defaultChatId = 'legacy_data';
        shoppingListDb.add(defaultChatId, items);
        console.log(`✅ ${items.length} itens migrados para a lista de compras`);
    }
}

// Migra lembretes
function migrateReminders() {
    console.log('🔄 Migrando lembretes...');
    const reminders = loadJsonFile('reminders.json');
    
    for (const reminder of reminders) {
        // Garante que lembrar seja um booleano antes de salvar
        const lembrar = reminder.lembrar !== undefined ? Boolean(reminder.lembrar) : true;
        
        remindersDb.add(reminder.from || 'legacy_data', {
            title: reminder.title,
            date_iso: reminder.date_iso,
            lembrar: lembrar
        });
    }
    console.log(`✅ ${reminders.length} lembretes migrados`);
}

// Migra crons
function migrateCrons() {
    console.log('🔄 Migrando crons...');
    const crons = loadJsonFile('crons.json');
    
    for (const cron of crons) {
        cronsDb.add(cron.from || 'legacy_data', {
            message: cron.message,
            date_iso: cron.date_iso
        });
    }
    console.log(`✅ ${crons.length} crons migrados`);
}

// Executa a migração
console.log('🚀 Iniciando migração dos dados...');

try {
    migrateShoppingList();
    migrateReminders();
    migrateCrons();
    console.log('✅ Migração concluída com sucesso!');
} catch (error) {
    console.error('❌ Erro durante a migração:', error);
    process.exit(1);
} 