
const config = require('config');

const {
  ACTIVE_PROJECTS,
  SEND_TO_PROJECT,
  ACTIVITY_HISTORY,
  MANAGER_JOBS,
  REST_QUEUE,
  PROJECT_QUEUE,
  PROJECT_MSGS,
  WS_SERVICE,
  CONVERTER_SERVICE,
  DEAD_LETTER,
  LOST_MESSAGES,
  MANAGER_SERVICE,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();


module.exports = {

  [SEND_TO_PROJECT]: {
    name: SEND_TO_PROJECT,
    type: 'topic',
    assert: {
      durable: true,
    },
    publish: {
      mandatory: false,
    },
  },

  [PROJECT_MSGS]: {
    name: PROJECT_MSGS,
    type: 'topic',
    assert: {
      durable: true,
      alternateExchange: DEAD_LETTER,
    },
    publish: {
      mandatory: false,
    },
  },

  [MANAGER_SERVICE]: {
    name: MANAGER_SERVICE,
    type: 'fanout',
    assert: {
      durable: true,
    },
    consume: {
      noAck: true,
    },
    publish: {
      mandatory: false,
    },
  },

  [DEAD_LETTER]: {
    name: DEAD_LETTER,
    type: 'fanout',
    assert: {
      durable: true,
    },
    publish: {
      mandatory: false,
    },
  },

  [LOST_MESSAGES]: {
    queueName: LOST_MESSAGES,
    assert: {
      durable: true,
    },
    consume: {
      noAck: true,
    },
    send: {
      persistent: true,
    },
  },

  [WS_SERVICE]: {
    name: WS_SERVICE,
    type: 'fanout',
    assert: {
      durable: true,
    },
    consume: {
      noAck: true,
    },
    publish: {
      mandatory: false,
    },
  },

  [ACTIVE_PROJECTS]: {
    queueName: ACTIVE_PROJECTS,
    assert: {
      durable: true,
    },
    consume: {
      noAck: false,
    },
    send: {
      persistent: true,
    },
  },

  [ACTIVITY_HISTORY]: {
    queueName: ACTIVITY_HISTORY,
    assert: {
      durable: true,
    },
    consume: {
      noAck: false,
    },
    send: {
      persistent: true,
    },
  },

  [MANAGER_JOBS]: {
    queueName: MANAGER_JOBS,
    assert: {
      durable: true,
    },
    consume: {
      noAck: true,
    },
    send: {
      persistent: true,
    },
  },

  [REST_QUEUE]: {
    assert: {
      exclusive: true,
    },
    consume: {
      noAck: true,
    },
    send: {
      persistent: true,
    },
  },

  [CONVERTER_SERVICE]: {
    queueName: CONVERTER_SERVICE,
    assert: {
      durable: true,
    },
    consume: {
      noAck: false,
    },
    send: {
      persistent: true,
    },
  },

  [PROJECT_QUEUE]: {
    timeout: +config.WebSocketConnectionService.connection.disconnect_time,
    assert: {
      expires: +config.ManagerService.projectsWatcher.disconnectTimeout,
    },
  },
};
