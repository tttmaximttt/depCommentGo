const async = require('async');
const _ = require('lodash');
const Promise = require('bluebird');

// todo: discuss this, perhaps move to heplers
class OperationsModel {

  /**
   * @param {Memory} memory
   * @param {Object} operationsConstants
   */
  constructor({ memory, operationsConstants }) {
    this.memory = memory;
    this.operationsConstants = operationsConstants;
  }

  getMissing(uid, confirmedOps, callback) {
    return this.getRange(uid, confirmedOps, -1, callback);
  }

  /**
   *
   * @param uid
   * @returns {Promise<Array>}
   */
  async getOrderedOps(uid, reverse = true) {
    const result = await this.memory.contentJSON.get(uid);
    const order = await this.memory.toolsOrder.get(uid);
    const initialArr = [
      [], // group erase
      [], // group filable
      [], // group free tool
    ];
    const arrOfGroups = order.reverse()
      .reduce((acc, currentValue) => {
        const { element, group } = currentValue;
        const elementUUID = this.memory.contentJSON.getElementUUID({ properties: { element } });
        const operation = result[elementUUID];

        if (!operation) return acc;

        delete result[elementUUID];

        acc[group].push(operation);
        return acc;
      }, initialArr);

    const sortedTemplates = arrOfGroups[1].sort((tmpl1, tmpl2) => {
      const order1 = _.get(tmpl1, 'properties.template.order');
      const order2 = _.get(tmpl2, 'properties.template.order');
      const pageId1 = _.get(tmpl1, 'properties.pageId');
      const pageId2 = _.get(tmpl2, 'properties.pageId');

      if (pageId1 === pageId2) {
        if (order1 > order2) return 1;
        else if (order1 < order2) return -1;
        return 0;
      }

      return (pageId1 > pageId2) ? 1 : -1;
    });

    if (reverse) {
      arrOfGroups[0] = arrOfGroups[0].reverse();
      arrOfGroups[2] = arrOfGroups[2].reverse();
    }

    return [...arrOfGroups[0], ...sortedTemplates, ...arrOfGroups[2]];
  }

  async getAll(uid) {
    const { projectId } = this.memory.uid.getIds(uid);
    const [contentOperations = [], userOperationsMap = {}, clientOperations = [], lastPageOp] = await Promise.all([
      this.getOrderedOps(uid),
      this.memory.userOperations.get(uid),
      this.memory.clientOperations.get(uid),
      this.memory.projectData.getByItemId(projectId, this.memory.projectData.lastPageOp),
    ]);
    const userOperations = Object.values(userOperationsMap);

    return _.compact([].concat(contentOperations, clientOperations, userOperations, [lastPageOp]));
  }

  _getOperationRef({ channel, index, type, subType, clientId, localId, group }) {
    return `${channel}-${index}-${group}-${type}-${subType}-${clientId}-${localId}`;
  }

  saveOperation(uid, channel, operation, callback) {
    const { memory, operationsConstants } = this;
    const { CHANNEL } = operationsConstants;
    const { projectId } = memory.uid.getIds(uid);

    async.waterfall([
      async () => {
        /*
        * We set operation index if we get this data from redis.
        * So we don have to save it once more, just add a ref to the new OPERATIONS_LIST
        */
        if (!operation.index) {
          switch (channel) {
            case CHANNEL.CLIENT: return true; // memory.clientOperations.pushAsync(uid, operation);
            case CHANNEL.USER: return memory.userOperations.add(uid, operation);
            case CHANNEL.PROJECT: return memory.projectOperations.push(projectId, operation);
            default:
              throw new Error(`no channel ${channel} provided`);
          }
        } else {
          return operation.index;
        }
      },
      async (index) => {
        const { type = '', subType = '', group = '' } = _.get(operation, 'properties', {});
        const { clientId, localId } = _.get(operation, 'id', {});
        const operationRef = this._getOperationRef({
          channel,
          index,
          type,
          subType,
          clientId,
          localId,
          group,
        });

        return memory.operationsList.push(uid, operationRef);
      },
    ], callback);
  }

  async _getCancelOpsMap(uid) {
    try {
      const { projectId } = this.memory.uid.getIds(uid);
      const changeModeOp = await this.memory.userOperations.getByType(uid, 'mode');

      if (!changeModeOp || !changeModeOp.actionTime) {
        throw new Error('Can\'t be canceled');
      }

      const projectOps = await this.memory.projectOperations.get(projectId);
      const opsToRemoveMap = [];

      projectOps.forEach((item) => {
        if (item.actionTime > changeModeOp.actionTime) {
          opsToRemoveMap.push(item);
        }
      });

      return opsToRemoveMap;
    } catch (err) {
      throw err;
    }
  }

  async _cancelOperations(uid, id, cancelMode) {
    try {
      const canceledOpsMap = await this._getCancelOpsMap(uid, id, cancelMode);

      return canceledOpsMap;
    } catch (err) {
      throw err;
    }
  }

  /**
   *
   * @param {string} uid
   * @param {string} id
   * @param {string} cancelMode
   * @param callback
   * @returns {Promise<*>}
   */
  async cancelOperations(uid, id, cancelMode) {
    try {
      const removedOperations = await this._cancelOperations(uid, id, cancelMode);
      const opsCountToRemove = removedOperations.length;
      const { projectId } = this.memory.uid.getIds(uid);

      await this.memory.projectOperations.removeOps(projectId, 0, (opsCountToRemove + 1) * -1);
      const operations = await this.memory.projectOperations.get(projectId);

      await this.memory.contentJSON.clear(uid);

      if (operations.length) {
        await this.memory.contentJSON.create(uid, operations);
      }

      return {
        removedOperations: Object.values(removedOperations),
        operations,
      };
    } catch (err) {
      throw err;
    }
  }

  async getRange(uid, from, to, callback) {
    try {
      const { projectOperations } = this.memory;

      const projectOps =
        await projectOperations.getRange(this.memory.uid.getIds(uid).projectId, from, to);

      callback(null, (projectOps || []));
    } catch (err) {
      throw err;
    }
  }
}

module.exports = OperationsModel;
