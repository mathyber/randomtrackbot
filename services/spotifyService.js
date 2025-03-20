const axios = require('axios');
const config = require('../config/config');

let accessToken = null;

async function getAccessToken() {
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
        console.log('Spotify Access Token obtained:', accessToken);
        return accessToken;
    } catch (error) {
        console.error('Spotify Token Error:', error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        return null;
    }
}

async function findSongSpotify(keywordsData) {
    if (!accessToken) {
        console.log('No access token, attempting to get one...');
        const token = await getAccessToken();
        if (!token) return null;
    }

    try {
        const query = keywordsData.trim();
        console.log('Spotify Query (raw):', query);

        const response = await axios.get(`https://api.spotify.com/v1/search`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                q: keywordsData,
                type: 'track',
                limit: 1,
                // market: 'AU',
            },
            responseType: 'json', // Явно указываем тип ответа
        });

        // console.log('Spotify Raw Response (before parse):', JSON.stringify(response.data, null, 2));
        if (response.data.tracks && response.data.tracks.items.length > 0) {
            const track = response.data.tracks.items[0];
            console.log(track)

            // Явное декодирование
            const result = {
                title: Buffer.from(track.name, 'utf8').toString('utf8'), // Принудительное декодирование
                artists: track.artists.map(a => Buffer.from(a.name, 'utf8').toString('utf8')),
                img: track.album?.images[0]?.url,
                release_date: track.album?.release_date,
                link: track.external_urls?.spotify,
                isrc: track.external_ids.isrc
            };
            console.log('Spotify Parsed Data:', result);
            return result;
        }
        console.log('No tracks found for query:', query);
        return null;
    } catch (error) {
        console.error('Spotify Search Error:', error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response && error.response.status === 401) {
            console.log('Token expired, refreshing...');
            accessToken = await getAccessToken();
            return findSongSpotify(keywordsData);
        }
        return null;
    }
}

module.exports = {findSongSpotify};