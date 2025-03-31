const {playTrack, pauseTrack, likeTrack, authService} = require("../services/spotifyService");
const {getLastUserRequests, allUsers, isPremium, premiumUntil, checkUserLimit, incrementUserRequest, activatePremium} = require("../storage/jsonStorage");
const {getLastRequestsText, getInfo, usersAll, getRandomTrack, getPostTrackResult, parseCommandArgs, allBtns} = require("./utils");
const {pageSize, currentYear, pngLogo} = require("../const/const");
const config = require("../config/config");
const {findSongYouTubeByIsrc} = require("../services/youtubeService");
const lastRequestTime = new Map();

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
                { url: spotifyData.img },
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

const playSong = async (getUserToken, isPlayFrom = false, ctx, isFromButton = false, trackId = null, time) => {
    const args = isPlayFrom ? (time || ctx.message.text.split(' ').slice(1).join('')) : null;
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

    return await serviceAction(ctx, getUserToken, isFromButton, playTrack, targetTrackId, positionMs, args);
};

const play = async (ctx, getUserToken, isFromButton = false, trackId = null) => {
    await playSong(getUserToken, false, ctx, isFromButton, trackId);
};

const playFrom = async (ctx, getUserToken, isFromButton = false, trackId = null, time) => {
    await playSong(getUserToken, true, ctx, isFromButton, trackId, time);
};

const serviceAction = async (ctx, getUserToken, isFromButton, func, targetTrackId, positionMs, args) => {
    const userId = Number(ctx.from.id);
    const token = await getUserToken(userId);

    if (!token) {
        return auth(ctx);
    }

    let searchingMessage = null;
    if (!isFromButton) {
        searchingMessage = await ctx.reply('Проверяем активное устройство... ⏳', {parse_mode: 'HTML'});
    }
    try {
        const {isError, message} = await func(token, targetTrackId, positionMs, args);

        if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});

        if (!isError && isFromButton) {
            await ctx.answerCbQuery(message);
        } else {
            await ctx.reply(message, {parse_mode: 'HTML'});
        }
    } catch (error) {
        console.error(error);
    }
}

const pause = async (ctx, getUserToken, isFromButton = false) => {
    return await serviceAction(ctx, getUserToken, isFromButton, pauseTrack);
};

const like = async (ctx, getUserToken, isFromButton = false, trackId = null) => {
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
        const {isError, message} = await likeTrack(token, targetTrackId);

        if (searchingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, searchingMessage.message_id).catch(() => {});

        if (!isError && isFromButton) {
            await ctx.answerCbQuery(message);
        } else {
            await ctx.reply(message, { parse_mode: 'HTML' });
        }
    } catch (error) {
        console.error(error);
    }
};

const auth = async (ctx, getUserToken) => {
    const userId = Number(ctx.from.id);
    const token = await getUserToken(userId);

    if (token) {
        return ctx.reply('Ты уже авторизован', { parse_mode: 'HTML' });
    }

    const {authUrl, text} = await authService(userId);

    return ctx.reply(
        text || 'Авторизуйся',
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: 'Авторизоваться', url: authUrl }]],
            },
        }
    );
};

const logout = async (ctx, getUserToken, removeUserToken) => {
    const userId = Number(ctx.from.id);
    const token = await getUserToken(userId);

    if (!token) {
        return ctx.reply('Ты и так не авторизован', { parse_mode: 'HTML' });
    }

    const removed = removeUserToken(userId);
    if (removed) {
        return ctx.reply('Ты успешно вышел из аккаунта музыкального сервиса', { parse_mode: 'HTML' });
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
    return ctx.replyWithPhoto(
        { source: pngLogo },
        {
            caption: getInfo(),
            parse_mode: 'HTML'
        }
    )
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

const genre = async (ctx, getUserToken) => {
    const genre = parseCommandArgs(ctx);
    if (!genre) return ctx.reply('Укажи жанр, например /genre rock', { parse_mode: 'HTML' });
    await fetchTrack(ctx, { genre }, getUserToken);
}

const premium = (ctx) => {
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
}

const activatePrem = async (ctx) => {
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
}

const more = async (ctx, getUserToken) => {
    const [_, commandType, genreValue] = ctx.match;
    const year = commandType === 'fresh' ? currentYear : null;
    const tag = commandType === 'ultra_fresh' ? 'new' : commandType === 'hipster' ? 'hipster' : null;
    const genre = commandType === 'genre' ? genreValue : null;
    const onlyLongTitle = commandType === 'long_title';

    await fetchTrack(ctx, {year, tag, genre, onlyLongTitle}, getUserToken);
}

const morePlay = async (ctx, getUserToken, isPlayFrom) => {
    await more(ctx, getUserToken);
    if (isPlayFrom) {
        await playFrom(ctx, getUserToken, true, null, '1:00');
    } else {
        await play(ctx, getUserToken, true);
    }
};

module.exports = {
    morePlay,
    more,
    like,
    pause,
    playFrom,
    play,
    activatePrem,
    botUsers,
    premium,
    genre,
    auth,
    info,
    lastRequests,
    logout,
    fetchTrack
}