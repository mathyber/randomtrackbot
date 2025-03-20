const config = require("../config/config");
const log = (message) => {
    console.log(`[LOG] ${message}`);
};

function getPrompt(words) {
    return `
Ты - мегасловарь всех языков мира. Выдай одно любое слово на любом языке мира, старайся брать не самые очевидные слова. Выдай только это слово без каких-либо пояснений, так же не указывай язык, просто выдай слово.

НЕ ВЫДАВАЙ ЭТИ СЛОВА: fuck, ${words?.join(', ')}
`;
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return `${day}.${month?.toString().padStart(2, "0")}.${year}`;
}

const getPostTrackResult = (res, youtubeUrl, limit) => {
    const title = res.title;
    const artists = res.artists.join(', ');
    const link = res.link;
    const releaseDate = res.release_date && !['0000'].includes(res.release_date) && res.release_date.length > 4 ? formatDate(res.release_date) : (res.release_date || '');
    const botNickname = config.BOT_NICKNAME;

    return `
<b>${title}</b>
by <i>${artists}</i>

${releaseDate}
`
+ (link ? `<a href="${link}">Spotify Link</a>
` : '')
+ (youtubeUrl ? `<a href="${youtubeUrl}">YouTube Link</a>
` : '')
+ `

Осталось запросов сегодня: ${limit || 0}
`
+`
@${botNickname} 
`
}

module.exports = { log, getPrompt, getPostTrackResult };