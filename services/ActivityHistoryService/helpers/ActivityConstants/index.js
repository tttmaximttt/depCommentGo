const status = {
  INIT: 'Init',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  ON_TIMEOUT: 'On timeout',
};

const channel = {
  SERVER: 'server',
  CLIENT: 'client',
};

const events = {
};

module.exports = () => ({
  channel,
  status,
  events,
});
