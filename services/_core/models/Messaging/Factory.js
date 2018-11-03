const async = require('async');

class Factory {

  systemMesage(payload) {
    return {
      system: payload,
    };
  }

  removeQueue(projectId) {
    return this.systemMesage({
      removeQueue: { projectId },
    });
  }

  asyncQueue(cb) {
    const queue = async.priorityQueue(cb);
    const tasks = queue._tasks;
    const findRecursive = (obj = {}, levelName, memory) => {
      const { data } = obj;

      if (data) memory.push(data);
      if (obj[levelName]) return findRecursive(obj[levelName], levelName, memory);
      return memory;
    };

    queue.getAll = () => findRecursive(tasks.head, 'next', []);
    queue.getReversedAll = () => findRecursive(tasks.tail, 'prev', []);

    return queue;
  }
}

module.exports = Factory;
