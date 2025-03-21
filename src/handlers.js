const { getRandomWords } = require('../services/openaiService');
const { findSongSpotify } = require('../services/spotifyService');
const { findSongYouTubeByIsrc } = require('../services/youtubeService');
const { saveUserRequest, checkUserLimit, incrementUserRequest, isPremium, premiumUntil, activatePremium,
    getUserRequests
} = require('../storage/jsonStorage');
const config = require('../config/config');
const { getPostTrackResult} = require("./utils");

function setupHandlers(bot, botStartTime) {
    bot.start((ctx) => {
        const userId = ctx.from.id;
        saveUserRequest(userId, 'start');
        ctx.reply('Привет!');
    });

    bot.command('premium', async (ctx) => {
        const userId = ctx.from.id;
        const isUserPremium = isPremium(userId);

        if (isUserPremium) {
            await ctx.reply(
                `У тебя уже есть премиум! Он действует до ${premiumUntil(userId)}. Лимит: 100 запросов в день.`,
                { parse_mode: 'HTML' }
            );
        } else {
            await ctx.reply(
                `Хочешь премиум? Получи 100 запросов в день вместо ${config.GLOBAL_LIMIT}! Нажми кнопку ниже, чтобы активировать (заглушка).`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Активировать премиум', callback_data: 'activate_premium' }],
                        ],
                    },
                }
            );
        }
    });

    bot.command('track', async (ctx) => {
        const userId = ctx.from.id;
        const limitCheck = checkUserLimit(userId, config.GLOBAL_LIMIT);

        if (!limitCheck.allowed) {
            return ctx.reply(
                `Ты превысил лимит запросов (${config.GLOBAL_LIMIT}). Осталось: ${limitCheck.remaining}. Попробуй завтра!`,
                { parse_mode: 'HTML' }
            );
        }

        const searchingMessage = await ctx.reply('ЩА ВСЕ БУДЕТ, ЖДИ... ⏳', { parse_mode: 'HTML' });
        const chatId = searchingMessage.chat.id;
        const messageId = searchingMessage.message_id;

        const today = new Date().toISOString().split('T')[0]; // Получаем YYYY-MM-DD

        const filtered = getUserRequests(userId)?.filter(item => item.timestamp.startsWith(today)).map(r => r.request);
        console.log(filtered, ctx.from);

        const keywordsData = await getRandomWords(filtered);
        saveUserRequest(userId, keywordsData);
        const spotifyData = await findSongSpotify(keywordsData);
        if (!spotifyData) {
            await ctx.telegram.deleteMessage(chatId, messageId);
            return ctx.reply('В Spotify ничего не нашлось!');
        }
        console.log(spotifyData);

        const youtubeUrl = await findSongYouTubeByIsrc(spotifyData.isrc);

        await ctx.telegram.deleteMessage(chatId, messageId);

        await ctx.replyWithPhoto(
            { url: spotifyData.img },
            {
                caption: getPostTrackResult(spotifyData, youtubeUrl, limitCheck.remaining - 1),
                parse_mode: 'HTML',
            }
        );

        incrementUserRequest(userId);
    });

    bot.action('activate_premium', async (ctx) => {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        activatePremium(userId);

        const messageId = ctx.callbackQuery.message.message_id;
        try {
            await ctx.telegram.deleteMessage(chatId, messageId);
        } catch (e) {
            await ctx.reply('блен....')
        }
        await ctx.reply(
            `Премиум успешно активирован! Теперь у тебя 100 запросов в день до ${premiumUntil(userId)}.`,
            { parse_mode: 'HTML' }
        );
    });

    bot.on('text', async (ctx) => {
        await ctx.reply('есть команды /track и /premium', { parse_mode: 'HTML' });
    });
}

module.exports = { setupHandlers };