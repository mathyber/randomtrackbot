const fs = require('fs');
const path = require('path');
const config = require("../config/config");

const userRequestsFile = path.join(__dirname, '../data/userRequests.json');
const userLimitsFile = path.join(__dirname, '../data/userLimits.json');

let userRequests = {};
let userLimits = {};

// Загружаем данные из файлов
if (fs.existsSync(userRequestsFile)) {
    userRequests = JSON.parse(fs.readFileSync(userRequestsFile, 'utf8'));
}
if (fs.existsSync(userLimitsFile)) {
    userLimits = JSON.parse(fs.readFileSync(userLimitsFile, 'utf8'));
}

function allUsers() {
    return Object.keys(userRequests).map(userId => ({
        userId,
        userRequests: userRequests[userId]
    }))
}

function saveUserRequest(userId, requests) {
    try {
        if (!Array.isArray(requests)) {
            throw new Error('requests must be an array'); // Проверка на массив
        }

        if (!userRequests[userId]) {
            userRequests[userId] = [];
        }

        // Добавляем массив объектов с текущим timestamp
        const timestamp = new Date().toISOString();
        const requestArray = requests.map(req => ({ ...req, time: timestamp }));
        userRequests[userId].push(requestArray);

        fs.writeFileSync(userRequestsFile, JSON.stringify(userRequests, null, 2));
    } catch (e) {
        console.error(e);
    }
}

// Вытаскиваем последний массив запросов для юзера
function getLastUserRequests(userId) {
    if (!userRequests[userId] || userRequests[userId].length === 0) {
        return null; // Если нет запросов — null
    }

    return userRequests[userId][userRequests[userId].length - 1];
}

// Активируем премиум на 30 дней
function activatePremium(userId) {
    if (!userLimits[userId]) {
        userLimits[userId] = {
            count: 0,
            lastReset: new Date().toISOString(),
        };
    }

    const now = new Date();
    const premiumUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

    userLimits[userId].premiumUntil = premiumUntil.toISOString();
    fs.writeFileSync(userLimitsFile, JSON.stringify(userLimits, null, 2));
}

// Проверяем, активен ли премиум
function isPremium(userId) {
    if (!userLimits[userId] || !userLimits[userId].premiumUntil) {
        return false;
    }

    const now = new Date();
    const premiumUntil = new Date(userLimits[userId].premiumUntil);
    return now < premiumUntil;
}

// Проверяем лимиты пользователя
function checkUserLimit(userId) {
    if (!userLimits[userId]) {
        userLimits[userId] = {
            count: 0,
            lastReset: new Date().toISOString(),
        };
    }

    const now = new Date();
    const lastReset = new Date(userLimits[userId].lastReset);
    const oneDayInMs = 24 * 60 * 60 * 1000;

    // Сбрасываем счетчик, если прошло 24 часа
    if (now - lastReset > oneDayInMs) {
        userLimits[userId].count = 0;
        userLimits[userId].lastReset = now.toISOString();
    }

    // Определяем лимит в зависимости от статуса
    const dailyLimit = isPremium(userId) ? config.PREMIUM_LIMIT : config.GLOBAL_LIMIT;

    // Проверяем, превышен ли лимит
    if (userLimits[userId].count >= dailyLimit) {
        return { allowed: false, remaining: 0, dailyLimit };
    }

    return { allowed: true, remaining: dailyLimit - userLimits[userId].count, dailyLimit };
}

// Увеличиваем счетчик запросов
function incrementUserRequest(userId) {
    if (!userLimits[userId]) {
        userLimits[userId] = {
            count: 0,
            lastReset: new Date().toISOString(),
        };
    }

    userLimits[userId].count += 1;
    fs.writeFileSync(userLimitsFile, JSON.stringify(userLimits, null, 2));
}

function premiumUntil(userId) {
    return new Date(userLimits[userId]?.premiumUntil)?.toLocaleDateString();
}

module.exports = {
    saveUserRequest,
    checkUserLimit,
    incrementUserRequest,
    activatePremium,
    premiumUntil,
    isPremium,
    getLastUserRequests,
    allUsers
};