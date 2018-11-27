import os from 'os';
import net from 'net';
import { exec, execSync, spawn } from 'child_process';
import { DiscoveryClient, config } from '@ircam/node-discovery';
import getPort from 'get-port';
import terminate from 'terminate';
import split from 'split';

const MSG_DELIMITER = 'AMEIZE_MSG_DELIMITER_$352NS0lAZL&';

// reference to the forked process
const forkedProcess = {
  uuid: null,
  proc: null,
};

const TCP_PORT = 8091;

// client of the ameize-controller
const client = {
  initialize({
    debug = false,
  } = {}) {

    this.dispatch = this.dispatch.bind(this);
    this.tcpClient = null;

    try {
      this.$HOME = execSync('echo $HOME').toString().replace(/\s$/g, '');
    } catch(err) {
      console.error(err.stack);
    }

    let portPromise;

    if (!debug) {
      this.hostname = os.hostname(); // may be overriden if `debug=true`
      portPromise = Promise.resolve(config.BROADCAST_PORT);
    } else {
      this.hostname = `ameize-client-${parseInt(Math.random() * 100000)}`;
      portPromise = getPort();
    }

    return portPromise.then(port => {
      this.discoveryClient = new DiscoveryClient({ port: port });

      this.discoveryClient.on('connection', (rinfo) => {
        this.connected = true;
        this.openTcpClient(rinfo);
      });

      this.discoveryClient.on('close', () => {
        this.connected = false;
      });

      this.discoveryClient.start();

      return Promise.resolve(this);
    })
    .catch(err => console.error(err));
  },

  openTcpClient(rinfo) {
    console.log('openTcpClient', 'open');
    // if we appear connected, keep trying to open the socket
    if (this.connected) {
      this.tcpClient = net.createConnection({ port: TCP_PORT, host: rinfo.address }, () => {
        const handshakeMsg = {
          type: 'HANDSHAKE',
          payload: { hostname: this.hostname },
        };

        console.log('openTcpClient', 'opened');
        this.tcpClient.write(JSON.stringify(handshakeMsg) + MSG_DELIMITER);
        this.tcpClient.pipe(split(MSG_DELIMITER)).on('data', this.dispatch);
      });

      this.tcpClient.on('end', () => {
        setTimeout(() => { this.openTcpClient(rinfo) }, 1000);
      });

      this.tcpClient.on('error', () => {
        setTimeout(() => { this.openTcpClient(rinfo) }, 1000);
      });
    }
  },

  pipeStdOut(data) {
    const msg = {
      type: 'STDOUT',
      payload: {
        msg: data.trim(),
      },
    };

    this.tcpClient.write(JSON.stringify(msg) + MSG_DELIMITER);
  },

  pipeStdErr(data) {
    const msg = {
      type: 'STDERR',
      payload: {
        msg: data.trim(),
      },
    };

    this.tcpClient.write(JSON.stringify(msg) + MSG_DELIMITER);
  },

  send(data) {
    if (this.tcpClient) {
      this.tcpClient.write(JSON.stringify(data) + MSG_DELIMITER);
    }
  },

  dispatch(data) {
    if (data) {
      const { type, payload } = JSON.parse(data);
      const tokenUuid = payload.tokenUuid;
      console.log(type, payload);

      switch (type) {
        case 'EXEC': {
          const cwd = payload.cwd.replace(/^\~/, this.$HOME);
          const cmd = payload.cmd;

          this.executeCmd(tokenUuid, cwd, cmd);
          break;
        }
        case 'FORK': {
          const cwd = payload.cwd.replace(/^\~/, this.$HOME);
          const parts = payload.cmd.split(' ');
          const cmd = parts.shift();
          const args = parts;
          console.log(cwd, cmd, args);

          this.forkProcess(tokenUuid, cwd, cmd, args);
          break;
        }
        case 'KILL': {
          this.killProcess(tokenUuid);
          break;
        }
      }
    }
  },

  executeCmd(tokenUuid, cwd, cmd) {
    exec(cmd, { cwd }, (err, stdout, stderr) => {
      if (err) {
        return this.pipeStdErr(err.message);
      }

      this.pipeStdOut(stdout.toString());
      this.pipeStdErr(stderr.toString());

      const ack = {
        type: 'EXEC_ACK',
        payload: { tokenUuid },
      };

      this.send(ack);
    });
  },

  forkProcess(tokenUuid, cwd, cmd, args) {
    const fork = () => {
      const proc = spawn(cmd, args, { cwd });

      // remove end of line as console.log will add a new one
      proc.stdout.on('data', data => this.pipeStdOut(data.toString()));
      proc.stderr.on('data', data => this.pipeStdErr(data.toString()));
      proc.on('close', code => this.pipeStdOut(`exit child process (code ${code})`));
      proc.on('error', err => this.pipeStdErr(`${err.message}`));

      forkedProcess.uuid = tokenUuid;
      forkedProcess.proc = proc;

      const ack = {
        type: 'FORK_ACK',
        payload: { forkTokenUuid: tokenUuid },
      };

      this.send(ack);
    }

    if (forkedProcess.proc === null) {
      fork();
    } else {
      // if a process was running from a previous controller session, kill it
      const { proc } = forkedProcess;

      this.pipeStdOut(`kill process (pid: ${proc.pid})`);

      terminate(proc.pid, err => {
        if (err) {
          this.pipeStdErr(`...an error occured while killing process (pid: ${proc.pid}): "${err.message}"`);
        }

        forkedProcess.proc = null;
        forkedProcess.uuid = null;

        fork();
      });
    }
  },

  killProcess(killTokenUuid) {
    const { proc, uuid } = forkedProcess;
    const forkTokenUuid = uuid;
    const ack = {
      type: 'KILL_ACK',
      payload: {
        killTokenUuid,
        forkTokenUuid,
      },
    };

    if (proc !== null && proc.pid) {
      const forkTokenUuid = uuid;

      terminate(proc.pid, err => {
        if (err) {
          this.pipeStdErr(`...an error occured while killing process (pid: ${proc.pid}): "${err.message}"`);
        }

        forkedProcess.proc = null;
        forkedProcess.uuid = null;

        this.send(ack);
      });
    } else {
      this.pipeStdErr('cannot kill inexisting process');

      forkedProcess.proc = null;
      forkedProcess.uuid = null;

      this.send(ack);
    }
  },

  quit() {
    this.discoveryClient.stop();
    this.tcpClient.end();
  },
}

export default client;
