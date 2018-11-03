
const Core = require('./Core');

const settings = require('./settings');

class ActivityHistory extends Core {

  constructor(options) {
    super(options);

    this.on('connect', this.init.bind(this));
  }

  init(/* isReconnect */) {
    const { consume, queueName } = settings.ACTIVITY_HISTORY;

    this.listenQueue(queueName, consume, this.handleActivityMessage.bind(this), true);
  }

  handleActivityMessage(data, handled) {
    if (data.systemEvent) {
      return this.emit('system', data, handled);
    }

    this.emit('activity', data, handled);
  }
}

module.exports = options => new ActivityHistory(options);
