const config = require("../config/config");
const path = require("path");
const currentYear = new Date().getFullYear();
const DESCRIPTION = `Установленное ограничение на количество запросов в день: ${config.GLOBAL_LIMIT}`;
const COMMANDS_ALL = [
    { cmd: '/track', description: 'рандомный трек' },
    { cmd: '/fresh', description: `рандомный трек ${currentYear} года` },
    { cmd: '/ultra_fresh', description: 'рандомный трек за последние две недели' },
    { cmd: '/hipster', description: 'рандомный трек с низкой популярностью' },
    { cmd: '/genre', description: 'рандомный трек в указанном жанре, например /genre rock' },
    { cmd: '/play', description: 'запустить последний трек на активном устройстве (нужен премиум Spotify)' },
    { cmd: '/help', description: 'все команды' },
    { cmd: '/long_title', description: 'рандомный трек c длинным названием (рофлофункция)' },
    { cmd: '/playfrom', description: 'запустить последний трек с указанной минуты, например /playfrom 1:00 (нужен премиум Spotify)' },
    { cmd: '/pause', description: 'поставить текущий трек на паузу (нужен премиум Spotify)' },
    { cmd: '/auth', description: 'авторизоваться в Spotify (нужен премиум Spotify)' },
    { cmd: '/like', description: 'добавить последний трек в любимые (нужен премиум Spotify)' },
    { cmd: '/logout', description: 'выйти из аккаунта Spotify' },
    { cmd: '/last_requests', description: 'данные последнего поиска' },
    { cmd: '/info', description: 'информация о боте' },
];
const COMMANDS = [
    COMMANDS_ALL[0],
    COMMANDS_ALL[1],
    COMMANDS_ALL[2],
    COMMANDS_ALL[3],
    COMMANDS_ALL[4],
    COMMANDS_ALL[6],
    COMMANDS_ALL[7],
    COMMANDS_ALL[14],
]
const ALL_COMMANDS_TEXT = COMMANDS.map(c => `${c.cmd} - ${c.description}`).join('\n');
const pageSize = 10;
const pngLogo = path.join(__dirname, '../files/1.png');

module.exports = {
    DESCRIPTION, ALL_COMMANDS_TEXT, COMMANDS, COMMANDS_ALL, currentYear, pageSize, pngLogo
}