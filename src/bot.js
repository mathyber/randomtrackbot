const { Telegraf } = require('telegraf');
const { setupHandlers } = require('./handlers');
const config = require('../config/config');

const bot = new Telegraf(config.TELEGRAM_TOKEN);
global.bot = bot;

const botStartTime = Math.floor(Date.now() / 1000);
const userLastTracks = new Map();
global.userLastTracks = userLastTracks;

async function refreshToken(userId) {
    const tokens = global.userTokens.get(userId);
    if (!tokens?.refresh_token) {
        console.log(`No refresh token for userId: ${userId}`);
        return null;
    }

    const axios = require('axios');
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
            client_id: config.SPOTIFY_CLIENT_ID,
            client_secret: config.SPOTIFY_CLIENT_SECRET,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, expires_in } = response.data;
        global.userTokens.set(userId, {
            ...tokens,
            access_token,
            expires_at: Date.now() + (expires_in * 1000) - 60000,
        });
        console.log(`Token refreshed for userId: ${userId}, new token: ${access_token}`);
        return access_token;
    } catch (error) {
        console.error('Refresh Token Error:', error.response?.data || error.message);
        return null;
    }
}

async function getUserToken(userId) {
    const tokens = global.userTokens.get(userId);
    if (!tokens) {
        console.log(`No tokens found for userId: ${userId}`);
        return null;
    }
    if (Date.now() > tokens.expires_at) {
        console.log(`Token expired for userId: ${userId}, refreshing...`);
        return await refreshToken(userId);
    }
    console.log(`Using existing token for userId: ${userId}: ${tokens.access_token}`);
    return tokens.access_token;
}

function startBot() {
    bot.telegram.getUpdates(-1).then(updates => {
        if (updates.length > 0) {
            const lastUpdateId = updates[updates.length - 1].update_id;
            bot.telegram.getUpdates({ offset: lastUpdateId + 1 });
            console.log(`Cleared ${updates.length} old updates`);
        }

        setupHandlers(bot, { botStartTime, getUserToken, refreshToken, userLastTracks });

        bot.launch();
        console.log('Bot started at:', new Date(botStartTime * 1000).toISOString());
        console.log('Bot is running...');
    }).catch(err => {
        console.error('Error clearing updates:', err);
        setupHandlers(bot, { botStartTime, getUserToken, refreshToken, userLastTracks });
        bot.launch();
        console.log('Bot started at:', new Date(botStartTime * 1000).toISOString());
        console.log('Bot is running...');
    });
}

module.exports = { startBot };