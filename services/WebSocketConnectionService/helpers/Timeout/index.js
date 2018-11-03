const DISCONNECT = 'disconnect';
const TOOL = 'tool';

const NOOP = () => { };

const store = {}; // global timeout store

/**
 * @param  {String} id
 */
function remove(id) {
  if (store[id]) {
    clearTimeout(store[id]);
    store[id] = null;
    delete store[id];
    return true;
  }
  return false;
}

/**
 * @param  {String} id
 * @param  {Number} time
 * @param  {function} handler
 */
function set(id, time, handler = NOOP) {
  if (store[id]) remove(id);
  store[id] = setTimeout(() => {
    delete store[id];
    handler();
  }, time);
}

/**
 * @param  {WebSocket} client
 * @param  {Number} time
 * @param  {function} handler
 */
function setAuthTimeout(client, time, handler = NOOP) {
  client.authTimeout = setTimeout(() => {
    client.authTimeout = null;
    handler();
  }, time);
}

function setToolOperationsTimeout(client, operations = [], time, handler = NOOP) {
  operations.forEach((operation) => {
    const id = operation.id;
    const toolId = `${id.localId}.${id.clientId}`;

    set(`${TOOL}_${client.uid}_${toolId}`, time, () => handler(client, client.uid, operation));
  });
}

function removeToolOperationsTimeout(client, operations = []) {
  operations.forEach((operation) => {
    const id = operation.id;
    const toolId = `${id.localId}.${id.clientId}`;

    return remove(`${TOOL}_${client.uid}_${toolId}`);
  });
}

/**
 * @param  {WebSocket} client
 * @param  {Number} time
 * @param  {function} handler
 */
function setQueueHealthCheckTimeout(client, time, handler = NOOP) {
  client.queueHealthCheckTimeout = setTimeout(() => {
    client.authTimeout = null;
    handler();
  }, time);
}

/**
 * @param  {WebSocket} client
 */
function removeQueueHealthCheckTimeout(client) {
  clearTimeout(client.queueHealthCheckTimeout);
  client.queueHealthCheckTimeout = null;
}

/**
 * @param  {WebSocket} client
 * @param  {Number} time
 * @param  {function} handler
 */
function setDisconnectTimeout(client, time, handler = NOOP) {
  set(`${DISCONNECT}_${client.uid}`, time, handler);
}

/**
 * @param  {WebSocket} client
 */
function removeAuthTimeout(client) {
  clearTimeout(client.authTimeout);
  client.authTimeout = null;
}

/**
 * @param  {WebSocket} client
 */
function removeDisconnectTimeout(client) {
  return remove(`${DISCONNECT}_${client.uid}`);
}

module.exports = () => ({
  setAuthTimeout,
  setDisconnectTimeout,
  removeAuthTimeout,
  removeDisconnectTimeout,
  setQueueHealthCheckTimeout,
  removeQueueHealthCheckTimeout,
  setToolOperationsTimeout,
  removeToolOperationsTimeout,
});
