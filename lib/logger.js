const { NODE_ENV } = require('./config');

function structuredLog(level, event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta
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

