const keyMirror = require('keymirror');

module.exports = () => keyMirror({
  CREATED: null,
  PENDING: null,
  COMPLETED: null,
  RECEIVED: null,
  PROCESSING: null,
  FAILED: null,
});
