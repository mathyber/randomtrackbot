const config = require("../config/config");
const { saveUserRequest } = require("../storage/jsonStorage");
const { findSongSpotify, findSongFromAlbumSpotify } = require("../services/spotifyService");

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

<i>Запросы: </i>
${res.logData?.map(({data, attempts}) => {
        const isLast = attempts === res.logData.length;
        return `q: ${data.q}, offset: ${data.offset}, ${!isLast ? 'неудачный поиск' : 'найден трек'}`
    }).join('\n')}

@${botNickname}
    `.trim();
};

function getOffset() {
    return Math.floor(Math.random() * 1000);
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
    let weights = Array.from({ length: totalYears }, (_, i) => Math.pow(i + 1, 2));
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

    const offset = getOffset();

    if (tag) {
        q = `tag:${tag}`;
        return { q, offset };
    }


    const latinVowels = ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ä', 'ö', 'ü', 'å', 'æ', 'ø'];
    const latinConsonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'ñ', 'ç', 'ß', 'ğ', 'ş'];

    // Кириллица (расширенная)
    const cyrillicVowels = ['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я', 'є', 'і', 'ї', 'ө', 'ү'];
    const cyrillicConsonants = ['б', 'в', 'г', 'д', 'ж', 'з', 'к', 'л', 'м', 'н', 'п', 'р', 'с', 'т', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ґ', 'ў', 'ј', 'љ', 'њ', 'ћ', 'џ', 'ғ', 'қ', 'ң'];

    // Цифры
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    // Другие языки
    const chineseChars = ['爱', '我', '你', '好', '天']; // Частые иероглифы
    const japaneseChars = ['あ', 'い', 'う', 'ア', 'イ', 'ウ', '日', '本']; // Хирагана, катакана, кандзи
    const koreanChars = ['가', '나', '다', '마', '바']; // Хангыль
    const arabicChars = ['ا', 'ب', 'ت', 'د', 'ر']; // Арабский
    const devanagariChars = ['क', 'ख', 'ग', 'च', 'ज']; // Деванагари

    // Тип запроса: 0 - цифра, 1 - 1 символ, 2 - 2 символа, 3 - 3 символа
    const queryType = Math.floor(Math.random() * 4);

    // Взвешенный выбор письменности
    const rand = Math.random();

    if (rand < 0.7) alphabet = 'latin';          // 70% - латиница (английский + др.)
    else if (rand < 0.85) alphabet = 'cyrillic'; // 15% - кириллица (русский + др.)
    else if (rand < 0.90) alphabet = 'chinese';  // 5% - китайский
    else if (rand < 0.95) alphabet = 'japanese'; // 5% - японский
    else if (rand < 0.975) alphabet = 'korean';  // 2.5% - корейский
    else if (rand < 0.99) alphabet = 'arabic';   // 1.5% - арабский
    else alphabet = 'devanagari';                // 1% - деванагари

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
    } else if (queryType === 2) {
        if (alphabet === 'latin') {
            q = mergeRandomStrings(latinConsonants, 1, latinVowels, 1);
        } else if (alphabet === 'cyrillic') {
            q = mergeRandomStrings(cyrillicConsonants, 1, cyrillicVowels, 1);
        } else {
            // Для других языков берём два случайных символа
            const chars = alphabet === 'chinese' ? chineseChars : alphabet === 'japanese' ? japaneseChars : alphabet === 'korean' ? koreanChars : alphabet === 'arabic' ? arabicChars : devanagariChars;
            q = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
        }
    } else if (queryType === 3) {
        const randomNum = Math.floor(Math.random() * 2) + 1;
        if (alphabet === 'latin') {
            q = mergeRandomStrings(latinConsonants, randomNum, latinVowels, 3-randomNum);
        } else if (alphabet === 'cyrillic') {
            q = mergeRandomStrings(cyrillicConsonants, randomNum, cyrillicVowels, 3-randomNum);
        } else {
            // Для других языков три случайных символа
            const chars = alphabet === 'chinese' ? chineseChars : alphabet === 'japanese' ? japaneseChars : alphabet === 'korean' ? koreanChars : alphabet === 'arabic' ? arabicChars : devanagariChars;
            q = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
        }
    }

    const tags = ['hipster', 'new'];

    if (!tag && Math.random() < 0.2) {
        q += ` tag:${getRandomElements(tags, 1)[0]}`;
    }

    if (!tag && Math.random() < 0.4) {
        q += ` year:${getRandomWeightedYear()}`;
    }

    if (year) {
        q += ` year:${year}`
    }

    if (genre) {
        q += ` genre:${genre}`
    }

    return { q, offset };
}

async function getRandomTrack(ctx, year, tag, genre, onlyLongTitle = false) {
    let spotifyData = null;
    let attempts = 0;
    const maxAttempts = !onlyLongTitle ? 10 : 1000;
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
        saveUserRequest(ctx.from.id, `${ctx.from.username} - ${data.q} ${data.offset}: ${!!spotifyData}`);
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

    if (!spotifyData?.img) {
        console.log(`Failed to find track with image after ${maxAttempts} attempts`);
    }

    return spotifyData;
}

module.exports = { getOffset, getPostTrackResult, generateRandomSpotifyQuery, getRandomTrack };