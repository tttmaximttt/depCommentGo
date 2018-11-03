/**
 * @class QueueRemove -store number of removeQueue messages in queue.
 * Once 0 and there's no clients on project, queue can be removed
 */
class QueueRemove {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
    this.prefix = injector.dbConstants.QUEUE_REMOVE;
  }

  create(projectId) {
    return `${this.prefix}_${projectId}`;
  }

  incr(projectId) {
    const { dbMemory } = this;

    return dbMemory.client.incrAsync(this.create(projectId));
  }

  decr(projectId) {
    const { dbMemory } = this;

    return dbMemory.client.decrAsync(this.create(projectId));
  }

  remove(projectId) {
    const { dbMemory } = this;

    return dbMemory.delAsync(this.create(projectId));
  }
}

module.exports = QueueRemove;
