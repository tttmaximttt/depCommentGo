const keyMirror = require('keymirror');

module.exports = () => keyMirror({

  // ----------------
  // RABBIT CONSTANTS
  // ----------------

  ACTIVITY_HISTORY: null,
  SEND_TO_PROJECT: null,
  PROJECT_MSGS: null,
  WS_PDF: null,
  MANAGER_JOBS: null,
  ACTIVE_PROJECTS: null,
  PROJECT_QUEUE: null,
  SEND_QUEUE_CLOSE_MSG: null,
  PROJECT_QUEUE_NOT_EXIST: null,
  REST_QUEUE: null,
  MANAGER_SERVICE: null,
  WS_SERVICE: null,
  CONVERTER_SERVICE: null,
  LOST_MESSAGES: null,
  DEAD_LETTER: null,

  // ----------------
  // MANAGER JOBS
  // ----------------

  SIGNATURES: null,
  REST_DOCUMENT_CONTENT_REQUEST: null,
  REST_DOCUMENT_CONTENT_RESPONSE: null,
  REST_INCOMING_REQUEST: null,

  // ----------------
  // DEPRECATED
  // ----------------

  AUTH_CLIENT: null,
  DESTROY_CLIENT: null,
  DISCONNECT_CLIENT: null,
  DISCONNECT_CLIENT_ERROR: null,
  OPERATION_CLIENT_RECEIVE: null,
  PROJECT_OPERATIONS: null,
  USER_OPERATIONS: null,
  ACTIVITY_HISTORY_AUTH_CLIENT: null,
  ACTIVITY_HISTORY_CLIENT_DIE: null,
  ACTIVITY_HISTORY_DISCONNECT_CLIENT: null,
  ACTIVITY_HISTORY_OPERATION_RECEIVE: null,
  ACTIVITY_HISTORY_SYSTEM_ERROR: null,
  ACTIVITY_HISTORY_DISCONNECT_CLIENT_BY: null,
  ACTIVITY_HISTORY_TRACK_POINT: null,
  DISCONNECT_CLIENT_BY: null,
  DESTROY_CLIENT_BY: null,
  SEND_AUTH_CLIENT: null,
  SEND_OPERATIONS: null,
  DESTROY: null,

  // ----------------
  // TO DO
  // ----------------

  SIGN_OPEN: null,
  SIGN_DONE: null,
  USER_LOGOUT: null,
  USER_LOGIN: null,

  // ----------------
  // ERRORS
  // ----------------

  API_ERROR: null, // php error
  SCRIPT_EXCEPTION: null, // When an error is caught on a client
  SYSTEM_ERROR: null, // node errors
  WEBSOCKET_ERROR: null,
  INTERNAL_SCRIPT_ERROR: null,
  LOGIC_ERROR: null, // unexpected behaviour
  CONVERSION_ERROR: null,
  VALIDATION_ERROR: null,
  VALIDATION_WARNING: null,
  SIGINT: null,

  // ----------------
  // LOGGER CONSTANTS
  // ----------------

  RABBITMQ: null,
  MESSAGING_QUEUE_CREATED: null,
  MESSAGING_QUEUE_REMOVED: null,
  MESSAGING_NEW_PROJECT: null,
  IMAGE_WRONG_OWNER: null,
  DEFAULT_UPDATE_SUCCESSFUL: null,
  DEFAULT_UPDATE_FAIL: null,
  EMPTY_DEFAULTS: null,
  DEFAULT_RESTORED: null,
  ADD_IMAGE_ERROR: null,
  MESSAGING_PROJECT_CLOSE: null,
  FOUND_IDLE_CLIENT: null,
  START_IDLE_CLIENT_CLEANUP: null,
  FOUND_IDLE_PROJECT: null,
  CONTENT_NOT_SAVE: null,
  CREATE_OPS_FROM_REDIS: null,
  CREATE_OPS_FROM_REMOTE: null,
  NO_ACCESS_DATA_FOUND: null,
  START_IDLE_PROJECT_CLEANUP: null,
  START_IDLE_PROJECT_ERROR: null,
  SYSTEM_MESSAGE: null,
  SYSTEM_MESSAGE_HANDLED: null,
  MESSAGE_LIMIT: null,
  CONTENT_UPDATE_SUCCESSFUL: null,
  CONTENT_UPDATE_FAIL: null,
  API_REQUEST: null,
  API_RESPONSE: null,
  API_RESPONSE_TIME: null,
  PENDING_RECOGNIZE_FONT: null,
  XML_TO_JSON_CONVERSION_START: null,
  ENV_IS_NOT_ACTIVE: null,
  XML_TO_JSON_CONVERSION_FINISH: null,
  SERVICE_STARTED: null,
  GENERAL_TIMING: null,
  RUN_WEBHOOK: null,
  DISCONNECT_TIMEOUT_REMOVED: null,
  TOOL_OPERATION_TIMEOUT: null,
  DISCONNECTED_CLIENT_EXISTS: null,
  CONNECTION_REMOVED: null,

  GET_PROJECT_CONTENT_AND_CONFIG: null,
  INITIAL_OPERATIONS_READY_FOR_EXPORT: null,
  REMOVE_EXPORT_KEYS: null,
  OMIT_DESTROY: null,
  DESTROY_IDLE_CLIENT: null,
  REMOVE_CLIENT_FAIL: null,
  OPERATIONS_RECEIVED_BEFORE_AUTH_COMPLETE: null,
  RABBIT_MESSAGE: null,
  CONVERTER_SERVICE_FLOW: null,

  // --------------------------
  // ACTIVITY HISTORY EVENTS
  // --------------------------

  SESSION_INIT: null,
  SESSION_UPDATE: null,
  CLIENT_DIE: null,
  AUTH_INPUT: null,
  AUTH_OUTPUT: null,
  OPERATIONS_INPUT: null,
  OPERATIONS_BROADCAST: null,
  OPERATIONS_BROADCAST_ERROR: null,
  OPERATIONS_OUTPUT: null,
  DEFAULT_HANDLER_ERROR: null,
  POST_PROCESS_OPERATION_ERROR: null,
  VERSION_SAVE: null,
  AUTO_SAVE_FAIL: null,
  CONTENT_SAVE_SUCCESSFUL: null,
  BROADCASTING_SUCCESS: null,
  BROADCASTING_ERROR: null,
  UNIQUE_TOOLS_OPERATIONS: null,
  DESTROY_INPUT: null,
  DESTROY_OUTPUT: null,
  SET_DISCONNECT_TIMEOUT: null,
  SIGNATURE_REST_OPEN: null,
  SIGNATURE_REST_DONE: null,
  SOCKET_CLOSE: null,
  WS_CONNECTION_TIMEOUT: null,
  WS_CONNECTION_FAILED: null,
  WS_CONNECTION_ERROR: null,
  REARRANGE_STARTED: null,
  REARRANGE_COMPLETED: null,
  REARRANGE_FAILED: null,
  CONSTRUCTOR_OPEN: null,
  CONSTRUCTOR_CLOSE: null,
  CONSTRUCTOR_CANCEL: null,

  // --------------------------
  // ACTIVITY HISTORY SYSTEM EVENTS
  // --------------------------

  DRAIN_REDIS_TO_ELASTIC: null,

  // --------------------------
  // ACTIVITY HISTORY TRACK POINTS
  // --------------------------

  DOCUMENT_STARTED: null,
  DOCUMENT_LOADED: null,
  EXIT: null,
  EDITOR_STARTED: null,
  GO_TO_FLASH: null,
  TOKEN_CHANGED: null,
  USER_ACTED: null,

  // --------------------------
  // ACTIVITY HISTORY TRUEEDIT TRACK POINTS
  // --------------------------

  LOCAL_OPERATION: null,
  SEND_PAGE_DATA: null,

  // --------------------------
  // COLLABORATION
  // --------------------------

  CLEAR_HOLDED: null,
  CLEAR_HOLDED_ERROR: null,
  HOLD: null,

  // --------------------------
  // REJECTIONS
  // --------------------------
  UNCAUGHT_EXCEPTION: null,
  UNHANDLED_REJECTION: null,

  // --------------------------
  // MODE CHANGED
  // --------------------------
  SWITCH_TO_MAIN: null,
  SWITCH_TO_MAIN_FAIL: null,
  DESTROY_FAIL: null,

  // --------------------------
  // SYSTEM TYPES
  // --------------------------
  SYSTEM_TYPES_HOOK: null,
  SYSTEM_TYPES_CONVERT: null,
});
