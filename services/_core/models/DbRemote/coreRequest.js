const request = require('request');
const _ = require('lodash');

const SERVER_ERROR = 'Internal Server Error';
const logger = (target, name) => (options, callback) => {
  const endpoint = this.methodName;
  const cbf = (err, res = {}, body = {}) => {
    target.logSystem.info(
        target.constantsEvents.API_RESPONSE,
        { endpoint, info: JSON.stringify({ elapsedTime: body.elapsedTime }) },
      );

    return callback(err, res, body);
  };

  return target[name].call(target, options, cbf);
};

const handler = { // TODO move somewhere
  methodName: null,
  get(target, name) {
    if (typeof target[name] === 'function') {
      this.methodName = name === 'send' || name === 'sendRequest' ? this.methodName : name;
      return name === 'send' ? logger.call(this, target, name) : target[name];
    }
    return target[name];
  },
};

class CoreRequest {
  constructor({ config, crossEditor, logSystem, constantsEvents }) {
    const { options, APIv5 } = config.databaseRemote;
    const { url, route, timeout = 20000, time } = options;
    const { BUILD_ID: build_id, ENV_NAME: env } = config.env;
    const { version } = config;

    this.url = url + (route || APIv5.route);
    this.endpoints = APIv5.endpoints;
    this.logSystem = logSystem;
    this.constantsEvents = constantsEvents;
    this.appKey = APIv5.appKey;
    this._host = null;
    this.crossEditor = crossEditor;
    this.crossEditorEnabled = String(config.crossEditor.enable) === 'true';
    this.commonQueryParams = { build_id, env, jsfiller_version: version };

    this.requiredOptions = {
      timeout,
      time,
    };

    return new Proxy(this, handler);
  }

  logRequest(endpoint, context, logResponse = false, responseCallback = () => {}) {
    const logData = { endpoint, ...context };

    this.logSystem.info(this.constantsEvents.API_REQUEST, logData);

    return (...args) => {
      if (logResponse) {
        logData.response = _.get(args, '[1]', null);
      }

      this.logSystem.info(this.constantsEvents.API_RESPONSE, logData);
      responseCallback(...args);
    };
  }

  /**
   *
   * @param {String} host
   */
  setHost(host) {
    if (!this.crossEditorEnabled) {
      this._host = this.url;
    } else if (typeof host === 'string') {
      this._host = host;
    }
    return this;
  }

  clearHost() {
    this._host = null;
  }

  /**
   *
   * @param options
   * @param callback
   */
  sendRequest(options, callback) {
    this.send(options, (err, result, res) => {
      if (err) {
        return callback(err);
      } else if (result.result) {
        callback(null, result.data, res);
      } else {
        callback(result, null, res);
      }
    });
  }

  /**
   *
   * @param error
   * @param callback
   */
  handleError(error, callback) {
    const { message, data } = error;
    const result = { message };

    if (data) result.location = data.location;
    callback(result);
  }

  /**
   *
   * @param options
   * @param callback
   */
  send(options, callback) { // это не я писал
    options.time = true;
    if (this.crossEditorEnabled) {
      options.url = this.crossEditor.mapHost(options.url, this._host);
    }

    /**
     *
     * @param options
     * @param callback
     */
    request(Object.assign({}, this.requiredOptions, options), (err, res, body) => {
      if (typeof (callback) !== 'function') return;
      if (err) {
        return callback(err, null);
      }

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
          body.elapsedTime = res.elapsedTime;
        } catch (error) {
          return callback(SERVER_ERROR);
        }
      }

      if (options.omitStatusCode) {
        return callback(null, body, res);
      }
      if (res.statusCode === 200) {
        if (!body) {
          return callback('empty body');
        }
        if (body.result) {
          body.elapsedTime = res.elapsedTime;
          return callback(null, body, res);
        }
        if (body.processId) {
          body.elapsedTime = res.elapsedTime;
          return callback(null, body, res);
        }
        if (options.bodyAsJson === true) {
          body.elapsedTime = res.elapsedTime;
          return callback(null, body, res);
        }
        this.handleError(body, callback);
      } else {
        return this.getLocation(options, body, callback);
      }
    });
    if (this._host) {
      this.clearHost();
    }
  }
}

module.exports = CoreRequest;
