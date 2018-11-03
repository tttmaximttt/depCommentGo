class LocalId {
  constructor(injector) {
    this.dbMemory = injector.dbMemory;
  }

  flush() {
    return this.dbMemory.client.flushallAsync();
  }

  keys(mask) {
    return this.dbMemory.client.keysAsync(mask);
  }

  isConnected() {
    const { client } = this.dbMemory;

    if (!client.connected && !client.ready) throw new Error('No redis connection.');
    return client.connected && client.ready;
  }

  exec(query) {
    const args = query.split(' ');
    const key = args.shift();

    return this.dbMemory.client.send_commandAsync(key, args);
  }
}

module.exports = LocalId;
