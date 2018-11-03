const Core = require('./Core');
const config = require('config');
const settings = require('./settings');

const {
  REST_QUEUE,
  SEND_TO_PROJECT,
  CONVERTER_SERVICE,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

class Converter extends Core {
  // eslint-disable-next-line no-useless-constructor
  constructor(options) {
    super(options);

    Object.assign(this, {
      SEND_TO_PROJECT: settings[SEND_TO_PROJECT].name,
      CONVERTER_SERVICE: settings[CONVERTER_SERVICE].name,
    });

    this.on('connect', this.init.bind(this));
  }

  init(/* isReconnect */) {
    const { channel } = this;
    const { assert, consume } = settings[REST_QUEUE];

    channel.assertQueue(CONVERTER_SERVICE, settings[CONVERTER_SERVICE].assert, () => {
      channel.assertQueue('', assert, (err, q) => {
        this.queue = q.queue;

        this.listenQueue(this.queue, consume, this.onMessage.bind(this));
        this.listenQueue(
          CONVERTER_SERVICE, settings[CONVERTER_SERVICE].consume, this.onMessage.bind(this));
      });
    });
  }

  onMessage(msg) {
    const { jobName, payload, meta } = msg;
    const { system } = msg;

    if (system) return this.emit('system', msg);
    this.emit(jobName, payload, meta);
  }

  getPrivateQueueId() {
    return this.queue;
  }
}

module.exports = options => new Converter(options);
