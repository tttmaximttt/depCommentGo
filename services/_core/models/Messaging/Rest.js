const Core = require('./Core');
const config = require('config');
const settings = require('./settings');

const {
  REST_QUEUE,
  MANAGER_JOBS,
  ACTIVITY_HISTORY,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

// const { REST } = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

class Rest extends Core {
  // eslint-disable-next-line no-useless-constructor
  constructor(options) {
    super(options);

    this.on('connect', this.init.bind(this));
  }

  init(/* isReconnect */) {
    const { channel } = this;
    const { assert, consume } = settings[REST_QUEUE];

    channel.assertQueue('', assert, (err, q) => {
      this.queue = q.queue;

      this.listenQueue(this.queue, consume, this.onMessage.bind(this));
    });
  }

  onMessage(msg) {
    const { jobName, payload, meta } = msg;

    this.emit(jobName, payload, meta);
  }

  pushManagerJob(jobName, payload, meta = {}) {
    const { queueName, send } = settings[MANAGER_JOBS];
    const message = Buffer.from(JSON.stringify({ jobName, payload, meta }));

    this.channel.sendToQueue(queueName, message, send);
  }

  emitActivityHistoryMessage(data) {
    const { send, queueName } = settings[ACTIVITY_HISTORY];
    const message = Buffer.from(JSON.stringify(data));

    this.channel.sendToQueue(queueName, message, send);
  }
}

module.exports = options => new Rest(options);
