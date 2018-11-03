const ERROR_CODE = require('./errorCodes');

const GROUP = {
  EDITOR: 'editor',
  DOCUMENT: 'document',
  TOOLS: 'tools',
  ROLES: 'roles',
  VERSIONS: 'versions',
  COLLABORATION: 'collaboration',
  IMAGES: 'images',
  SIGNATURES: 'signatures',
  OPERATIONS: 'operations',
  FONT: 'font',
  USERS: 'users',
  MAPPING: 'mapping',
};

const TYPE = {
  ACCESS: 'access',
  PAGES: 'pages',
  ERASE: 'erase',
  ATTRIBUTES: 'attributes',
  TOKEN: 'token',
  CHECKMARK: 'checkmark',
  TEXT: 'text',
  HOLD: 'hold',
  USERS: 'users',
  IMAGE: 'image',
  SOURCE: 'source',
  TRACK: 'track',
  SCENARIOS: 'scenarios',
  FEATURES: 'features',
  DEFAULTS: 'defaults',
  GUI: 'gui',
  EXPERIMENTS: 'experiments',
  STATISTICS: 'statistics',
  LOCALE: 'locale',
  SIGNATURE: 'signature',
  BLACKOUT: 'blackout',
  CANCEL: 'cancel',
  MODE: 'mode',
  NATIVE: 'native',
  RECOGNIZE: 'recognize',
  RESOLUTION: 'resolution',
  USER: 'user',
  COMMENT: 'comment',
  LIST: 'list',
  ADD: 'add',
  DELETE: 'delete',
  PREVIEW: 'preview',
  SAVE: 'save',
  RESTORE: 'restore',
  UPDATE: 'update',
};

const SUB_TYPE = {
  FORMULA: 'formula',
  NUMBER: 'number',
  LIST: 'list',
  DATE: 'date',
  IMAGE: 'image',
  TEXT: 'text',
  CURVE: 'curve',
  CONSTRUCTOR: 'constructor',
  COMMAND: 'command',
  PREVIEW: 'preview',
  CHANGE: 'change',
  INITIALS: 'initials',
  NONE: 'none',
  POINT: 'point',
};

const CHANNEL = {
  PROJECT: 'project',
  USER: 'user',
  CLIENT: 'client',
};

const EDITOR_MODE = {
  INIT: 'init',
  MAIN: 'main',
  CONSTRUCTOR: 'constructor',
  ATTRIBUTES: 'attributes',
  PAGES: 'pages',
  VERSIONS: 'versions',
  TRUEEDIT: 'trueedit',
};

const VERSION = {
  SAVE: 'save',
};

const ACCESS = {
  EDIT: 'edit',
  VIEW: 'view',
  BUSY: 'busy',
  DENIED: 'denied',
  REQUEST: 'request',
  CAN_RELOAD: 'can_reload',
  CAN_VIEW: 'can_view',
};

const FILLABLE_MODE = {
  NO_FIELDS: 'no_fields',
  FIELDS: 'fields',
  SIGNATURE_FIELDS: 'signature_fields',
};

const PDF_STATUS = {
  /**
   * @param {String} point
   * @param {Object} data
   * @param {Function} cb
   */
  PENDING: 'PENDING',
  FINISHED: 'FINISHED',
  ERROR: 'ERROR',
  SOURCE_ERROR: 'PDF Source Error',
};

const OPERATIONS_CANCEL = {
  CANCEL_BY_MODE: 'byMode',
  CANCEL_BY_ID: 'byId',
};

const OWNER = {
  LOCAL_ID: 0,
};

const CHANNEL_GROUP = {
  [GROUP.EDITOR]: CHANNEL.USER,
  [GROUP.TOOLS]: CHANNEL.PROJECT,
  [GROUP.ROLES]: CHANNEL.USER,
  [GROUP.VERSIONS]: CHANNEL.CLIENT,
  [GROUP.COLLABORATION]: CHANNEL.PROJECT,
  [GROUP.IMAGES]: CHANNEL.USER,
  [GROUP.SIGNATURES]: CHANNEL.USER,
  [GROUP.OPERATIONS]: CHANNEL.CLIENT,
  [GROUP.FONT]: CHANNEL.CLIENT,
  [GROUP.USERS]: CHANNEL.USER,
  [GROUP.MAPPING]: CHANNEL.PROJECT,
};

const UNIQUE_OPERATIONS = [
  TYPE.PAGES, TYPE.SOURCE, TYPE.MODE,
];

const WORKER_STATUS = {
  SUCCESS: 'success',
};

module.exports = () => ({
  CHANNEL,
  GROUP,
  TYPE,
  SUB_TYPE,
  ACCESS,
  CHANNEL_GROUP,
  FILLABLE_MODE,
  PDF_STATUS,
  EDITOR_MODE,
  UNIQUE_OPERATIONS,
  ERROR_CODE,
  OPERATIONS_CANCEL,
  VERSION,
  OWNER,
  WORKER_STATUS,
});
