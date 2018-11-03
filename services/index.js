const async = require('async');
const WebSocket = require('./WebSocketConnectionService');
const ActivityHistory = require('./ActivityHistoryService');
const Manager = require('./ManagerService');
const Rest = require('./RestAPIService');

/**
 * @method onReady
 * helper method, checks all services to be ready to work && receive messages
 */
function onReady(callback) {
  const messagingModels = [
    WebSocket.resolve('messaging'),
    ActivityHistory.resolve('messaging'),
    Manager.resolve('messaging'),
    Rest.resolve('messaging'),
  ];

  async.parallel(
    messagingModels.map(model => (ready) => {
      if (!model.connected) model.once('connect', () => ready());
      else ready();
    }), callback);
}

module.exports = {
  WebSocket,
  ActivityHistory,
  Manager,
  Rest,
  onReady,
};
