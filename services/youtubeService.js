const {google} = require('googleapis');
const config = require('../config/config');

const youtube = google.youtube({
    version: 'v3',
    auth: config.YOUTUBE_API_KEY,
});

async function findSongYouTubeByIsrc(isrc, data) {
    try {
        const response = await youtube.search.list({
            q: `${isrc}`,
            part: 'id,snippet',
            type: 'video',
            maxResults: 1,
            videoCategoryId: 10
        });

        if ((data && response.data?.items?.[0]?.snippet?.title.includes(data.title)) || !data) {
            return `https://www.youtube.com/watch?v=${response.data.items[0].id.videoId}`;
        }
        return null;
    } catch (error) {
        // console.error('YouTube API error:', error);
        return null;
    }
}

module.exports = {findSongYouTubeByIsrc};