const decode = require('./upstream.cjs');
// Preserve query-string 7's legacy plus-to-space behavior, including fragments.
module.exports = input => decode(typeof input === 'string' ? input.replace(/\+/g, ' ') : input);
