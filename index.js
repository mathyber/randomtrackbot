const { startBot } = require('./src/bot');
const express = require('express');
const axios = require('axios');
const config = require('./config/config');

const app = express();
const PORT = config.PORT;
const userTokens = new Map();
global.userTokens = userTokens;
const remoteSessions = new Map();
global.remoteSessions = remoteSessions;

app.use(express.json());

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = Number(req.query.state); // Приводим к числу

    console.log(`Callback triggered with code: ${code}, state: ${state}`);

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: `http://localhost:${PORT}/callback`,
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
            text: 'Авторизация прошла! Ща проверим устройства...',
            parse_mode: 'HTML',
        });

        global.bot.telegram.sendMessage(state, 'Ищем...', { parse_mode: 'HTML' }).then(async (msg) => {
            try {
                console.log('userLastTracks contents before get:', global.userLastTracks);
                const lastTrack = global.userLastTracks.get(state);
                console.log(`Last track in callback for userId ${state}: ${lastTrack?.title} (${lastTrack?.link})`);
                if (!lastTrack) {
                    global.bot.telegram.editMessageText(state, msg.message_id, null, 'Сначала найди трек через /track, /fresh, /ultra_fresh или /hipster.', { parse_mode: 'HTML' });
                    return;
                }

                const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
                    headers: { Authorization: `Bearer ${access_token}` },
                });
                const devices = devicesResponse.data.devices;
                console.log(`Devices for userId ${state}:`, devices);

                if (!devices.length) {
                    global.bot.telegram.editMessageText(state, msg.message_id, null, 'Не нашёл активных устройств. Открой Spotify где-нибудь и попробуй снова /remote.', { parse_mode: 'HTML' });
                    return;
                }

                const sessionId = `${state}_${Date.now()}`;
                global.remoteSessions.set(sessionId, { trackId: lastTrack.link.split('/track/')[1], devices });
                console.log(`Session ${sessionId} created with trackId: ${lastTrack.link.split('/track/')[1]}`);

                const inlineKeyboard = devices.map((device, index) => [{
                    text: `${device.name} (${device.type}) ${device.is_active ? '[активно]' : ''}`,
                    callback_data: `play_${sessionId}_${index}`,
                }]);
                global.bot.telegram.editMessageText(state, msg.message_id, null, `Выбери, где запустить "${lastTrack.title}" на 15 сек:`, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: inlineKeyboard },
                });
            } catch (error) {
                console.error('Callback Inner Error:', error.response?.data || error.message);
                global.bot.telegram.editMessageText(state, msg.message_id, null, `Ошибка: ${error.response?.data?.error?.message || 'Что-то пошло не так.'}`, { parse_mode: 'HTML' });
            }
        }).catch(err => {
            console.error('Telegram Send Error:', err);
            res.send('Ошибка отправки сообщения в Telegram.');
        });

        res.send('Авторизация прошла! Вернись в Telegram.');
    } catch (error) {
        console.error('OAuth Error:', error.response?.data || error.message);
        res.send('Ошибка авторизации.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot();
});