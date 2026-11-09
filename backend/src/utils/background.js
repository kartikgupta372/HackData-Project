// Run work after the HTTP response has been sent.
//
// On a normal server (Docker/Railway) this is just "fire and forget".
// On Vercel the function would be frozen as soon as the response ends, so we
// register the promise with waitUntil() to keep it alive until it finishes.

function runInBackground(label, task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => console.warn(`[background:${label}] ${err?.message || err}`));

  if (process.env.VERCEL) {
    try {
      require('@vercel/functions').waitUntil(promise);
    } catch { /* not on Vercel's runtime */ }
  }
  return promise;
}

module.exports = { runInBackground };
