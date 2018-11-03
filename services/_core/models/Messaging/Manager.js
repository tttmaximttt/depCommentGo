const Core = require('./Core');
const async = require('async');
const config = require('config');
const Promise = require('bluebird');
const _ = require('lodash');

const settings = require('./settings');

const {
  ACTIVE_PROJECTS,
  SEND_TO_PROJECT,
  MANAGER_JOBS,
  REST_QUEUE,
  RABBIT_MESSAGE,
  PROJECT_MSGS,
  PROJECT_QUEUE_NOT_EXIST,
  DEAD_LETTER,
  LOST_MESSAGES,
  WS_PDF,
  MANAGER_SERVICE,
} = require(`${config.paths.ROOT}/services/_core/constants/ConstantsEvents`)();

let instance = false;

class Manager extends Core {

  constructor(options) {
    super(options);

    Object.assign(this, {
      ACTIVE_PROJECTS: settings[ACTIVE_PROJECTS].queueName,
      SEND_TO_PROJECT: settings[SEND_TO_PROJECT].name,
      MANAGER_SERVICE: settings[MANAGER_SERVICE].name,
    });

    this.projectQueueData = {};
    this.on('connect', this.init.bind(this));
  }

  init(isReconnect) {
    const { channel } = this;

    async.waterfall([
      (next) => {
        if (!isReconnect) {
          this.prepareExchange(SEND_TO_PROJECT);
          this.prepareExchange(PROJECT_MSGS);
          this.prepareExchange(DEAD_LETTER);
          this.prepareExchange(MANAGER_SERVICE);
          async.parallel([
            // done => channel.assertQueue(ACTIVE_PROJECTS, settings[ACTIVE_PROJECTS].assert, done),
            done => channel.assertQueue(MANAGER_JOBS, settings[MANAGER_JOBS].assert, done),
            done => channel.assertQueue(LOST_MESSAGES, settings[LOST_MESSAGES].assert, (err) => {
              if (err) return done(err);
              this.channel.bindQueue(LOST_MESSAGES, DEAD_LETTER, '', {}, done);
            }),
          ], err => next(err));
        } else {
          this.resetChannelData();

          next(null);
        }
      },
      (next) => {
        async.parallel([
          done => this.subscribe(
            MANAGER_SERVICE,
            (key, message) => this.emit('system', message, _.noop),
            done
          ),
          done => this.subscribe(
            PROJECT_MSGS,
            (key, data, message) => this.handleClientMessage(key, data, message),
            done
          ),
        ], err => next(err));
      },
    ], (error) => {
      if (error) {
        return this.error({
          error,
          message: 'error while establishing initial connections',
        });
      }

      this.listenQueue(
        settings[LOST_MESSAGES].queueName,
        settings[LOST_MESSAGES].consume,
        this.handleDeadMessage.bind(this),
        true
      );

      // this.listenQueue(
      //   settings[ACTIVE_PROJECTS].queueName,
      //   settings[ACTIVE_PROJECTS].consume,
      //   this.handleNewProject.bind(this),
      //   true
      // );

      this.listenQueue(
        settings[MANAGER_JOBS].queueName,
        settings[MANAGER_JOBS].consume,
        this.handleManagerJob.bind(this),
        true
      );
    });
  }

  async sigintHandler() {
    try {
      this.info({ message: 'SIGINT was called' });

      const projects = this.getProjects();
      const redeliverProject = async (project) => { // TODO move out of here
        const { projectId, queue } = project;
        const key = `${WS_PDF}.${projectId}`;

        this.unbindKey(PROJECT_MSGS, key);

        queue.pause();

        await this.sendToDeadLetter(this.projectMessage(projectId));
        const queues = queue.getAll();

        await Promise.map(queues, msg => this.publish(PROJECT_MSGS, key, msg));
        this.info({ projectId, message: 'messages redelivered' });
      };

      await this.cancelQueueListening(LOST_MESSAGES);
      await Promise.map(projects, redeliverProject);

      this.info({ message: 'SIGINT was successfully handled' });
    } catch (error) {
      this.error({ error, message: 'SIGINT error' });
    }
    process.exit(0);
  }

  async sendToDeadLetter(msg) {
    const channel = await this.assertMainChannel();

    channel.sendToQueue(LOST_MESSAGES, Buffer.from(JSON.stringify(msg)));
  }

  handleDeadMessage(msg, ackCallback) {
    if (msg.assertProject) return this.handleNewProject(msg, ackCallback);

    const now = Date.now();
    const { timestamp, _routingKey } = msg;
    const projectId = _routingKey.split('.').pop();
    const { messageTimeout } = config.ManagerService;

    if ((now - timestamp) < messageTimeout) {
      return setTimeout(() => {
        this.sendToProjectQueue(projectId, msg);
      }, 100);
    }

    ackCallback('message timeout');
  }

  resetChannelData() {
    this.exchangeQueues = {};
    this.projectQueueData = {};
  }

  getProjects() {
    return Object.keys(this.projectQueueData).map(this.getProjectQueueData.bind(this));
  }

  getProjectQueueData(projectId) {
    return this.projectQueueData[projectId];
  }

  removeProjectQueueData(projectId) {
    const projectQueueData = this.getProjectQueueData(projectId);

    delete this.projectQueueData[projectId];

    return projectQueueData;
  }

  handleManagerJob(msg, handled) {
    const { jobName, payload, meta = {} } = msg;
    const { replyTo, responseEvent } = meta;

    this.emit(jobName, payload, (error, result) => {
      handled(error);

      if (replyTo) {
        const message = Buffer.from(JSON.stringify({
          jobName: responseEvent || jobName,
          payload: result,
          meta,
        }));

        this.channel.sendToQueue(replyTo, message, settings[REST_QUEUE].send);
      }
    });
  }

  async handleNewProject(msg, ackCallback) {
    const { projectId, createTime } = msg;
    const channel = await this.assertMainChannel();

    this.bindKey(PROJECT_MSGS, `${WS_PDF}.${projectId}`);
    this.addProjectQueueData(projectId, channel, createTime);
    this.emit('newProject', { projectId });

    ackCallback(msg);
  }

  addProjectQueueData(projectId, channel, createTime) {
    this.projectQueueData[projectId] = {
      projectId,
      createTime,
      channel,
    };
  }

  getProjectQueue(projectId) {
    const { messageTimeout } = config.ManagerService;
    const queueData = this.getProjectQueueData(projectId);

    if (!queueData) {
      this.logSystem.warning(
        PROJECT_QUEUE_NOT_EXIST,
        { message: 'Message can\'t be sent to not existing queue', projectId });
      return [];
    }

    queueData.queue = queueData.queue || this.factory.asyncQueue((message, cb) => {
      const onceCb = _.once(cb);
      const ackTimeout = setTimeout(() => {
        onceCb(null, null);
      }, messageTimeout * 2);
      const wrapCallback = (err, data) => {
        clearTimeout(ackTimeout);
        onceCb(err, data);
      };

      this.emit(RABBIT_MESSAGE);
      this.emitMessageEvent(projectId, message, wrapCallback);
    });

    return queueData.queue;
  }

  async handleClientMessage(key, data, message) {
    const channel = await this.assertMainChannel();
    const ackMessage = this.ackCallback(channel, message);

    if (data.assertProject) return ackMessage();

    const projectId = key.split('.').pop();
    const { timestamp } = data;

    try {
      const projectQueue = this.getProjectQueue(projectId);

      if (!projectQueue.length) return;

      projectQueue.push(data, timestamp, ackMessage);
    } catch (error) {
      this.error({
        error,
        projectId,
        data,
        message: 'project virtual queue does not exist, skipping message',
      });
      ackMessage();
    }
  }

  ackCallback(channel, message) {
    return (err) => {
      channel[err ? 'nack' : 'ack'](message);
    };
  }

  emitMessageEvent(projectId, message, ack) {
    const { auth, operations, destroy, system } = message;

    if (auth) return this.emit('auth', message, ack);
    if (operations) return this.emit('operations', message, ack);
    if (destroy) return this.emit('disconnect', message, ack);
    if (system) return this.emit('system', message, ack);

    /*
    * If none of the above then just skip it
    */
    ack();
  }

  unbindProject(projectId) {
    this.unbindKey(PROJECT_MSGS, `${WS_PDF}.${projectId}`);
    this.removeProjectQueueData(projectId);
  }

  getPrivateQueueId() {
    return this.exchangeQueues[MANAGER_SERVICE];
  }
}

module.exports = (options, implOptions) => {
  if (!instance) {
    instance = new Manager(options, implOptions);
  }

  return instance;
};
