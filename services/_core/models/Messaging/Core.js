const async = require('async');
const config = require('config');

const amqp = require('amqplib/callback_api');
const { EventEmitter } = require('events');

const createLogger = require(`${config.paths.ROOT}/services/_core/utils/Logger`);
const CoreUtils = require('../../utils/CoreUtils');

const coreUtils = new CoreUtils();
const settings = require('./settings');
const Factory = require('./Factory');

const {
  RABBITMQ, PROJECT_MSGS, WS_PDF, SEND_TO_PROJECT, CONVERTER_SERVICE,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

const toMessageHandler = cb => (msg) => {
  if (msg === null) return;

  const data = JSON.parse(msg.content.toString());

  cb(msg.fields.routingKey, data, msg);
};

module.exports = class RabbitMessaging extends EventEmitter {

  constructor(options = {}) {
    super();

    Object.assign(this, { options });

    this.connected = false;
    this.connection = false;
    this.channel = false;
    this.exchangeQueues = {};
    this.isReconnect = false;
    this.disconnectTime = Date.now();
    this.factory = new Factory();

    this.logger = this.createLoggerInstance();
    this.events = {};
  }

  setLogger(LogSystem) {
    this.logSystem = LogSystem;
  }

  connect() {
    this.connected = false;
    const { reconnectTimeout = 1000 } = this.options;

    async.whilst(() => {
      if (!this.channel) {
        const downtime = Date.now() - this.disconnectTime;

        this.info({ message: 'connecting to rabbitmq', downtime });
        return true;
      }
      return false;
    }, cb => this.connectAttempt(cb, reconnectTimeout), (err) => {
      if (err) {
        throw new Error(`connection error - ${err}`);
      } else {
        const downtime = Date.now() - this.disconnectTime;

        this.info({ message: 'Connection to rabbitmq - SUCCESS', downtime });
        this.connected = true;
        this.disconnectTime = 0;

        this.emit('connect', this.isReconnect);

        this.isReconnect = true;
      }
    });
  }

  connectAttempt(callback, reconnectTimeout) {
    const { options } = this;

    const {
      login = 'guest',
      password = 'guest',
      host = 'localhost',
      port = '5672',
      vhost = '',
      heartbeat = '0',
    } = options || {};

    async.waterfall([
      next => amqp.connect(
        `amqp://${login}:${password}@${host}:${port}/${vhost}?heartbeat=${heartbeat}`,
        next
      ),
      (conn, next) => {
        this.connection = conn;

        this.connection.on('error', (error) => {
          this.error({ error, message: 'connection error' });
        });

        this.connection.on('close', () => {
          this.info({ message: 'connection closed' });
        });

        this.connection.createConfirmChannel(next);
      },
      (ch, next) => {
        this.channel = ch;
        this.channel.consumerTags = {};
        this.channel.healthy = true;

        this.channel.once('error', (error) => {
          this.error({ error, message: 'main channel error' });
          this.channel = null;
        });

        this.channel.once('close', () => {
          this.info({ message: 'main channel closed' });
          this.emit('channel-closed');
          // We keep link to this channel within each ack message.
          // Need to know it's bad not to ack it
          ch.healthy = false;
          this.channel = null;

          this.connection.close();
          this.disconnectTime = Date.now();

          this.connected = false;
          setTimeout(this.connect.bind(this), options.reconnectTimeout);
        });

        this.initActivityHistory(next);
      },
    ], (err) => {
      if (err) {
        setTimeout(callback, reconnectTimeout);
      } else {
        callback(null);
      }
    });
  }

  createLoggerInstance() {
    const loggerInstance = createLogger();
    const { path, nameTemplate, rotateInterval } = config.LogSystem;

    loggerInstance.updateFileLoggers(path, nameTemplate);
    setInterval(() => loggerInstance.updateFileLoggers(path, nameTemplate), rotateInterval);
    return loggerInstance;
  }

  assertMainChannel() {
    return new Promise((resolve) => {
      if (this.channel) {
        resolve(this.channel);
      } else {
        this.once('connect', () => resolve(this.channel));
      }
    });
  }

  listenQueue(queue, consumeConfig, messageHandler, exitOnClose = false) {
    this.assertMainChannel()
      .then((channel) => {
        channel.consume(queue, (msg) => {
          if (!msg) {
            if (exitOnClose) {
              this.info({ message: `queue ${queue} was closed, exiting with code 3` });
              process.exit(3);
            } else {
              this.info({ message: `queue ${queue} was closed` });
            }

            return; // queue was closed
          }
          const data = JSON.parse(msg.content.toString());

          data._routingKey = msg.fields.routingKey;

          messageHandler(data, (error) => {
            if (!consumeConfig.noAck) {
              if (!error) {
                if (!channel.healthy) {
                  this.info({
                    message: 'Message not acked because of channel change',
                    data,
                  });
                } else {
                  channel.ack(msg);
                }
              } else {
                this.error({ error, message: 'message callback error', queue });
                channel.nack(msg);
              }
            }
          });
        }, consumeConfig, (err, ok) => {
          if (err) {
            return this.error({ queue, message: 'failed connecting to queue' });
          }
          channel.consumerTags[queue] = ok.consumerTag;
        });
      });
  }

  async cancelQueueListening(queueName) {
    const channel = await this.assertMainChannel();
    const tag = channel.consumerTags[queueName];

    if (!tag) throw new Error('failed canceling queue consumption');
    return new Promise((res, rej) => channel.cancel(tag, (err, ok) => {
      if (!err) res(ok);
      else rej(err);
    }));
  }

  sendToProjectQueue(projectId, data) {
    const key = `${WS_PDF}.${projectId}`;

    if (!data.timestamp) data.timestamp = Date.now();
    return this.publish(PROJECT_MSGS, key, data);
  }

  sendToProject(projectId, data, callback = () => {}) {
    this.publish(SEND_TO_PROJECT, `${WS_PDF}.${projectId}`, data, callback);
  }

  initActivityHistory(callback) {
    const { assert, queueName } = settings.ACTIVITY_HISTORY;

    this.assertMainChannel()
      .then(channel => channel.assertQueue(queueName, assert, callback));
  }

  prepareExchange(name) {
    const { type, assert } = settings[name];

    this.assertMainChannel()
      .then(channel =>
        channel.assertExchange(name, type, assert, error =>
          error && this.error({
            message: `failed to assert exchange (${name}) - ${error}`,
            exchange: name,
            error,
          })
        )
      );
  }

  error(data) {
    if (data.error) {
      data.error = coreUtils.stringifyError(data.error);
    }
    this.logger.error(RABBITMQ, data);
  }

  info(data) {
    this.logger.debug(RABBITMQ, data);
  }

  subscribe(exchangeName, listener, callback = () => {}) {
    const { consume } = settings[exchangeName];

    this.assertMainChannel().then((channel) => {
      if (!this.exchangeQueues[exchangeName]) {
        channel.assertQueue('', { exclusive: true }, (err, q) => {
          if (err) {
            this.error({
              exchangeName,
              error: err,
              message: 'error when asserting queue',
            });

            return callback(err);
          }

          this.exchangeQueues[exchangeName] = q.queue;

          channel.consume(q.queue, (msg) => {
            toMessageHandler(listener)(msg);
          }, consume);

          callback(null, q.queue);
        });
      } else {
        const error = `duplicate subscribe call for ${exchangeName}`;

        this.error({ error });
        callback(error);
      }
    });
  }

  logActivity(data) {
    try {
      const { send, queueName } = settings.ACTIVITY_HISTORY;
      const msg = Buffer.from(JSON.stringify(data));

      return this.assertMainChannel()
        .then(channel => channel.sendToQueue(queueName, msg, send));
    } catch (err) {
      throw err;
    }
  }

  bindKey(exchangeName, key = '', saveBinding = false) {
    this.assertMainChannel().then((channel) => {
      const queue = this.exchangeQueues[exchangeName];

      if (saveBinding) {
        const bindings = this.bindings[exchangeName];

        if (!bindings.includes(key)) { bindings.push(key); }
      }

      if (!queue) {
        throw new Error(`no queue for channel: ${exchangeName}`);
      }

      channel.bindQueue(queue, exchangeName, key);
    });
  }

  unbindKey(exchangeName, key) {
    this.assertMainChannel().then((channel) => {
      const queue = this.exchangeQueues[exchangeName];

      if (this.bindings && this.bindings[exchangeName]) {
        this.bindings[exchangeName] = this.bindings[exchangeName]
        .filter(binding => binding !== key);
      }

      if (!queue) {
        throw new Error(`no queue for channel: ${exchangeName}`);
      }

      /*
      * if channel == null, there will be a reconnect and all
      * this.bindings[exchangeName] will be reestablished.
      * so we only need to remove a binding
      */
      if (channel) channel.unbindQueue(queue, exchangeName, key);
    });
  }

  publish(exchangeName, key, data, callback) {
    const { publish } = settings[exchangeName];

    return this.assertMainChannel()
      .then(channel => channel.publish(
          exchangeName,
          key,
          Buffer.from(JSON.stringify(data)),
          publish,
          callback,
        ));
  }

  projectMessage(projectId) {
    return {
      projectId,
      createTime: Date.now(),
      assertProject: true,
    };
  }

  assertProject(projectId, callback) {
    this.publish(PROJECT_MSGS, `${WS_PDF}.${projectId}`, this.projectMessage(projectId), callback);
  }

  sendToManagerService(queueId, hookId, hookData = {}) {
    const message = Buffer.from(JSON.stringify({ system: { hookId, hookData } }));

    this.channel.sendToQueue(queueId, message);
  }

  sendToConverterQueue(queueId, type, hookId, hookData = {}) {
    const message = Buffer.from(JSON.stringify({ system: { hookId, hookData }, type }));

    this.channel.sendToQueue(queueId, message);
  }

  pushConverterJob(type, system) {
    const { queueName, send } = settings[CONVERTER_SERVICE];
    const message = Buffer.from(JSON.stringify({ type, system }));

    this.channel.sendToQueue(queueName, message, send);
  }
};
