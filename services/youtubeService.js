const { google } = require('googleapis');
const config = require('../config/config');

const youtube = google.youtube({
    version: 'v3',
    auth: config.YOUTUBE_API_KEY,
});

async function findSongYouTubeByIsrc(isrc) {
    try {
        const response = await youtube.search.list({
            q: `${isrc}`,
            part: 'id,snippet',
           // type: 'video',
            maxResults: 1,
        });
        if (response.data.items.length > 0) {
            return `https://www.youtube.com/watch?v=${response.data.items[0].id.videoId}`;
        }
        return null;
    } catch (error) {
        console.error('YouTube API error:', error);
        return null;
    }
}

module.exports = { findSongYouTubeByIsrc };