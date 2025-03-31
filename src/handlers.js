const {
    saveUserRequest,
} = require('../storage/jsonStorage');
const {
    getInfo,
    getAllCommands, allBtns
} = require("./utils");
const {currentYear} = require("../const/const");
const {
    morePlay,
    more,
    like,
    pause,
    playFrom,
    play,
    activatePrem,
    botUsers,
    premium,
    info,
    auth,
    genre,
    lastRequests,
    logout,
    fetchTrack
} = require("./actions");

function setupHandlers(bot, {getUserToken, removeUserToken}) {
    bot.start((ctx) => {
        const userId = Number(ctx.from.id);
        saveUserRequest(userId, []);
        allBtns(ctx, getInfo(), true);
    });

    const commands = {
        track: (ctx) => fetchTrack(ctx, {}, getUserToken),
        fresh: (ctx) => fetchTrack(ctx, {year: currentYear}, getUserToken),
        ultra_fresh: (ctx) => fetchTrack(ctx, {tag: 'new'}, getUserToken),
        hipster: (ctx) => fetchTrack(ctx, {tag: 'hipster'}, getUserToken),
        long_title: (ctx) => fetchTrack(ctx, {onlyLongTitle: true}, getUserToken),
        logout: (ctx) => logout(ctx, getUserToken, removeUserToken),
        play: (ctx) => play(ctx, getUserToken),
        playfrom: (ctx) => playFrom(ctx, getUserToken),
        pause: (ctx) => pause(ctx, getUserToken),
        like: (ctx) => like(ctx, getUserToken),
        bot_users: (ctx) => botUsers(ctx),
        last_requests: lastRequests,
        genre: (ctx) => genre(ctx, getUserToken),
        auth: (ctx) => auth(ctx, getUserToken),
        info,
        premium
    };

    const actions = [
        {
            action: /^botusers_(.+)$/,
            handler: (ctx) => {
                const [_, pageStr] = ctx.match;
                botUsers(ctx, pageStr)
            }
        },
        {
            action: /^more_(.+)_([^_]+)$/,
            handler: (ctx) => more(ctx, getUserToken)
        },
        {
            action: /^moreplay_(.+)_([^_]+)$/,
            handler: (ctx) => morePlay(ctx, getUserToken)
        },
        {
            action: /^moreplayfrom_(.+)_([^_]+)$/,
            handler: (ctx) => morePlay(ctx, getUserToken, true)
        },
        {
            action: /^play_(.+)$/,
            handler: async (ctx) => {
                const trackId = ctx.match[1];
                await play(ctx, getUserToken, true, trackId);
            }
        },
        {
            action: /^playfrom_(.+)$/,
            handler: async (ctx) => {
                const trackId = ctx.match[1];
                await playFrom(ctx, getUserToken, true, trackId, '1:00');
            }
        },
        {
            action: /^pause_(.+)$/,
            handler: async (ctx) => {
                await pause(ctx, getUserToken, true);
            }
        },
        {
            action: /^like_(.+)$/,
            handler: async (ctx) => {
                const trackId = ctx.match[1];
                await like(ctx, getUserToken, true, trackId);
            }
        },
        {
            action: 'activate_premium',
            handler: activatePrem
        },
    ]

    Object.entries(commands).forEach(([cmd, handler]) => {
        bot.command(cmd, handler);
    });

    actions.forEach(({action, handler}) => {
        bot.action(action, handler);
    })

    bot.on('text', (ctx) => {
        allBtns(ctx, getAllCommands());
    });
}

module.exports = {setupHandlers};