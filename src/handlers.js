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
    { cmd: '/play', description: 'запустить последний трек на активном устройстве (нужен премиум Spotify)' },
    { cmd: '/help', description: `все команды` },
    {
        cmd: '/playfrom',
        description: 'запустить последний трек с указанной минуты на активном устройстве, например /playfrom 1:00 (нужен премиум Spotify)'
    },
    { cmd: '/pause', description: 'поставить текущий трек на паузу на активном устройстве (нужен премиум Spotify)' },
    { cmd: '/auth', description: 'авторизоваться в Spotify (нужен премиум Spotify)' },
    { cmd: '/like', description: 'добавить последний трек в любимые (нужен премиум Spotify)' },
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
                [cmds[8], cmds[5]],
            ],
            resize_keyboard: true
        },
    };
    return withImg
        ? ctx.replyWithPhoto({ source: pngLogo }, { caption: text, ...btns })
        : ctx.reply(text, btns);
};

const getTrack = async (getUserToken, ctx, year, tag) => {
    const userId = Number(ctx.from.id);
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

        const trackId = spotifyData.link.split('/track/')[1];
        const inlineBtns = [[{ text: 'Spotify', url: spotifyData.link }]];
        youtubeUrl && inlineBtns.push([{ text: 'YouTube', url: youtubeUrl }]);

        const token = await getUserToken(userId);
        const commandType = year ? 'fresh' : tag === 'new' ? 'ultra_fresh' : tag === 'hipster' ? 'hipster' : 'track';
        if (token) {
            inlineBtns.push([
                { text: 'Play', callback_data: `play_${trackId}` },
                { text: 'Play с 1:00', callback_data: `playfrom_${trackId}` },
                { text: 'Pause', callback_data: `pause_${trackId}` },
                { text: 'Like', callback_data: `like_${trackId}` }
            ]);
            inlineBtns.push([
                { text: 'Ещё + Play', callback_data: `moreplay_${commandType}_${trackId}` },
                { text: 'Ещё + Play с 1:00', callback_data: `moreplayfrom_${commandType}_${trackId}` }
            ]);
        }

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
    } catch (e) {
        console.error('GetTrack Error:', e);
        await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
        return ctx.reply('Произошла неожиданная ошибка', { parse_mode: 'HTML' });
    }
};

function setupHandlers(bot, { getUserToken }) {
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

    const playSong = async (isPlayFrom = false, ctx, isFromButton = false, trackId = null, time) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);
        const args = isPlayFrom ? (time || ctx.message.text.split(' ').slice(1).join('')) : null;

        if (!token) {
            return auth(ctx);
        }

        let targetTrackId = trackId;
        let lastTrack = null;
        if (!(isFromButton && targetTrackId)) {
            lastTrack = global.userLastTracks.get(userId);
            if (!lastTrack) {
                return ctx.reply('Сначала найди трек с помощью /track, /fresh, /ultra_fresh или /hipster.', { parse_mode: 'HTML' });
            }
            targetTrackId = lastTrack.link.split('/track/')[1];
        }

        let positionMs = 0;
        if (args) {
            const [minutes, seconds] = args.split(':').map(Number);
            if (!isNaN(minutes) && !isNaN(seconds) && seconds < 60) {
                positionMs = (minutes * 60 + seconds) * 1000;
            } else {
                return ctx.reply('Укажи время в формате "минуты:секунды", например /playfrom 1:00', { parse_mode: 'HTML' });
            }
        }

        let searchingMessage = null;
        if (!isFromButton) {
            searchingMessage = await ctx.reply('Проверяем активное устройство... ⏳', { parse_mode: 'HTML' });
        }
        try {
            const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const devices = devicesResponse.data.devices;

            const activeDevice = devices.find(device => device.is_active);
            if (!activeDevice) {
                if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});
                return ctx.reply('Не нашёл активных устройств. Открой Spotify где-нибудь и попробуй снова.', { parse_mode: 'HTML' });
            }

            await axios.put('https://api.spotify.com/v1/me/player/play', {
                uris: [`spotify:track:${targetTrackId}`],
                position_ms: positionMs,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (isFromButton) {
                await ctx.answerCbQuery(`Воспроизводится с ${args || 'начала'}`);
            } else if (searchingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
                    await ctx.reply(`Запускаем трек на ${activeDevice.name} с ${args || 'начала'}!`, { parse_mode: 'HTML' });
                } catch (telegramError) {
                    console.error('Telegram Error after play:', telegramError);
                    await ctx.reply('Трек запущен, но что-то пошло не так с сообщением.', { parse_mode: 'HTML' });
                }
            }
        } catch (error) {
            console.error('Play Error:', error.response?.data || error.message);
            if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});
            const errorMsg = error.response?.data?.error?.message || 'Не получилось запустить.';
            return ctx.reply(`Ошибка воспроизведения: ${errorMsg} Попробуй открыть Spotify и проверить активное устройство.`, { parse_mode: 'HTML' });
        }
    };

    const play = async (ctx, isFromButton = false, trackId = null) => {
        await playSong(false, ctx, isFromButton, trackId);
    };

    const playFrom = async (ctx, isFromButton = false, trackId = null, time) => {
        await playSong(true, ctx, isFromButton, trackId, time);
    };

    const pause = async (ctx, isFromButton = false) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (!token) {
            return auth(ctx);
        }

        let searchingMessage = null;
        if (!isFromButton) {
            searchingMessage = await ctx.reply('Проверяем активное устройство... ⏳', { parse_mode: 'HTML' });
        }
        try {
            const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const devices = devicesResponse.data.devices;

            const activeDevice = devices.find(device => device.is_active);
            if (!activeDevice) {
                if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});
                return ctx.reply('Не нашёл активных устройств. Открой Spotify где-нибудь.', { parse_mode: 'HTML' });
            }

            await axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (isFromButton) {
                await ctx.answerCbQuery('Пауза');
            } else if (searchingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
                    await ctx.reply(`Поставили на паузу на ${activeDevice.name}!`, { parse_mode: 'HTML' });
                } catch (telegramError) {
                    console.error('Telegram Error after pause:', telegramError);
                    await ctx.reply('Пауза сработала, но что-то пошло не так с сообщением.', { parse_mode: 'HTML' });
                }
            }
        } catch (error) {
            console.error('Pause Error:', error.response?.data || error.message);
            if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});
            const errorMsg = error.response?.data?.error?.message || 'Не получилось поставить на паузу.';
            return ctx.reply(`Ошибка паузы: ${errorMsg} Попробуй открыть Spotify и проверить активное устройство.`, { parse_mode: 'HTML' });
        }
    };

    const like = async (ctx, isFromButton = false, trackId = null) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (!token) {
            return auth(ctx);
        }

        let targetTrackId = trackId;
        let lastTrack = null;
        if (!(isFromButton && targetTrackId)) {
            lastTrack = global.userLastTracks.get(userId);
            if (!lastTrack) {
                return ctx.reply('Сначала найди трек с помощью /track, /fresh, /ultra_fresh или /hipster.', { parse_mode: 'HTML' });
            }
            targetTrackId = lastTrack.link.split('/track/')[1];
        }

        let searchingMessage = null;
        if (!isFromButton) {
            searchingMessage = await ctx.reply('Добавляем в любимые... ⏳', { parse_mode: 'HTML' });
        }
        try {
            await axios.put(`https://api.spotify.com/v1/me/tracks`, {
                ids: [targetTrackId],
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (isFromButton) {
                await ctx.answerCbQuery('Добавлено в любимые');
            } else if (searchingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
                    await ctx.reply('Трек добавлен в любимые!', { parse_mode: 'HTML' });
                } catch (telegramError) {
                    console.error('Telegram Error after like:', telegramError);
                    await ctx.reply('Трек добавлен, но что-то пошло не так с сообщением.', { parse_mode: 'HTML' });
                }
            }
        } catch (error) {
            console.error('Like Error:', error.response?.data || error.message);
            if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});
            const errorMsg = error.response?.data?.error?.message || 'Не получилось добавить в любимые.';
            return ctx.reply(`Ошибка: ${errorMsg}`, { parse_mode: 'HTML' });
        }
    };

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

    bot.command('track', (ctx) => getTrack(getUserToken, ctx));
    bot.command('fresh', (ctx) => getTrack(getUserToken, ctx, currentYear));
    bot.command('ultra_fresh', (ctx) => getTrack(getUserToken, ctx, null, 'new'));
    bot.command('hipster', (ctx) => getTrack(getUserToken, ctx, null, 'hipster'));
    bot.command('playfrom', (ctx) => playFrom(ctx));
    bot.command('play', (ctx) => play(ctx));
    bot.command('pause', (ctx) => pause(ctx));
    bot.command('like', (ctx) => like(ctx));

    const morePlay = async (ctx, isPlayFrom) => {
        const commandType = ctx.match[1];
        const year = commandType === 'fresh' ? currentYear : null;
        const tag = commandType === 'ultra_fresh' ? 'new' : commandType === 'hipster' ? 'hipster' : null;

        await getTrack(getUserToken, ctx, year, tag);
        if (isPlayFrom) {
            await playFrom(ctx, true, null, '1:00');
        } else {
            await play(ctx, true);
        }
    };

    bot.action(/^moreplay_(.+)_([^_]+)$/, (ctx) => morePlay(ctx));
    bot.action(/^moreplayfrom_(.+)_([^_]+)$/, (ctx) => morePlay(ctx, true));

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

    const auth = async (ctx) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (token) {
            return ctx.reply('Ты уже авторизован', { parse_mode: 'HTML' });
        }

        const authUrl = `https://accounts.spotify.com/authorize?client_id=${config.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:${config.PORT}/callback&scope=user-read-playback-state+user-modify-playback-state+user-library-modify&state=${userId}`;
        return ctx.reply(
            'Авторизуйся в Spotify (нужен премиум):',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: 'Авторизоваться', url: authUrl }]],
                },
            }
        );
    };

    bot.command('auth', auth);

    bot.action(/^play_(.+)$/, async (ctx) => {
        const trackId = ctx.match[1];
        await play(ctx, true, trackId);
    });

    bot.action(/^playfrom_(.+)$/, async (ctx) => {
        const trackId = ctx.match[1];
        await playFrom(ctx, true, trackId, '1:00');
    });

    bot.action(/^pause_(.+)$/, async (ctx) => {
        await pause(ctx, true);
    });

    bot.action(/^like_(.+)$/, async (ctx) => {
        const trackId = ctx.match[1];
        await like(ctx, true, trackId);
    });

    bot.on('text', (ctx) => {
        allBtns(ctx, `Все команды: 
        
${ALL_COMMANDS_TEXT}

${DESCRIPTION}`);
    });
}

module.exports = { setupHandlers };