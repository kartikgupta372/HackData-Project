const writers = new Map();

function setWriter(threadId, res) {
  writers.set(threadId, res);
}

function getWriter(threadId) {
  return writers.get(threadId) ?? null;
}

function removeWriter(threadId) {
  writers.delete(threadId);
}

function emit(threadId, event, data) {
  const writer = writers.get(threadId);
  if (writer && !writer.writableEnded) {
    writer.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

module.exports = { setWriter, getWriter, removeWriter, emit };
