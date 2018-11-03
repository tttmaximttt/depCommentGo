const fs = require('fs');

function getContainerId() {
  try {
    const data = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const lines = data.split('\n');
    const lineWithId = lines.find(l => l.indexOf('docker/') > -1);

    if (lineWithId) return lineWithId.split('docker/').pop();
  } catch (e) {
    // do nothing
  }

  return false;
}


module.exports = {
  getContainerId,
};
