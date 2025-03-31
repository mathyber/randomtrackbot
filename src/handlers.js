const { findSongYouTubeByIsrc } = require('../services/youtubeService');
const {
    saveUserRequest,
    checkUserLimit,
    incrementUserRequest,
    isPremium,
    premiumUntil,
    activatePremium,
    getLastUserRequests, allUsers
} = require('../storage/jsonStorage');
const config = require('../config/config');
const {
    getPostTrackResult,
    getRandomTrack,
    getLastRequestsText,
    getInfo,
    usersAll
} = require("./utils");
const path = require('path');
const axios = require('axios');
const {COMMANDS, ALL_COMMANDS_TEXT, DESCRIPTION, currentYear, pageSize} = require("../const/const");
const {playTrack} = require("../services/spotifyService");
const pngLogo = path.join(__dirname, '../files/1.png');
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

const parseCommandArgs = (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) return null;
    const args = text.split(' ').slice(1).join(' ').trim();
    if (!args) return null;
    return args.replace(/\s+/g, '+');
};

const fetchTrack = async (ctx, { year, tag, genre, onlyLongTitle = false }, getUserToken) => {
    const userId = Number(ctx.from.id);
    const now = Date.now();
    const lastTime = lastRequestTime.get(userId) || 0;

    if (now - lastTime < 1000) {
        return ctx.reply('Слишком быстро! Подожди секунду', { parse_mode: 'HTML' });
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
        const spotifyData = await getRandomTrack(ctx, year, tag, genre, onlyLongTitle);
        if (spotifyData) {
            const youtubeUrl = await findSongYouTubeByIsrc(spotifyData?.isrc, spotifyData);

            await ctx.telegram.deleteMessage(chatId, messageId);

            const trackId = spotifyData.link.split('/track/')[1];
            const inlineBtns = [[{ text: '🟢 Spotify', url: spotifyData.link }]];
            youtubeUrl && inlineBtns.push([{ text: '🟥 YouTube', url: youtubeUrl }]);

            const token = await getUserToken(userId);
            const commandType = onlyLongTitle ? 'long_title' : genre ? 'genre' : year ? 'fresh' : tag === 'new' ? 'ultra_fresh' : tag === 'hipster' ? 'hipster' : 'track';
            if (token) {
                inlineBtns.push([
                    { text: '▶️', callback_data: `play_${trackId}` },
                    { text: '⏩', callback_data: `playfrom_${trackId}` },
                    { text: '⏸️', callback_data: `pause_${trackId}` },
                    { text: '❤️', callback_data: `like_${trackId}` }
                ]);
                inlineBtns.push([
                    { text: '🔄▶️ Ещё + Play', callback_data: `moreplay_${commandType}_${genre}` },
                    { text: '🔄⏩ Ещё + 1m', callback_data: `moreplayfrom_${commandType}_${genre}` }
                ]);
            }

            inlineBtns.push([
                { text: `🔄 Ещё: /${commandType} ${genre || ''}`, callback_data: `more_${commandType}_${genre}` },
            ]);

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
        } else {
            await ctx.telegram.deleteMessage(chatId, messageId);
            return ctx.reply('Не удалось найти трек. Попробуй ещё раз.', { parse_mode: 'HTML' });
        }
    } catch (e) {
        console.error('FetchTrack Error:', e);
        await ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
        return ctx.reply('Произошла неожиданная ошибка', { parse_mode: 'HTML' });
    }
};

const getTargetTrackId = async (ctx, isFromButton, trackId) => {
    const userId = Number(ctx.from.id);
    let targetTrackId = trackId;

    if (!(isFromButton && targetTrackId)) {
        const lastTrack = global.userLastTracks.get(userId);
        if (!lastTrack) {
            await ctx.reply('Сначала найди трек с помощью /track, /fresh, /ultra_fresh, /hipster или /genre.', { parse_mode: 'HTML' });
            return null;
        }
        targetTrackId = lastTrack.link.split('/track/')[1];
    }

    return targetTrackId;
};

function setupHandlers(bot, { getUserToken, removeUserToken }) {
    bot.start((ctx) => {
        const userId = Number(ctx.from.id);
        saveUserRequest(userId, []);
        allBtns(ctx, getInfo(), true);
    });

    const playSong = async (isPlayFrom = false, ctx, isFromButton = false, trackId = null, time) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);
        const args = isPlayFrom ? (time || ctx.message.text.split(' ').slice(1).join('')) : null;

        if (!token) {
            return auth(ctx);
        }

        const targetTrackId = await getTargetTrackId(ctx, isFromButton, trackId);
        if (!targetTrackId) return;

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
            const {isError, message} = await playTrack(token, targetTrackId, positionMs, args);

            if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});

            if (!isError) {
                if (isFromButton) {
                    await ctx.answerCbQuery(`Воспроизводится с ${args || 'начала'}`);
                } else if (searchingMessage) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id);
                    await ctx.reply(message, { parse_mode: 'HTML' });
                }
            }
        } catch (error) {
            console.error(error);
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

        const targetTrackId = await getTargetTrackId(ctx, isFromButton, trackId);
        if (!targetTrackId) return;

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

    const auth = async (ctx) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (token) {
            return ctx.reply('Ты уже авторизован', { parse_mode: 'HTML' });
        }

        const authUrl = `https://accounts.spotify.com/authorize?client_id=${config.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=https://${config.SERVER_URL}:${config.PORT}/callback&scope=user-read-playback-state+user-modify-playback-state+user-library-modify&state=${userId}`;
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

    const logout = async (ctx) => {
        const userId = Number(ctx.from.id);
        const token = await getUserToken(userId);

        if (!token) {
            return ctx.reply('Ты и так не авторизован в Spotify.', { parse_mode: 'HTML' });
        }

        const removed = removeUserToken(userId);
        if (removed) {
            return ctx.reply('Ты успешно вышел из аккаунта Spotify!', { parse_mode: 'HTML' });
        } else {
            return ctx.reply('Что-то пошло не так при выходе. Попробуй снова.', { parse_mode: 'HTML' });
        }
    }

    const lastRequests = (ctx) => {
        const userId = Number(ctx.from.id);
        const lastRequestData = getLastUserRequests(userId);

        return ctx.reply(getLastRequestsText(lastRequestData), { parse_mode: 'HTML' });
    }

    const info = (ctx) => {
        return ctx.replyWithPhoto({ source: pngLogo }, { caption: getInfo(), parse_mode: 'HTML', })
    }

    const botUsers = (ctx, pageStr) => {
        const page = Number(pageStr || 0);
        if (isNaN(page)) {
            return ctx.reply('Неверный аргумент', { parse_mode: 'HTML' });
        }
        try {
            const data = allUsers();
            const userId = Number(ctx.from.id);
            const inlineBtns = [];

            if (data?.length && (page && page !== 0)) {
                inlineBtns.push({ text: '<', callback_data: `botusers_${page - 1}` })
            }

            if (data?.length && (((page + 1) * pageSize) < data.length)) {
                inlineBtns.push({ text: '>', callback_data: `botusers_${page + 1}` })
            }

            if (userId.toString() === config.ADMIN_TELEGRAM_ID.toString()) {
                return ctx.reply(usersAll(data, page), {
                    reply_markup: {
                        inline_keyboard: [inlineBtns]
                    },
                    parse_mode: 'HTML'
                });
            } else {
                return ctx.reply('нет доступа.', { parse_mode: 'HTML' });
            }
        } catch (e) {
            console.error(e);
            return ctx.reply('Ошибка', { parse_mode: 'HTML' });
        }
    }

    const commands = {
        track: {
            handler: (ctx) => fetchTrack(ctx, {}, getUserToken),
            description: 'рандомный трек',
        },
        fresh: {
            handler: (ctx) => fetchTrack(ctx, { year: currentYear }, getUserToken),
            description: `рандомный трек ${currentYear} года`,
        },
        ultra_fresh: {
            handler: (ctx) => fetchTrack(ctx, { tag: 'new' }, getUserToken),
            description: 'рандомный трек за последние две недели',
        },
        hipster: {
            handler: (ctx) => fetchTrack(ctx, { tag: 'hipster' }, getUserToken),
            description: 'рандомный трек с низкой популярностью',
        },
        genre: {
            handler: async (ctx) => {
                const genre = parseCommandArgs(ctx);
                if (!genre) return ctx.reply('Укажи жанр, например /genre rock', { parse_mode: 'HTML' });
                await fetchTrack(ctx, { genre }, getUserToken);
            },
            description: 'рандомный трек в указанном жанре, например /genre rock',
        },
        long_title: {
            handler: (ctx) => fetchTrack(ctx, {onlyLongTitle: true}, getUserToken),
            description: 'рандомный трек c длинным названием (рофлофункция - показать засилие бесконечной классики)',
        },
        play: { handler: (ctx) => play(ctx) },
        playfrom: { handler: (ctx) => playFrom(ctx) },
        pause: { handler: (ctx) => pause(ctx) },
        like: { handler: (ctx) => like(ctx) },
        auth: { handler: auth },
        logout: { handler: logout },
        last_requests: { handler: lastRequests },
        bot_users: { handler: (ctx) => botUsers(ctx) },
        // bot_users_r: { handler: (ctx) => botUsers(ctx, true) },
        info: { handler: info },
    };

    bot.action(/^botusers_(.+)$/, (ctx) => {
        const [_, pageStr] = ctx.match;
        botUsers(ctx, pageStr)
    });

    Object.entries(commands).forEach(([cmd, { handler }]) => {
        bot.command(cmd, handler);
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

    const more = async (ctx) => {
        const [_, commandType, genreValue] = ctx.match;
        const year = commandType === 'fresh' ? currentYear : null;
        const tag = commandType === 'ultra_fresh' ? 'new' : commandType === 'hipster' ? 'hipster' : null;
        const genre = commandType === 'genre' ? genreValue : null;
        const onlyLongTitle = commandType === 'long_title';

        await fetchTrack(ctx, {year, tag, genre, onlyLongTitle}, getUserToken);
    }

    const morePlay = async (ctx, isPlayFrom) => {
        await more(ctx);
        if (isPlayFrom) {
            await playFrom(ctx, true, null, '1:00');
        } else {
            await play(ctx, true);
        }
    };

    bot.action(/^more_(.+)_([^_]+)$/, (ctx) => more(ctx));
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