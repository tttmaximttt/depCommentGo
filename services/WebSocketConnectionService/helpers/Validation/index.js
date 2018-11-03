function isAuthPackage(message) {
  return message.auth && Object.keys(message).length === 1;
}

function isDestroyPackage(message) {
  return message.destroy && Object.keys(message).length <= 3;
}

function isOperationPackage(message) {
  return message.operations && Object.keys(message).length === 1;
}

function isPingPongPackage(message) {
  return !Object.keys(message).length;
}

/**
 * @param {Object} message
 */
function normalize(message) {
  let isValid = null;

  try {
    isValid = isAuthPackage(message)
      || isDestroyPackage(message)
      || isOperationPackage(message)
      || isPingPongPackage(message);
  } catch (err) {
    isValid = false;
  }

  return isValid ? null : 'Wrong input message';
}

module.exports = () => ({
  normalize,
});
