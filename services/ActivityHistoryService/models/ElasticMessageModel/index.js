const _ = require('lodash');

const sessionInfoTemplate = require('./session_info_template.json');

const STATUSES = {
  INIT: 'Init',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  ON_TIMEOUT: 'On timeout',
};

const topLevelKeys = [
  'userId',
  'projectId',
  'uid',
  'sessionHash',
  'activityName',
  'actionTime',
  'channel',
  'pointInfo',
  'integration',
  'mappingMode',
  'mappingType',
];

const connectionDefaults = {
  hasReconnects: false,
  closeReason: '',
  destroyOnTimeout: false,
};

class ElasticMessageModel {
  constructor({ config, coreUtils, phaseConstants }) {
    this.coreUtils = coreUtils;
    this.config = config;
    this.topLevelKeys = topLevelKeys;
    this.phaseConstants = phaseConstants;
  }

  _getPhaseDefaults() {
    const {
      ENTER,
      WORKING,
      EXIT,
      ENTER_ERROR,
      WORKING_ERROR,
      EXIT_ERROR,
    } = this.phaseConstants;

    return {
      [ENTER]: 'null',
      [WORKING]: 'null',
      [EXIT]: 'null',
      [ENTER_ERROR]: 'null',
      [WORKING_ERROR]: 'null',
      [EXIT_ERROR]: 'null',
    };
  }

  /**
   *
   * @param {Object} data
   * @return {Object}
   */
  _stringifyValues(data) {
    const result = _.mapValues(JSON.parse(JSON.stringify(data)), v => (_.isObject(v) ? v : `${v}`));

    if (result.actionTime) result.actionTime = parseInt(result.actionTime, 10);
    if (result.timeEntry) result.timeEntry = parseInt(result.timeEntry, 10);

    return result;
  }

  /**
   *
   * @param {Object} data
   * @return {Object}
   */
  _getUpdateClientRaw(data) {
    const { userId, projectId, timeEntry, sessionHash } = data;

    return {
      update: {
        _index: this.coreUtils.getIndexName('client', timeEntry, data),
        _type: 'session',
        _id: `${userId}_${projectId}_${sessionHash}`,
        _retry_on_conflict: _.get(this.config, 'ActivityHistoryService.retry_on_conflict', 0),
      },
    };
  }

  _getSessionInfoMessageObject(data) {
    const infoObject = Object.assign({}, sessionInfoTemplate);

    const fillTemplate = (source, template) => {
      Object.keys(template).forEach((key) => {
        const templateValue = template[key];

        if (_.isObject(templateValue)) {
          template[key] = fillTemplate(source[key], template[key]);
        } else {
          template[key] = _.get(source, key, template[key]);
        }
      });

      return template;
    };

    fillTemplate(data, infoObject);

    return infoObject;
  }

  /**
   *
   * @param {Object} data
   * @return {Array}
   */
  initClientSession(data) {
    const payload = this._stringifyValues(data);
    const {
      userId,
      projectId,
      sessionHash,
      timeEntry,
      connection = connectionDefaults,
    } = payload;

    const actionRaw = {
      create: {
        _index: this.coreUtils.getIndexName('client', parseInt(timeEntry, 10), data),
        _type: 'session',
        _id: `${userId}_${projectId}_${sessionHash}`,
      },
    };

    const phase = Object.assign(this._getPhaseDefaults(), { enterTime: `${timeEntry}` });
    const activityName = 'SESSION_INFO';
    const status = STATUSES.INIT;

    const dataRaw = this._getSessionInfoMessageObject({
      ...payload,
      phase,
      activityName,
      status,
      connection,
    });

    return [actionRaw, dataRaw];
  }

  /**
   *
   * @param {Object} data
   * @return {Array}
   */
  authClientAction(data) {
    const payload = this._stringifyValues(data);
    const { userId, projectId, sessionHash, timeEntry, uid, channel, actionTime, phase } = payload;
    const { project = {} } = payload.auth;
    const { mode, type } = _.get(project, 'mapping', {});
    const { viewer, integration } = project;
    let { actionRaw, dataRaw } = {};

    if (data.__createViaAuth) {
      actionRaw = {
        create: {
          _index: this.coreUtils.getIndexName('client', parseInt(timeEntry, 10), data),
          _type: 'session',
          _id: `${userId}_${projectId}_${sessionHash}`,
        },
      };
      dataRaw = _.merge(
        {
          phase: Object.assign(this._getPhaseDefaults(), { enterTime: `${timeEntry}` }),
          activityName: 'SESSION_INFO',
        },
        {
          status: STATUSES.ONLINE,
          actionTime,
          sessionHash,
          userId,
          projectId,
          uid,
          channel,
          phase,
          viewer,
          integration,
          mappingMode: mode,
          mappingType: type,
        }
      );
    } else {
      actionRaw = this._getUpdateClientRaw(data);
      dataRaw = {
        doc: {
          uid,
          status: STATUSES.ONLINE,
          phase,
          viewer,
          integration,
          mappingMode: mode,
          mappingType: type,
        },
      };
    }
    return [actionRaw, dataRaw];
  }

  /**
   *
   * @param {Object} data
   * @param {Object} fields
   * @return {Array}
   */
  updateClientSession(data, doc, script = null) {
    const payload = this._stringifyValues(data);
    const actionRaw = this._getUpdateClientRaw(payload);
    const dataRaw = script || { doc };

    return [actionRaw, dataRaw];
  }

  /**
   *
   * @param {Object} data
   * @return {Array}
   */
  destroyClientAction(data) {
    const { actionTime, phase } = data;
    const indexRaw = this._getUpdateClientRaw(data);

    const dataRaw = {
      doc: {
        status: STATUSES.OFFLINE,
        phase: Object.assign({ exitTime: `${actionTime}` }, phase),
      },
    };

    return [indexRaw, dataRaw];
  }

  /**
   *
   * @param {Object} data
   * @return {Array}
   */
  getMessage(data, infoMessageOnly) {
    const payload = this._stringifyValues(data);
    const { activityName, timeEntry } = payload;
    const info = JSON.stringify(_.omit(payload, topLevelKeys));
    const type = activityName.toLowerCase();

    if (infoMessageOnly) return info;
    const indexRaw = {
      index: {
        _index: this.coreUtils.getIndexName('history', timeEntry, data),
        _type: 'history',
      },
    };
    const dataRaw = Object.assign(
      {},
      _.pick(payload, topLevelKeys),
      { info, type }
    );

    return [indexRaw, dataRaw];
  }

  /**
   *
   * @param {Object} data
   * @return {Array}
   */
  getErrorMessage(data) {
    const payload = this._stringifyValues(data);
    const { activityName, timeEntry } = payload;
    const type = (activityName.toLowerCase() || 'uknown');
    const indexRaw = {
      index: {
        _index: this.coreUtils.getIndexName('errors', timeEntry, data),
        _type: 'history',
      },
    };
    const dataRaw = Object.assign(
      {},
      _.pick(payload, topLevelKeys),
      { type, info: JSON.stringify(_.omit(payload, topLevelKeys)) }
    );

    return [indexRaw, dataRaw];
  }

  /**
   *
   * @param {Array} operations
   * @return {Object}
   */
  operations(operations) {
    const count = operations.length;
    const types = count < 5
      ? operations
        .map(operation => ({
          group: _.get(operation, 'properties.group'),
          type: _.get(operation, 'properties.type'),
          subType: _.get(operation, 'properties.subType'),
        }))
      : null;

    return {
      count,
      types,
    };
  }

  /**
   *
   * @param {Object} data
   * @return {Object}
   */
  setClientTimeoutStatus(data) {
    const payload = this._stringifyValues(data);
    const actionRaw = this._getUpdateClientRaw(payload);
    const { actionTime, phase } = payload;
    const dataRaw = { doc: { timeoutTime: actionTime, status: STATUSES.ON_TIMEOUT, phase } };

    return [actionRaw, dataRaw];
  }

}

module.exports = ElasticMessageModel;
