const express = require('express');
const axios = require('axios');
const config = require('../config/config');
const {startBot} = require("../src/bot");

const app = express();
const PORT = config.PORT;
const userTokens = new Map();
global.userTokens = userTokens;
const remoteSessions = new Map();
global.remoteSessions = remoteSessions;

app.use(express.json());


app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = Number(req.query.state);

    console.log(`Callback triggered with code: ${code}, state: ${state}`);

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `https://${config.SERVER_IP}:${config.PORT}/callback`,
            client_id: config.SPOTIFY_CLIENT_ID,
            client_secret: config.SPOTIFY_CLIENT_SECRET,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, refresh_token, expires_in } = response.data;
        global.userTokens.set(state, {
            access_token,
            refresh_token,
            expires_at: Date.now() + (expires_in * 1000) - 60000,
        });
        console.log(`Tokens saved for userId ${state}: access_token=${access_token}, refresh_token=${refresh_token}`);

        await axios.post(`https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: state,
            text: 'Авторизация прошла! Теперь можешь использовать /play, /playfrom, /pause или /like.',
            parse_mode: 'HTML',
        });

        res.send('Авторизация прошла! Вернись в Telegram.');
    } catch (error) {
        console.error('OAuth Error:', error.response?.data || error.message);
        await axios.post(`https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: state,
            text: `Ошибка авторизации: ${error.response?.data?.error?.message || 'Что-то пошло не так.'}`,
            parse_mode: 'HTML',
        });
        res.send('Ошибка авторизации.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});