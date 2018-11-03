const RestAPIConstants = () => ({
  INTERNAL_SERVER_ERROR: 500,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  DISCONNECT_TIMEOUT: 60 * 1000, // 1 min
  INVALID_REQUEST_BODY: 'Required field missing',
  CLIENT_NOT_CREATED: 'Client not created',
  CLIENT_CREATED: 'Client created',
  NO_PROJECT_ID: 'projectId required',
  SESSION_INIT: 'SESSION_INIT',
});

module.exports = RestAPIConstants;
