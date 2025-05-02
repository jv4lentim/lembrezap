const Database = require('better-sqlite3');
const path = require('path');

// Inicializa a conexão com o banco de dados
const db = new Database(path.join(__dirname, 'lembrezap.db'), {
    verbose: console.log
});

// Cria as tabelas se não existirem
function initializeTables() {
    // Tabela de lista de compras
    db.exec(`
        CREATE TABLE IF NOT EXISTS shopping_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            item TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de lembretes
    db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            title TEXT NOT NULL,
            date_iso TEXT,
            lembrar BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de crons
    db.exec(`
        CREATE TABLE IF NOT EXISTS crons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            message TEXT NOT NULL,
            date_iso TEXT NOT NULL
        )
    `);

    // Cria índices para melhorar performance
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_shopping_lists_chat_id ON shopping_lists(chat_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_chat_id ON reminders(chat_id);
        CREATE INDEX IF NOT EXISTS idx_crons_chat_id ON crons(chat_id);
    `);
}

// Inicializa as tabelas
initializeTables();

// Funções de acesso aos dados da lista de compras
const shoppingListDb = {
    getAll: (chatId) => {
        const stmt = db.prepare('SELECT * FROM shopping_lists WHERE chat_id = ? ORDER BY created_at ASC');
        return stmt.all(chatId);
    },
    
    add: (chatId, items) => {
        const stmt = db.prepare('INSERT INTO shopping_lists (chat_id, item) VALUES (?, ?)');
        const insertMany = db.transaction((chatId, items) => {
            for (const item of items) {
                stmt.run(chatId, item);
            }
        });
        insertMany(chatId, items);
    },
    
    remove: (chatId, index) => {
        const items = shoppingListDb.getAll(chatId);
        if (index >= 0 && index < items.length) {
            const itemToRemove = items[index];
            const stmt = db.prepare('DELETE FROM shopping_lists WHERE id = ? AND chat_id = ?');
            stmt.run(itemToRemove.id, chatId);
            return itemToRemove.item;
        }
        return null;
    },
    
    clear: (chatId) => {
        const stmt = db.prepare('DELETE FROM shopping_lists WHERE chat_id = ?');
        stmt.run(chatId);
    }
};

// Funções de acesso aos dados dos lembretes
const remindersDb = {
    getAll: (chatId) => {
        const stmt = db.prepare('SELECT * FROM reminders WHERE chat_id = ? ORDER BY created_at ASC');
        return stmt.all(chatId);
    },
    
    add: (chatId, reminder) => {
        const stmt = db.prepare(`
            INSERT INTO reminders (chat_id, title, date_iso, lembrar)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(chatId, reminder.title, reminder.date_iso, reminder.lembrar);
    },
    
    remove: (chatId, index) => {
        const reminders = remindersDb.getAll(chatId);
        if (index >= 0 && index < reminders.length) {
            const reminderToRemove = reminders[index];
            const stmt = db.prepare('DELETE FROM reminders WHERE id = ? AND chat_id = ?');
            stmt.run(reminderToRemove.id, chatId);
            return reminderToRemove;
        }
        return null;
    },
    
    clear: (chatId) => {
        const stmt = db.prepare('DELETE FROM reminders WHERE chat_id = ?');
        stmt.run(chatId);
    }
};

// Funções de acesso aos dados dos crons
const cronsDb = {
    getAll: () => {
        const stmt = db.prepare('SELECT * FROM crons');
        return stmt.all();
    },
    
    add: (chatId, cronJob) => {
        const stmt = db.prepare(`
            INSERT INTO crons (chat_id, message, date_iso)
            VALUES (?, ?, ?)
        `);
        return stmt.run(chatId, cronJob.message, cronJob.date_iso);
    },
    
    remove: (chatId, dateIso, message) => {
        const stmt = db.prepare(`
            DELETE FROM crons 
            WHERE chat_id = ? 
            AND date_iso = ? 
            AND message = ?
        `);
        stmt.run(chatId, dateIso, message);
    },
    
    clear: (chatId) => {
        const stmt = db.prepare('DELETE FROM crons WHERE chat_id = ?');
        stmt.run(chatId);
    }
};

module.exports = {
    db,
    shoppingListDb,
    remindersDb,
    cronsDb
}; 