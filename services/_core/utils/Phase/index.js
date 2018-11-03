const { isMatch } = require('lodash/fp');
const { INIT, SUCCESS, BUSY, DENIED, TIMEOUT } = require('./constants');

module.exports = ({ constantsEvents, operationsConstants }) => ({
  /**
   * @param {String} point
   * @param {String} clientStatus
   * @param {Object} operation
   * @param {String} accessLevel
   * @description creates "phase" objects for more informative activity logging
   * by analyzing the current activity history point, client's status, access level
   * or properties of operations.
   * returns a phase object or undefined (if no condition has been met)
   */
  create({ point, operation, accessLevel }) {
    const { SESSION_INIT, AUTH_INPUT, DESTROY_INPUT, AUTH_OUTPUT, SET_DISCONNECT_TIMEOUT,
      SYSTEM_ERROR, USER_ACTED, OPERATIONS_OUTPUT, DESTROY_OUTPUT,
      SCRIPT_EXCEPTION, API_ERROR,
    } = constantsEvents;
    const { ACCESS } = operationsConstants;
    const errStack = [SCRIPT_EXCEPTION, SYSTEM_ERROR, API_ERROR];

    // ENTER:

    if (point === SESSION_INIT || point === AUTH_INPUT) {
      return { enter: INIT };
    }

    if (point === AUTH_OUTPUT) {
      return { enter: SUCCESS };
    }

    if (point === OPERATIONS_OUTPUT && accessLevel === ACCESS.BUSY) {
      return { enter: BUSY };
    }

    if (point === OPERATIONS_OUTPUT && accessLevel === ACCESS.DENIED) {
      return { enter: DENIED };
    }

    // WORKING:

    if (isMatch({ properties: { point: USER_ACTED } }, operation) || point === USER_ACTED) {
      return { working: INIT };
    }

    // EXIT:

    if (point === DESTROY_INPUT) {
      return { exit: INIT };
    }

    if (point === DESTROY_OUTPUT) {
      return { exit: SUCCESS };
    }

    if (point === SET_DISCONNECT_TIMEOUT) {
      return { exit: TIMEOUT };
    }

    // OTHER:

    if (errStack.includes(point)) {
      return { noStatusError: true };
    }
  },
});
