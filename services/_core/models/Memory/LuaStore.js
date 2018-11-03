const LuaScript = require('./LuaScript');

class Lua {
  constructor({ dbMemory }) {
    this.dbMemory = dbMemory;
    this.scripts = {};
    this.dbMemory.client.on('connect', () => {
      this.scripts = {};
    });
  }

  loadFromFile(filename, useCache = true) {
    const file = `${__dirname}/lua/${filename}.lua`;

    return new Promise((resolve, reject) => {
      const loadedScript = this.scripts[filename];

      if (loadedScript && useCache) return resolve(loadedScript);

      this.dbMemory.loadScriptFile(file, (err, sha) => {
        if (err) return reject(err);

        this.scripts[filename] = new LuaScript(this, sha);

        resolve(this.scripts[filename]);
      });
    });
  }

  jsonCallback(callback) {
    return (err, res) => callback(err, err ? undefined : JSON.parse(res));
  }

  run(fileName, scriptArgs, callback) {
    this.loadFromFile(fileName, true)
      .then(script => script.exec(scriptArgs, callback))
      .catch(callback);
  }

}

module.exports = Lua;
