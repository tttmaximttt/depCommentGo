const _ = require('lodash');
const Uid = require('./Uid');
const UsersData = require('./UsersData');

class UserClients {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.uid = new Uid(injector);
    this.prefix = injector.dbConstants.USER_CLIENTS;
    this.itemName = 'clients';
    this.usersData = new UsersData(injector);
  }

  create(userId) {
    return `${this.prefix}_${userId}`;
  }

  async get(userId) {
    const { usersData } = this;
    const userClients = await usersData.getByItemId(userId, this.itemName) || [];

    return userClients;
  }

  async register(uid) {
    try {
      const { userId } = this.uid.getIds(uid);
      const { usersData } = this;
      const uidList = await this.get(userId);
      const isInList = uidList.includes(uid);

      if (!isInList) {
        uidList.push(uid);
        return usersData.set(userId, this.itemName, uidList);
      }
      return false;
    } catch (err) {
      throw err;
    }
  }

  async count(userId) {
    const uidList = await this.get(userId);

    return uidList.length;
  }

  async unregister(uid) {
    const { userId } = this.uid.getIds(uid);
    const { usersData } = this;
    const uidList = await this.get(userId);

    _.remove(uidList, itemUid => uid === itemUid);
    return usersData.set(userId, this.itemName, uidList);
  }

  remove(userId) {
    const { usersData } = this;

    return usersData.delete(userId, this.itemName);
  }
}

module.exports = UserClients;
