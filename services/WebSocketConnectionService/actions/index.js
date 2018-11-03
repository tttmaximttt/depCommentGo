
const actions = ({ messaging, memory }) => ({

  operationClientReceive: (operations, uid, clientStatus, ctx) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProjectQueue(projectId, { uid, operations, clientStatus, ctx });
  },

  authClient: (auth, uid, reconnect, clientStatus, connection, clientId) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProjectQueue(projectId, { uid, auth, reconnect, clientStatus, connection, clientId });
  },

  disconnectClient: (uid, message = { destroy: true }, clientStatus, connection) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProjectQueue(
      projectId,
      Object.assign(message, { uid, clientStatus, connection })
    );
  },

  broadcastClientReconnect: (uid, correlationId) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProject(projectId, { uid, correlationId, clientReconnect: true });
  },

  updateConnectionData: (uid, correlationId, data) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProject(projectId, { uid, data, correlationId, connectionData: true });
  },

  checkClientDisconnect: (uid, correlationId) => {
    const { projectId } = memory.uid.getIds(uid);

    messaging.sendToProject(projectId, { uid, correlationId, clientDisconnect: true });
  },
});

module.exports = actions;
