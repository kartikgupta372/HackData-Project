// Vercel entry point: runs the Express backend as a serverless function.
// vercel.json rewrites /auth/*, /chat/*, … here as /api/index?__p=<original path>.
const { app } = require('../backend/src/app');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://internal');
  const original = url.searchParams.get('__p');
  if (original) {
    url.searchParams.delete('__p');
    const qs = url.searchParams.toString();
    req.url = original + (qs ? `?${qs}` : '');
  }
  return app(req, res);
};
