require('dotenv').config();

const config = {
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    BOT_NICKNAME: 'musicorandom_bot',
    GLOBAL_LIMIT: 100,
    PREMIUM_LIMIT: 1000,
    PORT: 3000,
    ANTI_CLASSIC_MAX_LENGTH_TITLE_FILTER: 45,
    SERVER_IP: '38.180.222.180:8080'
};

module.exports = config;