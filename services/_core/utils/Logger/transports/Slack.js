const request = require('request');
const prettyjson = require('prettyjson');
const Transport = require('winston-transport');

const defaults = {};

class Slack extends Transport {
  constructor(opts) {
    super(opts);
    this.options = Object.assign({}, defaults, opts);
    const { url, level } = this.options;

    if (!url || !level) throw new Error('no slack webhook url');
  }

  log(level, message, meta, callback) {
    if (this.options.level !== level) return;

    setImmediate(() => {
      this.emit('logged', { level, message, meta });
    });

    const { formatter } = this.options;

    const msg = formatter ? formatter({
      message,
      level,
      meta,
    }, false) : {
      level,
      name: process.env.name,
      message,
    };

    this.post(`\`\`\`${prettyjson.render(msg, { noColor: true })}\`\`\``, callback);
  }

  post(text, callback = () => {}) {
    const { url } = this.options;

    request({
      method: 'POST',
      url,
      json: true,
      body: { text },
    }, callback);
  }
}

module.exports = Slack;
