const axios = require('axios');
const config = require('../config/config');

let accessToken = null;

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
    }
}

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

async function findSongSpotify({q, offset}) {
    if (!accessToken) {
        const token = await getAccessToken();
        if (!token) return null;
    }

    try {
        const response = await axios.get(`https://api.spotify.com/v1/search`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                q,
                type: 'track',
                limit: 1,
                offset
                // market: 'AU',
            },
            responseType: 'json',
        });

        if (response.data.tracks && response.data.tracks.items.length > 0) {
            const track = response.data.tracks.items[0];
         //   console.log(response.data.tracks.items[0].name, response.data.tracks.items[0].artists?.map(a => a.name))
            const result = getTrackParam(track);
        //    console.log(result.popularity)
            return result;
        }
        return null;
    } catch (error) {
        console.error('Spotify Search Error:', error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response && error.response.status === 401) {
            console.log('Token expired, refreshing...');
            accessToken = await getAccessToken();
            return findSongSpotify({q, offset});
        }
        return null;
    }
}

async function findSongFromAlbumSpotify({q, offset}) {
    if (!accessToken) {
        const token = await getAccessToken();
        if (!token) return null;
    }

    try {
        let albumResponse = null;

        while (!albumResponse?.data?.albums?.items?.length) {
            albumResponse = await axios.get(`https://api.spotify.com/v1/search`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                params: {
                    q,
                    type: 'album',
                    limit: 1,
                    offset,
                },
                responseType: 'json',
            });
            !albumResponse?.data?.albums?.items?.length && console.log('NET OLBOMOF')
        }

        const album = albumResponse.data?.albums?.items[0];

        const albumId = album.id;

        const tracksResponse = await axios.get(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                limit: 50,
            },
            responseType: 'json',
        });

        const tracks = tracksResponse.data.items;
        const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

        const trackResponse = await axios.get(`https://api.spotify.com/v1/tracks/${randomTrack.id}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            responseType: 'json',
        });

        const track = trackResponse.data;

        console.log(track.name, track.artists?.map(a => a.name), track.popularity)
        const result = getTrackParam(track);
        return result;
    } catch (error) {
        console.error('Spotify Search Error:', error.response ? `${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message);
        if (error.response && error.response.status === 401) {
            console.log('Token expired, refreshing...');
            accessToken = await getAccessToken();
            return findSongSpotify({q, offset});
        }
        return null;
    }
}

module.exports = {findSongSpotify, findSongFromAlbumSpotify};