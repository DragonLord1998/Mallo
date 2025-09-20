const ENGINE_URL = '../vendor/stockfish-17.1-lite-single-03e3232.js';

function normalizeLine(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object' && data !== null && 'data' in data) {
    return String(data.data ?? '');
  }
  if (data == null) {
    return '';
  }
  return String(data);
}

export class StockfishEngine {
  constructor({ skillLevel = 8, moveTime = 1000 } = {}) {
    this.worker = null;
    this.waiters = [];
    this.pendingBestMoveResolve = null;
    this.pendingBestMoveReject = null;
    this.readyPromise = null;
    this.skillLevel = skillLevel;
    this.moveTime = moveTime;
  }

  send(command) {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  handleMessage(raw) {
    const text = normalizeLine(raw);
    if (!text) {
      return;
    }
    const lines = text.split('\n');
    for (const entry of lines) {
      const line = entry.trim();
      if (!line) continue;

      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const move = parts[1] && parts[1] !== '(none)' ? parts[1] : null;
        if (this.pendingBestMoveResolve) {
          this.pendingBestMoveResolve(move);
        }
        this.pendingBestMoveResolve = null;
        this.pendingBestMoveReject = null;
      }

      for (let i = 0; i < this.waiters.length; i += 1) {
        const waiter = this.waiters[i];
        if (waiter.matcher(line)) {
          this.waiters.splice(i, 1);
          waiter.resolve(line);
          i -= 1;
        }
      }
    }
  }

  waitFor(matcher) {
    const predicate = typeof matcher === 'function' ? matcher : (line) => line.startsWith(matcher);
    return new Promise((resolve) => {
      this.waiters.push({ matcher: predicate, resolve });
    });
  }

  async initialize() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.worker = new Worker(new URL(ENGINE_URL, import.meta.url));
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      console.error('Stockfish worker error:', event);
    });

    this.readyPromise = (async () => {
      this.send('uci');
      await this.waitFor((line) => line === 'uciok');
      if (typeof this.skillLevel === 'number') {
        this.send(`setoption name Skill Level value ${this.skillLevel}`);
      }
      this.send('setoption name Threads value 1');
      await this.waitReady();
      return true;
    })();

    return this.readyPromise;
  }

  async waitReady() {
    this.send('isready');
    await this.waitFor((line) => line === 'readyok');
  }

  async setSkillLevel(level) {
    this.skillLevel = level;
    await this.initialize();
    if (typeof level === 'number') {
      this.send(`setoption name Skill Level value ${level}`);
      await this.waitReady();
    }
  }

  stop() {
    if (this.worker) {
      this.worker.postMessage('stop');
    }
    if (this.pendingBestMoveReject) {
      this.pendingBestMoveReject(new Error('Search stopped'));
    }
    this.pendingBestMoveResolve = null;
    this.pendingBestMoveReject = null;
  }

  async newGame() {
    await this.initialize();
    this.stop();
    this.send('ucinewgame');
    await this.waitReady();
  }

  async getBestMove(fen, options = {}) {
    await this.initialize();
    this.stop();
    this.send(`position fen ${fen}`);
    await this.waitReady();

    const { depth, movetime } = options;
    const chosenMoveTime = typeof movetime === 'number' ? movetime : this.moveTime;

    return new Promise((resolve, reject) => {
      this.pendingBestMoveResolve = (move) => {
        this.pendingBestMoveResolve = null;
        this.pendingBestMoveReject = null;
        resolve(move);
      };
      this.pendingBestMoveReject = (error) => {
        this.pendingBestMoveResolve = null;
        this.pendingBestMoveReject = null;
        reject(error);
      };

      if (typeof depth === 'number') {
        this.send(`go depth ${depth}`);
      } else if (typeof chosenMoveTime === 'number') {
        this.send(`go movetime ${chosenMoveTime}`);
      } else {
        this.send('go depth 12');
      }
    });
  }
}
