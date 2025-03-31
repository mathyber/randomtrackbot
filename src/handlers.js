const {
    saveUserRequest,
} = require('../storage/jsonStorage');
const {
    getInfo,
    getAllCommands, allBtns
} = require("./utils");
const {currentYear} = require("../const/const");
const {morePlay, more, like, pause, playFrom, play, activatePrem, botUsers, premium, info, auth, genre,
    lastRequests, logout, fetchTrack
} = require("./actions");

function setupHandlers(bot, { getUserToken, removeUserToken }) {
    bot.start((ctx) => {
        const userId = Number(ctx.from.id);
        saveUserRequest(userId, []);
        allBtns(ctx, getInfo(), true);
    });

    const commands = {
        track: (ctx) => fetchTrack(ctx, {}, getUserToken),
        fresh: (ctx) => fetchTrack(ctx, { year: currentYear }, getUserToken),
        ultra_fresh: (ctx) => fetchTrack(ctx, { tag: 'new' }, getUserToken),
        hipster: (ctx) => fetchTrack(ctx, { tag: 'hipster' }, getUserToken),
        long_title: (ctx) => fetchTrack(ctx, {onlyLongTitle: true}, getUserToken),
        logout: (ctx) => logout(ctx, getUserToken, removeUserToken),
        play: (ctx) => play(ctx),
        playfrom: (ctx) => playFrom(ctx),
        pause: (ctx) => pause(ctx),
        like: (ctx) => like(ctx),
        bot_users: (ctx) => botUsers(ctx),
        last_requests: lastRequests,
        genre: (ctx) => genre(ctx, getUserToken),
        auth: (ctx) => auth(ctx, getUserToken),
        info,
        premium
    };

    Object.entries(commands).forEach(([cmd, handler]) => {
        bot.command(cmd, handler);
    });

    bot.action(/^botusers_(.+)$/, (ctx) => {
        const [_, pageStr] = ctx.match;
        botUsers(ctx, pageStr)
    });

    bot.action(/^more_(.+)_([^_]+)$/, more);

    bot.action(/^moreplay_(.+)_([^_]+)$/, (ctx) => morePlay(ctx));

    bot.action(/^moreplayfrom_(.+)_([^_]+)$/, (ctx) => morePlay(ctx, true));

    bot.action('activate_premium', activatePrem);

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
        allBtns(ctx, getAllCommands());
    });
}

module.exports = { setupHandlers };