const axios = require('axios');
const config = require('../config/config');
const {getOffset} = require("../src/utils");

let accessToken = null;
let tokenExpiration = 0;

function getTrackParam(track, add = {}) {
    return {
        title: Buffer.from(track?.name || '', 'utf8').toString('utf8'),
        artists: track?.artists?.map(a => Buffer.from(a?.name, 'utf8').toString('utf8')),
        img: track?.album?.images[0]?.url,
        release_date: track?.album?.release_date,
        link: track?.external_urls?.spotify,
        isrc: track?.external_ids?.isrc,
        popularity: track?.popularity,
        ...add
    };
}

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiration) {
        return accessToken;
    }

    try {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
                },
            }
        );
        accessToken = response.data.access_token;
        tokenExpiration = Date.now() + (response.data.expires_in * 1000) - 60000; // Минус минута для запаса
        return accessToken;
    } catch (error) {
        console.error('Spotify Token Error:', error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        return null;
    }
}

async function findSongSpotify({ q, offset }) {
    if (!accessToken || Date.now() >= tokenExpiration) {
        await getAccessToken();
        if (!accessToken) return null;
    }

    try {
        const response = await axios.get(`https://api.spotify.com/v1/search`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { q, type: 'track', limit: 1, offset },
            responseType: 'json',
        });

        if (response.data.tracks?.items?.length > 0) {
            const track = response.data.tracks.items[0];
            return getTrackParam(track);
        }
        return null;
    } catch (error) {
        console.error(`Spotify Search Error (q=${q}, offset=${offset}):`, error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response?.status === 401) {
            console.log('Token expired, refreshing...');
            await getAccessToken();
            return findSongSpotify({ q, offset });
        }
        return null;
    }
}

async function findSongFromAlbumSpotify({ q, offset }) {
    if (!accessToken || Date.now() >= tokenExpiration) {
        await getAccessToken();
        if (!accessToken) return null;
    }

    try {
        let albumResponse = null;
        let attempts = 0;
        const maxAttempts = 5; // Ограничение попыток

        while (!albumResponse?.data?.albums?.items?.length && attempts < maxAttempts) {
            albumResponse = await axios.get(`https://api.spotify.com/v1/search`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { q, type: 'album', limit: 1, offset },
                responseType: 'json',
            });
            if (!albumResponse?.data?.albums?.items?.length) {
                console.log(`No albums found (q=${q}, offset=${offset}), attempt ${attempts + 1}`);
                offset = getOffset();
                attempts++;
            }
        }

        if (attempts >= maxAttempts) {
            console.log(`Failed to find album after ${maxAttempts} attempts (q=${q})`);
            return null;
        }

        const album = albumResponse.data.albums.items[0];
        const albumId = album.id;

        const tracksResponse = await axios.get(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { limit: 50 },
            responseType: 'json',
        });

        const tracks = tracksResponse.data.items;
        if (!tracks.length) return null;

        const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
        const trackResponse = await axios.get(`https://api.spotify.com/v1/tracks/${randomTrack.id}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'json',
        });

        const track = trackResponse.data;
        return getTrackParam(track);
    } catch (error) {
        console.error(`Spotify Album Search Error (q=${q}, offset=${offset}):`, error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response?.status === 401) {
            console.log('Token expired, refreshing...');
            await getAccessToken();
            return findSongFromAlbumSpotify({ q, offset });
        }
        return null;
    }
}

async function playTrack(token, targetTrackId, positionMs, args) {
    let message, isError = false;
    try {
        const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const devices = devicesResponse.data.devices;
        const activeDevice = devices.find(device => device.is_active);

        if (!activeDevice) {
            message = 'Не нашёл активных устройств. Открой Spotify где-нибудь и попробуй снова.';
            isError = true;
        } else {
            await axios.put('https://api.spotify.com/v1/me/player/play', {
                uris: [`spotify:track:${targetTrackId}`],
                position_ms: positionMs,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            message = `Запускаем трек на ${activeDevice.name} с ${args || 'начала'}!`
        }
    } catch (error) {
        console.error('Play Error:', error.response?.data || error.message);
        const errorMsg = error.response?.data?.error?.message || 'Не получилось запустить.';
        message = `Ошибка воспроизведения: ${errorMsg} Попробуй открыть Spotify и проверить активное устройство.`;
        isError = true;
    }

    return {
        isError,
        message
    }
}

async function pauseTrack(token) {
    let message, isError = false;
    try {
        const devicesResponse = await axios.get('https://api.spotify.com/v1/me/player/devices', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const devices = devicesResponse.data.devices;
        const activeDevice = devices.find(device => device.is_active);

        if (!activeDevice) {
            message = 'Не нашёл активных устройств. Открой Spotify где-нибудь и попробуй снова.';
            isError = true;
        } else {
            await axios.put('https://api.spotify.com/v1/me/player/pause', {}, {
                headers: { Authorization: `Bearer ${token}` },
            });

            message = `Поставили на паузу на ${activeDevice.name}!`;
        }
    } catch (error) {
        console.error('Play Error:', error.response?.data || error.message);
        const errorMsg = error.response?.data?.error?.message || 'Не получилось запустить.';
        message = `Ошибка паузы: ${errorMsg} Попробуй открыть Spotify и проверить активное устройство.`;
        isError = true;
    }

    return {
        isError,
        message
    }
}

module.exports = { findSongSpotify, findSongFromAlbumSpotify, playTrack, pauseTrack };