// Vercel entry point. vercel.json sends /api/*, /admin and /admin/* here;
// the website pages, images, CSS and JS are served straight from /public by Vercel's CDN.
const { handler } = require('../server');

module.exports = (req, res) => handler(req, res);
