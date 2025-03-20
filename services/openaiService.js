const axios = require('axios');
const config = require('../config/config');
const { getPrompt } = require("../src/utils");

async function getRandomWords(words) {
    const initialResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: getPrompt(words),
                },
            ],
            max_tokens: 20,
        },
        {
            headers: {
                Authorization: `Bearer ${config.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });
    const initialMessage = initialResponse.data.choices[0].message;

    console.log(initialMessage)
    return initialMessage.content
}

module.exports = { getRandomWords };