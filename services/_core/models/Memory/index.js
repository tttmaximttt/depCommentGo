const config = require('config');
const Promise = require('bluebird');

const MemoryDb = require(`${config.paths.ROOT}/services/_core/db`);

const dbConstants = require('./DbConstants');

const ClientId = require('./ClientId');
const ClientOperations = require('./ClientOperations');
const ClientUid = require('./ClientUid');
const EditorData = require('./EditorData');
const OperationsList = require('./OperationsList');
const ProjectOperations = require('./ProjectOperations');
const Uid = require('./Uid');
const UidClient = require('./UidClient');
const UserClients = require('./UserClients');
const UserOperations = require('./UserOperations');
const LuaStore = require('./LuaStore');
const ConfigXml = require('./ConfigXml');
const RedisTools = require('./RedisTools');
const EditorOps = require('./UsersData');
const DataDelivery = require('./DataDelivery');
const QueueRemove = require('./QueueRemove');
const Access = require('./Access');
const ToolsOrder = require('./ToolsOrder');
const CrossEditor = require('./CrossEditor');
const UsersData = require('./UsersData');
const ProjectData = require('./ProjectData');
const DestroyResult = require('./DestroyResult');
const IsDeactivatedEnv = require('./IsDeactivatedEnv');
const HoldModel = require('./HoldModel');
const _ = require('lodash');
const EditorMode = require('./EditorMode');
const ContentJSON = require('./ContentJSON');
const VersionsOperations = require('./VersionsOperations');
const AuthCache = require('./AuthCache');
const DocumentHash = require('./DocumentHash');

class Memory {
  constructor({ databaseMemory, metrics, logSystem, operationsConstants }) {
    const { options, deliveryExpire } = databaseMemory;

    if (options) {
      const retryStrategy = _.get(options, 'retry_strategy', () => { });

      options.retry_strategy = (o) => {
        logSystem.debug('REDIS', {
          message: `connecting to redis, attempt=${o.attempt}, downtime=${o.total_retry_time}`,
        });
        return retryStrategy(o);
      };
    }

    this.operationsConstants = operationsConstants;
    this.dbMemory = MemoryDb(options, metrics);
    this.dbMemory.client.on('ready', () => {
      logSystem.debug('REDIS', { message: 'connecting to redis, SUCCESS' });
    });
    this.dbMemory.client.on('error', (err) => { logSystem.warning('REDIS', { message: err }); });

    this.deliveryExpire = deliveryExpire;
    this.dbConstants = dbConstants;
    this.logSystem = logSystem;

    this.initKeys();
  }

  initKeys() {
    this.clientId = new ClientId(this);
    this.clientUid = new ClientUid(this);
    this.configXml = new ConfigXml(this);
    this.editorOps = new EditorOps(this);
    this.editorData = new EditorData(this);
    this.access = new Access(this);
    this.holdModel = new HoldModel(this);
    this.authCache = new AuthCache(this);
    this.contentJSON = new ContentJSON(this);
    this.destroyResult = new DestroyResult(this);
    this.isDeactivatedEnv = new IsDeactivatedEnv(this);
    this.projectData = new ProjectData(this);
    this.editorMode = new EditorMode(this);
    this.documentHash = new DocumentHash(this);
    this.toolsOrder = new ToolsOrder(this);
    this.userClients = new UserClients(this);
    this.usersData = new UsersData(this);
    this.versionsOperations = new VersionsOperations(this);
    this.userOperations = new UserOperations(this);
    this.uidClient = new UidClient(this);
    this.crossEditor = new CrossEditor(this);
    this.dataDelivery = new DataDelivery(this);
    this.operationsList = new OperationsList(this);
    this.projectOperations = new ProjectOperations(this);
    this.redisTools = new RedisTools(this);
    this.uid = new Uid(this);
    this.clientOperations = new ClientOperations(this);
    this.queueRemove = new QueueRemove(this);
    this.luaStore = Promise.promisifyAll(new LuaStore(this));
  }
}

module.exports = Memory;
