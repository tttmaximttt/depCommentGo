class Uid {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.prefix = injector.dbConstants.UID;
  }

  create(viewerId, projectId, socketId) {
    return `${viewerId}_${projectId}_${socketId}`;
  }

  db(uid) {
    return `${this.prefix}_${uid}`;
  }

  getUniqueUid(uid) {
    return `${uid}_${Date.now()}`;
  }

  remove(uid) {
    const { dbMemory } = this;
    const [userId, projectId, socketId, counter] = uid.split('_');

    return dbMemory.delAsync(this.db(`${userId}_${projectId}_${socketId}_${counter || 0}`));
  }

  isValid(uid) {
    if (!uid) return false;
    const { projectId, userId } = this.getIds(uid);

    return userId > 0 && projectId > 0;
  }

  getIds(uid) {
    const [userId, projectId, socketId, counter] = uid.split('_');

    return { projectId, userId, socketId, counter };
  }

  getProjectId(uid) {
    return this.getIds(uid).projectId;
  }

  getUserId(uid) {
    return this.getIds(uid).userId;
  }

  getSocketId(uid) {
    return this.getIds(uid).socketId;
  }

  withAccessLevel(uid, accessLevel) {
    return `${uid}--${accessLevel}`;
  }

  breakAccessLevel(uidItem) {
    const [uid, accessLevel] = uidItem.split('--');

    return { uid, accessLevel };
  }
}

module.exports = Uid;
