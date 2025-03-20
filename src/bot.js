const { Telegraf } = require('telegraf');
const { setupHandlers } = require('./handlers');
const config = require('../config/config');

const bot = new Telegraf(config.TELEGRAM_TOKEN);

// Сохраняем время запуска бота (в формате Unix timestamp)
const botStartTime = Math.floor(Date.now() / 1000);

function startBot() {
    // Очищаем очередь обновлений перед запуском
    bot.telegram.getUpdates(-1).then(updates => {
        if (updates.length > 0) {
            const lastUpdateId = updates[updates.length - 1].update_id;
            // Устанавливаем offset, чтобы игнорировать все старые обновления
            bot.telegram.getUpdates({ offset: lastUpdateId + 1 });
            console.log(`Cleared ${updates.length} old updates`);
        }

        // Передаем botStartTime в setupHandlers
        setupHandlers(bot, botStartTime);

        // Запускаем бота
        bot.launch();
        console.log('Bot started at:', new Date(botStartTime * 1000).toISOString());
        console.log('Bot is running...');
    }).catch(err => {
        console.error('Error clearing updates:', err);
        // Запускаем бота, даже если не удалось очистить обновления
        setupHandlers(bot, botStartTime);
        bot.launch();
        console.log('Bot started at:', new Date(botStartTime * 1000).toISOString());
        console.log('Bot is running...');
    });
}

module.exports = { startBot };