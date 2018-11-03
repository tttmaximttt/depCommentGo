class LuaScript {
  constructor({ dbMemory }, sha) {
    this.dbMemory = dbMemory;
    this.sha = sha;
  }

  exec(args, callback) {
    this.dbMemory.evalsha(this.sha, args, callback);
  }
}

module.exports = LuaScript;
