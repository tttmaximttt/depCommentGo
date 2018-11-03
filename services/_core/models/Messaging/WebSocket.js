const Core = require('./Core');
const config = require('config');

const {
  SEND_TO_PROJECT,
  PROJECT_MSGS,
  WS_PDF,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

let instance = false;

class WebSocket extends Core {

  constructor(options) {
    super(options);
    this.on('connect', this.init.bind(this));

    this.bindings = {
      [SEND_TO_PROJECT]: [],
    };
  }

  init(isReconnect) {
    if (!isReconnect) {
      this.prepareExchange(SEND_TO_PROJECT);
      this.prepareExchange(PROJECT_MSGS);
    } else {
      this.resetChannelData();
    }

    this.subscribe(SEND_TO_PROJECT, (routingKey, data) => {
      const projectId = routingKey.split('.').pop();

      this.emit('message', projectId, data, () =>
        this.bindings[SEND_TO_PROJECT].forEach(_routingKey =>
            this.bindKey(SEND_TO_PROJECT, _routingKey, false)));
    });
  }

  resetChannelData() {
    delete this.exchangeQueues[SEND_TO_PROJECT];
  }

  bindClient(projectId) {
    this.bindKey(SEND_TO_PROJECT, `${WS_PDF}.${projectId}`, true);
  }

  removeClient(projectId) {
    this.unbindKey(SEND_TO_PROJECT, `${WS_PDF}.${projectId}`);
  }
}

module.exports = (options, implOptions) => {
  if (!instance) {
    instance = new WebSocket(options, implOptions);
  }

  return instance;
};
