const express = require('express');
const Groq = require('groq-sdk');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Function to scrape content from a provided URL
async function scrapeContent(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        const title = $('.articleHD').text().trim();
        const image = $('.article-img img').attr('src');
        const content = $('.category_desc p').text().trim();

        return { title, image, content };
    } catch (error) {
        console.error('Error scraping content:', error);
        throw error;
    }
}

// Function to fetch and scrape the JSON data with a dynamic category ID
async function fetchAndScrapeData(categoryId = 1) {
    try {
        const response = await axios.get(`https://www.andhrajyothy.com/cms/articles/category/${categoryId}`);
        return response.data; // Assuming the response is JSON
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

// Route to serve the latest Telugu news with a dynamic category ID
app.get('/latestnewstelugu', async (req, res) => {
    const categoryId = req.query.categoryId || 1;
    try {
        const data = await fetchAndScrapeData(categoryId);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Route to scrape content from a provided URL and send it to Groq AI
app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const scrapedData = await scrapeContent(url);
        const { title, image, content } = scrapedData;

        // Use the scraped content as the query for Groq AI
        const stream = await getGroqChatStream(content);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        res.write(`data: ${JSON.stringify({ title, image })}\n\n`);

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }

        res.end();
    } catch (error) {
        res.status(500).json({ error: 'Failed to scrape content or get AI response' });
    }
});

async function getGroqChatStream(userQuestion) {
  return groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a helpful news writer named 3lok news AI Assistent, and you are created by a company called 3Lok.",
      },
      {
        role: "user",
        content: `${userQuestion} Rewrite this content above 4000 words using differnt sentences without changing the core meaning in Telugu`,
      },
    ],
    model: "llama-3.1-70b-versatile",
    temperature: 0.5,
    max_tokens: 8000,
    top_p: 0.5,
    stop: null,
    stream: true,
  });
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
