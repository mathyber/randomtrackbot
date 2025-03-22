const { findSongYouTubeByIsrc } = require('../services/youtubeService');
const {
    saveUserRequest,
    checkUserLimit,
    incrementUserRequest,
    isPremium,
    premiumUntil,
    activatePremium
} = require('../storage/jsonStorage');
const config = require('../config/config');
const { getPostTrackResult, getRandomTrack } = require("./utils");
const path = require('path');

const pngLogo = path.join(__dirname, '../files/1.png');
const currentYear = new Date().getFullYear();
const DESCRIPTION = `Установленное ограничение на количество запросов в день: ${config.GLOBAL_LIMIT}`;
const COMMANDS = [
    { cmd: '/track', description: 'рандомный трек' },
    { cmd: '/fresh', description: `рандомный трек, выпущенный в ${currentYear} году` },
    { cmd: '/ultra_fresh', description: `рандомный трек, выпущенный за последние две недели` },
    { cmd: '/hipster', description: `рандомный трек с низкой популярностью` },
    { cmd: '/help', description: `все команды` },
];
const ALL_COMMANDS_TEXT = COMMANDS.map(c => `${c.cmd} - ${c.description}`).join('\n');

// Храним время последнего запроса для защиты от спама
const lastRequestTime = new Map();

const allBtns = (ctx, txt, withImg) => {
    const text = txt || 'выбери следующее действие:';
    const cmds = COMMANDS.map(c => c.cmd);
    const btns = {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                [cmds[0], cmds[3]],
                [cmds[1], cmds[2]],
                [cmds[4]],
            ],
            resize_keyboard: true
        },
    };
    return withImg
        ? ctx.replyWithPhoto({ source: pngLogo }, { caption: text, ...btns })
        : ctx.reply(text, btns);
};

const getTrack = async (ctx, year, tag) => {
    const userId = ctx.from.id;
    const now = Date.now();
    const lastTime = lastRequestTime.get(userId) || 0;

    // Ограничение: 1 запрос в секунду на пользователя
    if (now - lastTime < 1000) {
        return ctx.reply('Слишком быстро! Подожди секунду.', { parse_mode: 'HTML' });
    }
    lastRequestTime.set(userId, now);

    const limitCheck = checkUserLimit(userId, config.GLOBAL_LIMIT);
    if (!limitCheck.allowed) {
        return ctx.reply(
            `Ты превысил лимит запросов (${config.GLOBAL_LIMIT}). Осталось: ${limitCheck.remaining}. Попробуй завтра!`,
            { parse_mode: 'HTML' }
        );
    }

    const searchingMessage = await ctx.reply('Ищем, что тебе послушать... ⏳', { parse_mode: 'HTML' });
    const chatId = searchingMessage.chat.id;
    const messageId = searchingMessage.message_id;

    try {
        const spotifyData = await getRandomTrack(ctx, year, tag);
        const youtubeUrl = await findSongYouTubeByIsrc(spotifyData?.isrc, spotifyData);

        await ctx.telegram.deleteMessage(chatId, messageId);

        const reply = getPostTrackResult(spotifyData, youtubeUrl, limitCheck.remaining - 1);

        const inlineBtns = [
            [{ text: 'Spotify', url: spotifyData.link }],
        ];

        youtubeUrl && inlineBtns.push([{ text: 'YouTube', url: youtubeUrl }]);

        await ctx.replyWithPhoto(
            spotifyData.img ? { url: spotifyData.img } : { source: pngLogo },
            {
                caption: reply,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: inlineBtns,
                },
            }
        );

        await allBtns(ctx);
        incrementUserRequest(userId);
    } catch (e) {
        console.error('GetTrack Error:', e);
        await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
        return ctx.reply('Произошла неожиданная ошибка', { parse_mode: 'HTML' });
    }
};

function setupHandlers(bot) {
    bot.start((ctx) => {
        const userId = ctx.from.id;
        saveUserRequest(userId, 'start');
        allBtns(ctx, `
Привет! Это бот, который выдаст тебе ссылку Spotify на рандомный трек
            
${ALL_COMMANDS_TEXT}

${DESCRIPTION}

Бота создал <a href="https://t.me/laritov">Laritovski</a> по приколу и от нечего делать
        `, true);
    });

    bot.command('premium', (ctx) => {
        const userId = ctx.from.id;
        const isUserPremium = isPremium(userId);

        if (isUserPremium) {
            ctx.reply(
                `У тебя уже есть премиум! Он действует до ${premiumUntil(userId)}. Лимит: ${config.PREMIUM_LIMIT} запросов в день.`,
                { parse_mode: 'HTML' }
            );
        } else {
            ctx.reply(
                `Хочешь премиум? Получи ${config.PREMIUM_LIMIT} запросов в день вместо ${config.GLOBAL_LIMIT}! Нажми кнопку ниже, чтобы активировать (заглушка).`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Активировать премиум', callback_data: 'activate_premium' }]],
                    },
                }
            );
        }
    });

    bot.command('track', (ctx) => getTrack(ctx));
    bot.command('fresh', (ctx) => getTrack(ctx, currentYear));
    bot.command('ultra_fresh', (ctx) => getTrack(ctx, null, 'new'));
    bot.command('hipster', (ctx) => getTrack(ctx, null, 'hipster'));

    bot.action('activate_premium', async (ctx) => {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        activatePremium(userId);

        const messageId = ctx.callbackQuery.message.message_id;
        try {
            await ctx.telegram.deleteMessage(chatId, messageId);
        } catch (e) {
            await ctx.reply('блен....');
        }
        await ctx.reply(
            `Премиум успешно активирован! Теперь у тебя ${config.PREMIUM_LIMIT} запросов в день до ${premiumUntil(userId)}.`,
            { parse_mode: 'HTML' }
        );
    });

    bot.on('text', (ctx) => {
        allBtns(ctx, `Все команды: 
        
${ALL_COMMANDS_TEXT}

${DESCRIPTION}`);
    });
}

module.exports = { setupHandlers };