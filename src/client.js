import { DiscoveryClient, config } from '@ircam/node-discovery';
import os from 'os';
import getPort from 'get-port';
import { exec, spawn } from 'child_process';
import readline from 'readline';
import terminate from 'terminate';
// import captureConsole from 'capture-console';
var intercept = require("intercept-stdout");
var captureConsole = require('capture-console');


const client = {
  initialize({
    debug = false,
  } = {}) {

    this.dispatch = this.dispatch.bind(this);
    this.$HOME = null;
    this.hostname = os.hostname(); // may be overriden if `debug=true`

    this.forkedProcess = {
      uuid: null,
      proc: null,
    };

    const homePromise = new Promise((resolve, reject) => {
      exec('echo $HOME', (err, stdout, stderr) => {
        if (err)
          return console.error(err);
        // remove trailing new line
        resolve(stdout.toString().replace(/\s$/g, ''));
      });
    });

    const discoveryOptions = {
      verbose: false,
      port: config.BROADCAST_PORT,
    };

    let discoveryPromise = null;

    if (debug === false) {
      discoveryPromise = Promise.resolve(discoveryOptions);
    } else {
      discoveryPromise = getPort()
        .then(port => {
          // create dummy hostname in debug mode
          this.hostname = `wat-debug-${parseInt(Math.random() * 100)}`;

          discoveryOptions.verbose = true;
          discoveryOptions.port = port;

          return discoveryOptions;
        })
        .catch(err => console.error(err.stack));
    }

    return Promise.all([homePromise, discoveryPromise])
      .then(([homePath, discoveryOptions]) => {
        this.$HOME = homePath;

        discoveryOptions.payload = { hostname: this.hostname };

        this.discoveryOptions = discoveryOptions;
        this.udpClient = new DiscoveryClient(discoveryOptions);

        this.udpClient.once('connection', () => {

          captureConsole.startIntercept(process.stdout, stdout => {
            this.udpClient.send(`STDOUT ${stdout.toString()}`);
          });

          captureConsole.startIntercept(process.stderr, stderr => {
            this.udpClient.send(`STDERR ${stderr.toString()}`);
          });

          console.log(`${this.hostname} connected`);
        });

        // receive only message that do not match the discovery protocol
        this.udpClient.on('message', this.dispatch);
        this.udpClient.start();

        return Promise.resolve(this);
      })
      .catch(err => console.error(err));
  },

  dispatch(buffer, rinfo) {
    const msg = buffer.toString().replace(/\s\s+/g, ' ').split(' ');
    const protocol = msg.shift();
    const tokenUuid = msg.shift()

    switch (protocol) {
      case 'EXEC': {
        const cwd = msg.shift().replace(/^\~/, this.$HOME);
        const cmd = msg.join(' ');

        this.executeCmd(tokenUuid, cwd, cmd);
        break;
      }
      case 'FORK': {
        const cwd = msg.shift().replace(/^\~/, this.$HOME);
        const cmd = msg.shift();
        const args = msg;

        this.forkProcess(tokenUuid, cwd, cmd, args);
        break;
      }
      case 'KILL': {
        this.killProcess(tokenUuid);
        break;
      }
    }
  },

  executeCmd(tokenUuid, cwd, cmd) {
    exec(cmd, { cwd: cwd, }, (err, stdout, stderr) => {
      if (err)
        return console.error(err);

      console.log(stdout.toString());
      console.log(stderr.toString());

      const ack = `EXEC_ACK ${tokenUuid}`;
      this.udpClient.send(ack);
    });
  },

  forkProcess(tokenUuid, cwd, cmd, args) {
    if (this.forkedProcess.proc === null) {
      const proc = spawn(cmd, args, { cwd });

      // remove end of line as console.log will add a new one
      proc.stdout.on('data', data => console.log(data.toString().trim()));
      proc.stderr.on('data', data => console.error(data.toString().trim()));
      proc.on('close', code => console.log(`child process exited with code ${code}`));

      this.forkedProcess.uuid = tokenUuid;
      this.forkedProcess.proc = proc;

      const ack = `FORK_ACK ${tokenUuid}`;
      this.udpClient.send(ack);
    } else {
      console.error('cannot start process, a process is already running');
    }
  },

  killProcess(killTokenUuid) {
    const { proc, uuid } = this.forkedProcess;
    const forkTokenUuid = uuid;

    if (proc !== null) {
      const forkTokenUuid = uuid;

      terminate(proc.pid, err => {
        if (err)
          console.error('...an error occured while killing the process', err);

        // if process has crashed and thus cannot be killed,
        // we still want to reset everything...
        this.forkedProcess.proc = null;
        this.forkedProcess.uuid = null;

        const ack = `KILL_ACK ${killTokenUuid} ${forkTokenUuid}`;
        this.udpClient.send(ack);
      });
    } else {
      console.error('cannot kill inexisting process');
      //
      const ack = `KILL_ACK ${killTokenUuid} ${forkTokenUuid}`;
      this.udpClient.send(ack);
    }
  },

  quit() {
    this.udpClient.stop();
  },
}

export default client;
