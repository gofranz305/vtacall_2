const { NODE_ENV } = require('./config');
const { redactForLog } = require('./crypto');

function structuredLog(level, event, meta = {}) {
  const safeMeta = redactForLog(meta);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeMeta
  };
  if (NODE_ENV !== 'test') {
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
  return entry;
}

module.exports = {
  info: (event, meta) => structuredLog('info', event, meta),
  warn: (event, meta) => structuredLog('warn', event, meta),
  error: (event, meta) => structuredLog('error', event, meta),
  security: (event, meta) => structuredLog('warn', `SECURITY:${event}`, meta)
};

