const timing = {};

module.exports = () => ({

  set(tag, expires = 0) {
    timing[tag] = {
      tag,
      startTime: Date.now(),
      endTime: false,
      timeout: expires > 0 && setTimeout(this.clear, expires, tag, true),
    };
  },

  unique(...args) {
    return args.map(arg => String(arg).replace(/\s|-/g, '_')).join('_');
  },

  get(tag, remove = true) {
    const timeTag = timing[tag];

    if (!timeTag) return null;

    const time = (timeTag.endTime || Date.now()) - timeTag.startTime;

    if (remove) this.clear(tag);

    return time;
  },

  lock(tag) {
    const timeTag = timing[tag];

    if (!timeTag) return false;

    timeTag.endTime = Date.now();

    return this.get(tag, false);
  },

  clear(tag, onTimeout = false) {
    if (!onTimeout && timing[tag]) {
      clearTimeout(timing[tag].timeout);
    }

    delete timing[tag];
  },
});
