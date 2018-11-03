const StatsD = require('node-dogstatsd').StatsD;
const { getContainerId } = require('./utils');

const METRIC_NAMES = {
  AUTH: 'auth',
  OPERATIONS: 'operations',
  DESTROY: 'destroy',
  API: 'api',
  WS_CONNECTIONS: 'ws_connections_per_instance',
  MANAGER_PROJECTS: 'manager_projects',
  MEMORY_TRAFFIC: 'memory_traffic',
  GENERAL_TIMING: 'general_timing',
  RABBIT_MESSAGES: 'rabbit_messages',
  ERRORS: 'errors',
  WARNINGS: 'warnings',
  ENDED_SESSIONS: 'ended_sessions',
  SESSION_TIME: 'session_time',
};

class Metrics {
  constructor({ config }) {
    const { host, port, sampling = 1, intervalTime, environment } = config.metrics;

    this.metrics = new StatsD(host, port);
    this.sampling = sampling;
    this.appName = process.env.name || 'local';
    this.metricNames = METRIC_NAMES;
    this.environment = environment;
    this.envPrefix = (environment || '').split('-').shift();
    this.containerId = getContainerId();
    this.keys = this.createKeys('jsfiller', this.metricNames);

    this.intervalTime = intervalTime;
    this.intervals = {};
  }

  redisTraffic(key, bytes, isReceive) {
    const { keys, sampling } = this;
    const [prefix] = (key.match(/(^[A-Z_]*[A-Z])_?([\d_]*)/) || [])
      .slice(1)
      .filter(tag => tag.length);

    const tags = this.createTags({
      type: isReceive ? 'receive' : 'send',
      prefix,
    });

    this.metrics.gauge(keys.MEMORY_TRAFFIC, +bytes, sampling, tags);
  }

  createKeys(prefix, metricNames) {
    const keys = {};

    Object.keys(metricNames).forEach((metricName) => {
      keys[metricName] = [prefix, metricName].join('.');
    });
    return keys;
  }

  increment(key, tagsObj = {}) {
    const { metrics, sampling } = this;
    const tags = this.createTags(tagsObj);

    metrics.increment(key, sampling, tags);
  }

  baseTiming(key, time, tagsObj = {}) {
    const { metrics, sampling } = this;
    const tags = this.createTags(tagsObj);

    metrics.timing(key, time, sampling, tags);
  }

  createTags(...tagObjs) {
    const { environment, appName } = this;
    const tags = tagObjs
      .map(tagObj => Object.keys(tagObj)
        .reduce((tagsArr, key) => {
          if (tagObj[key] !== undefined) tagsArr.push(`${key}:${tagObj[key]}`);
          return tagsArr;
        }, [])
      )
      .reduce((total, arr) => total.concat(arr), []);

    tags.push('app:jsfiller');
    tags.push(`service:${appName}`);

    if (environment) tags.push(`environment:${environment}`);

    return tags;
  }

  authTime(time) {
    this.baseTiming(this.keys.AUTH, time);
  }

  operationsTime(time) {
    this.baseTiming(this.keys.OPERATIONS, time);
  }

  destroyTime(time) {
    this.baseTiming(this.keys.DESTROY, time);
  }

  apiRequestTime(endpoint, time) {
    this.baseTiming(this.keys.API, time, { endpoint });
  }

  generalTiming(step, time) {
    this.baseTiming(this.keys.GENERAL_TIMING, time, { step });
  }

  startInterval(getCount, metricsKey) {
    if (!this.intervals[metricsKey]) {
      this.intervals[metricsKey] = setInterval(() => {
        this.metrics.gauge(metricsKey, getCount(), this.sampling, this.createTags());
      }, this.intervalTime);
    }
  }

  sendEvent(title, text, tags) {
    text = text.replace(/\n/g, '\\n');
    const dataString = `_e{${title.length},${text.length}}:${title}|${text}|#${tags.join(',')}`;

    this.metrics.send_data(dataString);
  }

  serviceStartedEvent({ BUILD_ID, name, BUILD_BRANCH }) {
    const { CONSUL_SERVICE_NAME, SERVICE_NAME } = process.env;
    const service = SERVICE_NAME || CONSUL_SERVICE_NAME || name;
    const tags = this.createTags({ service });
    const message = '%%% \\n ' +
      '``` \\n' +
      `    Service: ${name} \\n` +
      `    Branch: ${BUILD_BRANCH} \\n` +
      `    Build: ${BUILD_ID} \\n` +
      '``` \\n' +
      '%%%';
    const title = `${service} started with ${BUILD_BRANCH}`;

    this.sendEvent(title, message, tags);
  }

  rabbitMessage() {
    this.increment(this.keys.RABBIT_MESSAGES);
  }

  warning() {
    this.increment(this.keys.WARNINGS);
  }

  error() {
    this.increment(this.keys.ERRORS);
  }

  sessionEnd(totalSessionTime) {
    this.increment(this.keys.ENDED_SESSIONS);
    if (totalSessionTime) this.baseTiming(this.keys.SESSION_TIME, totalSessionTime);
  }
}

module.exports = Metrics;
