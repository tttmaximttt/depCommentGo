const async = require('async');
const _ = require('lodash');

const WARNING_FIELD = 'warningMessages';
const ERROR_FIELD = 'errorMessages';

class EventService {

  /**
   * @param  {Constants} constantsEvents
   */
  constructor({ constantsEvents, elasticMessageModel, activityModel }) {
    this.constantsEvents = constantsEvents;
    this.elasticMessageModel = elasticMessageModel;
    this.activityModel = activityModel;
  }

  _getUpdateScript(message, key) {
    return {
      script: {
        inline: `if (ctx._source.containsKey("${key}")) {
          if (ctx._source.get("${key}") != null) {
            ctx._source.${key}.add(params.message);
          } else {
            ctx._source.${key} = [];
            ctx._source.${key}.add(params.message);
          }
        } else {
          ctx._source.${key} = [];
          ctx._source.${key}.add(params.message);
        }`,
        lang: 'painless',
        params: {
          message,
        },
      },
    };
  }

  _saveMessage(data, updateField, callback) {
    const { activityModel, elasticMessageModel } = this;

    return async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => { next(null, Object.assign(data, res)); },
      (payload, next) => {
        const { phase } = payload;

        const message = elasticMessageModel.getMessage(payload, true);
        const updateScript = this._getUpdateScript(message, updateField);

        const errorScript = elasticMessageModel.updateClientSession(payload, null, updateScript);
        const clientAction = phase ? elasticMessageModel.updateClientSession(payload, { phase }) : [];
        const historyAction = elasticMessageModel.getMessage(payload);

        activityModel.sendTransportMessage([].concat(historyAction, clientAction, errorScript), next);
      },
    ], callback);
  }

  saveWarning(data, callback) {
    return this._saveMessage(data, WARNING_FIELD, callback);
  }

  saveError(data, callback) {
    return this._saveMessage(data, ERROR_FIELD, callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  updateSessionData(data, callback) {
    async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => { next(null, Object.assign(data, res)); },
      (payload, next) => {
        const updatePackage = _.omit(
          data,
          [...this.elasticMessageModel.topLevelKeys, 'entryActivityName', 'socketId', 'viewerId', 'uidTimestamp']
        );
        const action = this.elasticMessageModel.updateClientSession(payload, updatePackage);

        this.activityModel.sendTransportMessage(action, (err) => {
          next(err, payload);
        });
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  addToHistory(data, callback) {
    return async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => { next(null, Object.assign(data, res)); },
      (payload, next) => {
        const { activityName, dataChanged } = payload;
        const { CONSTRUCTOR_CLOSE } = this.constantsEvents;
        let actions;

        if (activityName === CONSTRUCTOR_CLOSE && dataChanged) {
          actions = Object.assign({}, actions, { constructor_save: true });
        }
        const clientAction = actions ? this.elasticMessageModel.updateClientSession(payload, { actions }) : [];

        if (!clientAction.length) return next(null, payload);
        this.activityModel.sendTransportMessage(clientAction, err => next(err, payload));
      },
      (payload, next) => {
        const { phase, connection } = data;

        if (phase && phase.working) {
          phase.workingTime = payload.actionTime;
        }

        const clientAction = (phase || connection)
          ? this.elasticMessageModel.updateClientSession(payload, { phase, connection })
          : [];
        const historyAction = this.elasticMessageModel.getMessage(payload);

        this.activityModel.sendTransportMessage([].concat(clientAction, historyAction), next);
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  socketClose(data, callback) {
    return async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => {
        const payload = Object.assign(data, res);

        return this.addToHistory(payload, next);
      },
    ], callback);
  }

  /**
   * @param {Object} data
   * @param {Function} callback
   */
  saveToClientIndex(data, callback) {
    return async.waterfall([
      (next) => { this.activityModel.getInfoByUID(data, next); },
      (res, next) => {
        const payload = Object.assign(data, res);
        const { uniqueToolsOperations } = data;

        const clientAction = uniqueToolsOperations ?
          this.elasticMessageModel.updateClientSession(payload, { uniqueToolsOperations }) : [];

        this.activityModel.sendTransportMessage([].concat(clientAction), next);
      },
    ], callback);
  }

}

module.exports = EventService;
