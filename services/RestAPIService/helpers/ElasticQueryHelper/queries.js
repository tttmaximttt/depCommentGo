module.exports = {

  /**
   * SESSION_INFO
   */
  ALL_SESSIONS: {
    body: { body: { size: 0 } },
  },


  TOOLS_OPERATIONS: {
    query: {
      bool: {
        must: [
          { match: { status: 'Offline' } },
        ],
      },
    },
    body: {
      _source: [
        'projectId',
        'userId',
        'actions',
        'uniqueToolsOperations',
        'viewer',
      ],
    },
  },

  TIEOUT_SESSIONS: {
    query: {
      bool: {
        must: [
          { term: { 'phase.exit': 'timeout' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: { body: { size: 0 } },
  },

  TIMEOUT_AFTER_ACTED: {
    query: {
      bool: {
        must: [
          { term: { 'phase.exit': 'timeout' } },
          { term: { 'phase.working': 'init' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: {
      _source: ['sessionHash'],
    },
  },

  TIMEOUT_BEFORE_ACTED: {
    query: {
      bool: {
        must: [
          { term: { 'phase.exit': 'timeout' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
          { term: { 'phase.working': 'init' } },
        ],
      },
    },
    body: {
      _source: ['sessionHash'],
    },
  },

  WORKING_SESSIONS: {
    query: {
      bool: {
        must: [
          { term: { 'phase.enter': 'success' } },
          { term: { 'phase.exit': 'null' } },
          { match: { status: 'Online' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: { body: { size: 0 } },
  },

  /**
   *
   * SESSION_INFO AND phase.exit: success AND phase.enter: success
   */
  SUCCESS_WITHOUT_ERRORS: {
    query: {
      bool: {
        must: [
          { term: { 'phase.enter': 'success' } },
          { term: { 'phase.exit': 'success' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: { body: { size: 0 } },
  },

  FINISHED_SESSIONS: {
    query: {
      bool: {
        must: [
          { term: { 'phase.enter': 'success' } },
          { term: { 'phase.exit': 'success' } },
        ],
      },
    },
    body: { body: { size: 0 } },
  },

  SESSIONS_WITH_WARNINGS: {
    query: {
      bool: {
        must: [
          { exists: { field: 'warningMessages' } },
        ],
      },
    },
    body: {
      _source: [
        'sessionHash',
        'warningMessages',
      ],
    },
  },

  SESSIONS_WITH_ERRORS: {
    query: {
      bool: {
        must: [
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: {
      _source: [
        'sessionHash',
        'errorMessages',
        'phase',
        'channel',
      ],
    },
  },

  /**
   * SESSION_INFO AND phase.exit: success AND NOT phase.enter: success;
   */
  NOT_SUCCESS_ENTER: {
    query: {
      bool: {
        filter: [
          { term: { 'phase.exit': 'success' } },
        ],
        must_not: [
          { match: { 'phase.enter': 'success' } },
          { exists: { field: 'errorMessages' } },
        ],
      },
    },
    body: {
      _source: ['sessionHash', 'phase.enter', 'phase.working', 'phase.exit'],
    },
  },

  /**
   * SESSION_INFO AND phase.enter: success AND NOT phase.exit: success;
   */
  NOT_SUCCESS_EXIT: {
    query: {
      bool: {
        filter: [
          { term: { 'phase.enter': 'success' } },
        ],
        must_not: [
          { match: { 'phase.exit': 'success' } },
          { exists: { field: 'errorMessages' } },
          { match: { status: 'Online' } },
        ],
      },
    },
    body: {
      _source: ['sessionHash', 'phase.enter', 'phase.working', 'phase.exit'],
    },
  },

  /**
   *  SESSION_INFO AND phase.enter: init AND phase.working: null AND phase.exit: null
   */
  ONLY_INIT: {
    query: {
      bool: {
        filter: [
          { term: { 'phase.enter': 'init' } },
          { term: { 'phase.working': 'null' } },
          { term: { 'phase.exit': 'null' } },
        ],
        must_not: [
          { exists: { field: 'errorMessages' } },
          { match: { status: 'Online' } },
        ],
      },
    },
    body: {
      _source: ['sessionHash'],
    },
  },
};
