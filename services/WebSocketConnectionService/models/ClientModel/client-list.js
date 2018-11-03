const _ = require('lodash');

class ClientsList {
  constructor(clients) {
    this.list = clients || {};
  }

  get withoutUID() {
    return _.chain(this.list).filter(o => !o.uid).keyBy('socketId').value();
  }

  get online() {
    return _.chain(this.list).filter(o => o.uid).keyBy('uid').value();
  }

  add(client) {
    if (client.socketId) this.list[client.socketId] = client;
  }

  del(socketId) {
    delete this.list[socketId];
  }
}

module.exports = ClientsList;
