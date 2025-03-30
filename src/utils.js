const config = require("../config/config");
const { saveUserRequest, allUsers } = require("../storage/jsonStorage");
const { findSongSpotify, findSongFromAlbumSpotify } = require("../services/spotifyService");
const {ALL_COMMANDS_TEXT, DESCRIPTION} = require("../const/const");

function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return `${day}.${month?.toString().padStart(2, "0")}.${year}`;
}

const getPostTrackResult = (res, youtubeUrl, limit) => {
    const title = res?.title;
    const artists = res?.artists.join(', ');
    const link = res?.link;
    const releaseDate = res?.release_date && !['0000'].includes(res.release_date) && res.release_date.length > 4 ? formatDate(res.release_date) : (res.release_date || '');
    const botNickname = config.BOT_NICKNAME;

    return `
<b>${title}</b>
by <i>${artists}</i>

${releaseDate}
${link ? `<a href="${link}">Spotify Link</a>\n` : ''}${youtubeUrl ? `<a href="${youtubeUrl}">YouTube Link</a>` : ''}

Осталось запросов сегодня: ${limit || 0}
@${botNickname}
    `.trim();
};


function getInfo() {
    return `
Привет! Это бот, который выдаст тебе ссылку Spotify на рандомный трек. Иногда возникает ситуация, когда рекомендации музыкальных сервисов, обученные на слушаемом тобой, выдают уже просто одинаковую музыку, от которой устаешь. А где искать новое - не знаешь. Данный бот создан с целью помочь выйти из музыкального пузыря и зоны комфорта - послушать что-то рандомное без привязки к вашим рекомендациям, плейлистам и чему-либо ещё.
            
${ALL_COMMANDS_TEXT}

${DESCRIPTION}

Бота создал <a href="https://t.me/laritov">Laritovski</a> по приколу и от нечего делать. 
По вопросам, касаемым бота, можно написать в комментариях канала
        `
}

function getLastRequestsText(res, text = 'Запросы для последнего поиска: ', addData) {
  return `<i>${text}</i>
<blockquote>${res?.map(({data, attempts, userName}) => {
      const isLast = attempts === res.length;
      return `${addData ? addData(attempts, userName) : ''}q: ${data.q}, offset: ${data.offset}, ${!isLast ? 'неудачный поиск' : 'найден трек'}`
  }).join('\n')}</blockquote>`
}

function usersAll() {
    const data = allUsers();
    try {
        return `<i>Пользователи (${data?.length}): </i>
${data?.map(({userId, userRequests}) => {
            return `<b>${userId}</b>
${userRequests?.map(userRequest => `${getLastRequestsText(userRequest, '', (a, u) => `${u ? `@${u}` : '[no username]'} (${a}): `)}`).join('')}
`
        }).join('\n')}`
    } catch (e) {
        console.log(e);
        return `<i>Пользователи (${data?.length}))</i>`;
    }

}

function getRandomOffset() {
    return Math.floor(Math.random() * 1000);
}

function getOffset(queryLength) {
    const offsetConfig = {
        lengthThreshold: 4,      // Порог длины строки (от 4 символов)
        lowRangeChance: 0.9,     // 90% шанс на 0-20 для длинных строк
        lowRangeMax: 20,         // Максимум для "низкого" диапазона
        highRangeMax: 1000       // Максимум для "высокого" диапазона
    };

    if (queryLength >= offsetConfig.lengthThreshold) {
        if (Math.random() < offsetConfig.lowRangeChance) {
            return Math.floor(Math.random() * (offsetConfig.lowRangeMax + 1));
        }
    }

    return Math.floor(Math.random() * offsetConfig.highRangeMax);
}

function getRandomElements(arr, count) {
    let shuffled = arr.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function mergeRandomStrings(arr1, count1, arr2, count2) {
    let selected1 = getRandomElements(arr1, count1);
    let selected2 = getRandomElements(arr2, count2);

    let combined = [...selected1, ...selected2];
    combined.sort(() => 0.5 - Math.random());

    return combined.join('');
}

function getRandomWeightedYear() {
    const startYear = 1970;
    const currentYear = new Date().getFullYear();
    const totalYears = currentYear - startYear + 1;

    // Генерируем веса, чем новее год, тем выше вероятность
    let weights = Array.from({ length: totalYears }, (_, i) => Math.pow(i + 1.5, 2));
    weights[0] *= 0.05;
    let sumWeights = weights.reduce((acc, w) => acc + w, 0);

    // Генерация случайного числа в диапазоне суммарных весов
    let rand = Math.random() * sumWeights;

    // Выбор года на основе веса
    let cumulative = 0;
    for (let i = 0; i < totalYears; i++) {
        cumulative += weights[i];
        if (rand < cumulative) {
            return startYear + i;
        }
    }
    return currentYear; // На случай, если что-то пойдет не так
}

function generateRandomSpotifyQuery(year, tag, genre) {
    let alphabet, q = '';

    const latinVowels = ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ä', 'ö', 'ü', 'å', 'æ', 'ø'];
    const latinConsonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'ñ', 'ç', 'ß', 'ğ', 'ş'];
    const cyrillicVowels = ['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я', 'є', 'і', 'ї', 'ө', 'ү'];
    const cyrillicConsonants = ['б', 'в', 'г', 'д', 'ж', 'з', 'к', 'л', 'м', 'н', 'п', 'р', 'с', 'т', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ґ', 'ў', 'ј', 'љ', 'њ', 'ћ', 'џ', 'ғ', 'қ', 'ң'];
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const chineseChars = ['爱', '我', '你', '好', '天'];
    const japaneseChars = ['あ', 'い', 'う', 'ア', 'イ', 'ウ', '日', '本'];
    const koreanChars = ['가', '나', '다', '마', '바'];
    const arabicChars = ['ا', 'ب', 'ت', 'د', 'ر'];
    const devanagariChars = ['क', 'ख', 'ग', 'च', 'ज'];

    const maxLength = tag ? 2 : (genre ? 3 : 5);

    // Тип запроса
    const queryType = Math.floor(Math.random() * maxLength);

    // Взвешенный выбор письменности
    const rand = Math.random();
    if (rand < 0.7) alphabet = 'latin';
    else if (rand < 0.85) alphabet = 'cyrillic';
    else if (rand < 0.90) alphabet = 'chinese';
    else if (rand < 0.95) alphabet = 'japanese';
    else if (rand < 0.975) alphabet = 'korean';
    else if (rand < 0.99) alphabet = 'arabic';
    else alphabet = 'devanagari';

    // Генерация q
    if (queryType === 0) {
        q = digits[Math.floor(Math.random() * digits.length)];
    } else if (queryType === 1) {
        if (alphabet === 'latin') q = [...latinConsonants, ...latinVowels][Math.floor(Math.random() * (latinConsonants.length + latinVowels.length))];
        else if (alphabet === 'cyrillic') q = [...cyrillicConsonants, ...cyrillicVowels][Math.floor(Math.random() * (cyrillicConsonants.length + cyrillicVowels.length))];
        else if (alphabet === 'chinese') q = chineseChars[Math.floor(Math.random() * chineseChars.length)];
        else if (alphabet === 'japanese') q = japaneseChars[Math.floor(Math.random() * japaneseChars.length)];
        else if (alphabet === 'korean') q = koreanChars[Math.floor(Math.random() * koreanChars.length)];
        else if (alphabet === 'arabic') q = arabicChars[Math.floor(Math.random() * arabicChars.length)];
        else q = devanagariChars[Math.floor(Math.random() * devanagariChars.length)];
    } else {
        const length = queryType;
        const randomNum = Math.floor(Math.random() * (length - 1)) + 1;
        if (alphabet === 'latin') {
            q = mergeRandomStrings(latinConsonants, randomNum, latinVowels, length-randomNum);
        } else if (alphabet === 'cyrillic') {
            q = mergeRandomStrings(cyrillicConsonants, randomNum, cyrillicVowels, length-randomNum);
        } else {
            // Для других языков три случайных символа
            const chars = alphabet === 'chinese' ? chineseChars : alphabet === 'japanese' ? japaneseChars : alphabet === 'korean' ? koreanChars : alphabet === 'arabic' ? arabicChars : devanagariChars;
            q = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        }
    }

    const offset = getOffset(q.length); // Передаём длину строки

    const tags = ['hipster', 'new'];

    if (q.length <= 3) {
        if (!tag && Math.random() < 0.3) {
            q += ` tag:${(Math.random() < 0.8) ? tags[0] : tags[1]}`;
        }

        if (!tag && Math.random() < 0.4 && !q.includes('tag:new') && !genre && !year) {
            q += ` year:${getRandomWeightedYear()}`;
        }
    }

    if (tag) {
        q += ` tag:${tag}`;
    }

    if (year) {
        q += ` year:${year}`;
    }

    if (genre) {
        q += ` genre:${genre}`;
    }

    return { q, offset };
}

async function getRandomTrack(ctx, year, tag, genre, onlyLongTitle = false) {
    let spotifyData = null;
    let attempts = 0;
    const maxAttempts = !onlyLongTitle ? 50 : 1000;
    const antiClassic = !onlyLongTitle && !['classical', 'instrumental'].includes(genre)

    const lengthFilter = (length) => {
        if (antiClassic) {
            return length >= config.ANTI_CLASSIC_MAX_LENGTH_TITLE_FILTER
        }
        if (onlyLongTitle) {
            return length <= config.ANTI_CLASSIC_MAX_LENGTH_TITLE_FILTER
        }
        return false;
    }

    const historyQ = [];

    while ((!spotifyData?.img || lengthFilter(spotifyData?.title?.length)) && (attempts < maxAttempts)) {
        const data = generateRandomSpotifyQuery(year, tag, genre);
        spotifyData = tag ? await findSongFromAlbumSpotify(data) : await findSongSpotify(data);
        attempts++;

        const logHistory = {
            data,
            attempts
        }
        historyQ.push(logHistory)

        if (spotifyData?.img) {
            spotifyData.logData = historyQ
        }
    }

    saveUserRequest(ctx.from.id, spotifyData?.logData, ctx.from.username);

    if (!spotifyData?.img) {
        console.log(`Failed to find track with image after ${maxAttempts} attempts`);
    }

    return spotifyData;
}

module.exports = { getOffset, getPostTrackResult, generateRandomSpotifyQuery, getRandomTrack, getLastRequestsText, getInfo, usersAll };