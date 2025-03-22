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
const axios = require('axios');

const pngLogo = path.join(__dirname, '../files/1.png');
const currentYear = new Date().getFullYear();
const DESCRIPTION = `Установленное ограничение на количество запросов в день: ${config.GLOBAL_LIMIT}`;
const COMMANDS = [
    { cmd: '/track', description: 'рандомный трек' },
    { cmd: '/fresh', description: `рандомный трек, выпущенный в ${currentYear} году` },
    { cmd: '/ultra_fresh', description: `рандомный трек, выпущенный за последние две недели` },
    { cmd: '/hipster', description: `рандомный трек с низкой популярностью` },
    { cmd: '/remote', description: 'запустить последний трек на твоём устройстве (нужен премиум Spotify)' },
    { cmd: '/help', description: `все команды` },
];
const ALL_COMMANDS_TEXT = COMMANDS.map(c => `${c.cmd} - ${c.description}`).join('\n');
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
                [cmds[4], cmds[5]],
            ],
            resize_keyboard: true
        },
    };
    return withImg
        ? ctx.replyWithPhoto({ source: pngLogo }, { caption: text, ...btns })
        : ctx.reply(text, btns);
};

const getTrack = async (ctx, year, tag) => {
    const userId = Number(ctx.from.id); // Приводим к числу
    const now = Date.now();
    const lastTime = lastRequestTime.get(userId) || 0;

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

        const inlineBtns = [[{ text: 'Spotify', url: spotifyData.link }]];
        youtubeUrl && inlineBtns.push([{ text: 'YouTube', url: youtubeUrl }]);

        const reply = getPostTrackResult(spotifyData, youtubeUrl, limitCheck.remaining - 1);
        await ctx.replyWithPhoto(
            spotifyData.img ? { url: spotifyData.img } : { source: pngLogo },
            {
                caption: reply,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: inlineBtns },
            }
        );

        await allBtns(ctx);
        incrementUserRequest(userId);

        global.userLastTracks.set(userId, spotifyData);
        console.log(`Saved last track for userId ${userId}: ${spotifyData.title} (${spotifyData.link})`);
        console.log(`Current userLastTracks for ${userId}:`, global.userLastTracks.get(userId));
    } catch (e) {
        console.error('GetTrack Error:', e);
        await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
        return ctx.reply('Произошла неожиданная ошибка', { parse_mode: 'HTML' });
    }
};

function setupHandlers(bot, { botStartTime, getUserToken, refreshToken, userLastTracks }) {
    bot.start((ctx) => {
        const userId = Number(ctx.from.id);
        saveUserRequest(userId, 'start');
        allBtns(ctx, `
Привет! Это бот, который выдаст тебе ссылку Spotify на рандомный трек
            
${ALL_COMMANDS_TEXT}

${DESCRIPTION}

Бота создал <a href="https://t.me/laritov">Laritovski</a> по приколу и от нечего делать
        `, true);
    });

    bot.command('premium', (ctx) => {
        const userId = Number(ctx.from.id);
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

    bot.command('remote', async (ctx) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (!token) {
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${config.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:${config.PORT}/callback&scope=user-read-playback-state+user-modify-playback-state&state=${userId}`;
            return ctx.reply(
                'Чтобы запустить трек на твоём устройстве, авторизуйся в Spotify (нужен премиум и открытый плеер где-то):',
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[{ text: 'Авторизоваться', url: authUrl }]],
                    },
                }
            );
        }

        const lastTrack = global.userLastTracks.get(userId);
        if (!lastTrack) {
            return ctx.reply('Сначала найди трек', { parse_mode: 'HTML' });
        }
        console.log(`Remote using last track for userId ${userId}: ${lastTrack.title} (${lastTrack.link})`);

        const searchingMessage = await ctx.reply('Проверяем твои устройства... ⏳', { parse_mode: 'HTML' });
        try {
            const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const devices = devicesResponse.data.devices;

            if (!devices.length) {
                await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
                return ctx.reply('Не нашёл активных устройств. Открой Spotify где-нибудь и попробуй снова.', { parse_mode: 'HTML' });
            }

            await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);

            const sessionId = `${userId}_${Date.now()}`;
            global.remoteSessions.set(sessionId, { trackId: lastTrack.link.split('/track/')[1], devices });
            console.log(`Session ${sessionId} created with trackId: ${lastTrack.link.split('/track/')[1]}`);

            const inlineKeyboard = devices.map((device, index) => [{
                text: `${device.name} (${device.type}) ${device.is_active ? '[активно]' : ''}`,
                callback_data: `play_${sessionId}_${index}`,
            }]);
            await ctx.reply(`Выбери, где запустить "${lastTrack.title}" на 15 сек:`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: inlineKeyboard },
            });
        } catch (error) {
            console.error('Remote Error:', error.response?.data || error.message);
            await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
            const errorMsg = error.response?.data?.error?.message || 'Что-то пошло не так.';
            return ctx.reply(`Ошибка: ${errorMsg}`, { parse_mode: 'HTML' });
        }
    });

    bot.action(/play_(.+)_(\d+)/, async (ctx) => {
        const [_, sessionId, deviceIndex] = ctx.match;
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);
        const session = global.remoteSessions.get(sessionId);

        if (!session) {
            return ctx.reply('Сессия устарела. Попробуй /remote заново.', { parse_mode: 'HTML' });
        }

        if (!token) {
            return ctx.reply('Токен недействителен. Попробуй переавторизоваться через /remote.', { parse_mode: 'HTML' });
        }

        const trackId = session.trackId;
        const deviceId = session.devices[deviceIndex].id;
        console.log(`Attempting to play trackId ${trackId} on device ${deviceId} with token ${token.substring(0, 10)}...`);

        try {
            await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                uris: [`spotify:track:${trackId}`],
                position_ms: 0,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            await ctx.reply('Заебца, ща запустим! Играет 15 сек...', { parse_mode: 'HTML' });

            setTimeout(async () => {
                await axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                await ctx.reply('Стоп, 15 сек прошло!', { parse_mode: 'HTML' });
            }, 15000);

            global.remoteSessions.delete(sessionId);
        } catch (error) {
            console.error('Play Error:', error.response?.data || error.message);
            await ctx.reply(`Не получилось запустить: ${error.response?.data?.error?.message || 'Ошибка.'}`, { parse_mode: 'HTML' });
        }
    });

    bot.action('activate_premium', async (ctx) => {
        const userId = Number(ctx.from.id);
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