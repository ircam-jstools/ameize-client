'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _child_process = require('child_process');

var _nodeDiscovery = require('@ircam/node-discovery');

var _getPort = require('get-port');

var _getPort2 = _interopRequireDefault(_getPort);

var _terminate = require('terminate');

var _terminate2 = _interopRequireDefault(_terminate);

var _split = require('split');

var _split2 = _interopRequireDefault(_split);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var MSG_DELIMITER = 'AMEIZE_MSG_DELIMITER_$352NS0lAZL&';

// reference to the forked process
var forkedProcess = {
  uuid: null,
  proc: null
};

var TCP_PORT = 8091;

// client of the ameize-controller
var client = {
  initialize: function initialize() {
    var _this = this;

    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref$debug = _ref.debug,
        debug = _ref$debug === undefined ? false : _ref$debug;

    this.dispatch = this.dispatch.bind(this);
    this.tcpClient = null;

    try {
      this.$HOME = (0, _child_process.execSync)('echo $HOME').toString().replace(/\s$/g, '');
    } catch (err) {
      console.error(err.stack);
    }

    var portPromise = void 0;

    if (!debug) {
      this.hostname = _os2.default.hostname(); // may be overriden if `debug=true`
      portPromise = _promise2.default.resolve(_nodeDiscovery.config.BROADCAST_PORT);
    } else {
      this.hostname = 'ameize-client-' + parseInt(Math.random() * 100000);
      portPromise = (0, _getPort2.default)();
    }

    return portPromise.then(function (port) {
      _this.discoveryClient = new _nodeDiscovery.DiscoveryClient({ port: port });

      _this.discoveryClient.on('connection', function (rinfo) {
        _this.connected = true;
        _this.openTcpClient(rinfo);
      });

      _this.discoveryClient.on('close', function () {
        _this.connected = false;
      });

      _this.discoveryClient.start();

      return _promise2.default.resolve(_this);
    }).catch(function (err) {
      return console.error(err);
    });
  },
  openTcpClient: function openTcpClient(rinfo) {
    var _this2 = this;

    console.log('openTcpClient', 'open');
    // if we appear connected, keep trying to open the socket
    if (this.connected) {
      this.tcpClient = _net2.default.createConnection({ port: TCP_PORT, host: rinfo.address }, function () {
        var handshakeMsg = {
          type: 'HANDSHAKE',
          payload: { hostname: _this2.hostname }
        };

        console.log('openTcpClient', 'opened');
        _this2.tcpClient.write((0, _stringify2.default)(handshakeMsg) + MSG_DELIMITER);
        _this2.tcpClient.pipe((0, _split2.default)(MSG_DELIMITER)).on('data', _this2.dispatch);
      });

      this.tcpClient.on('end', function () {
        setTimeout(function () {
          _this2.openTcpClient(rinfo);
        }, 1000);
      });

      this.tcpClient.on('error', function () {
        setTimeout(function () {
          _this2.openTcpClient(rinfo);
        }, 1000);
      });
    }
  },
  pipeStdOut: function pipeStdOut(data) {
    var msg = {
      type: 'STDOUT',
      payload: {
        msg: data.trim()
      }
    };

    this.tcpClient.write((0, _stringify2.default)(msg) + MSG_DELIMITER);
  },
  pipeStdErr: function pipeStdErr(data) {
    var msg = {
      type: 'STDERR',
      payload: {
        msg: data.trim()
      }
    };

    this.tcpClient.write((0, _stringify2.default)(msg) + MSG_DELIMITER);
  },
  send: function send(data) {
    if (this.tcpClient) {
      this.tcpClient.write((0, _stringify2.default)(data) + MSG_DELIMITER);
    }
  },
  dispatch: function dispatch(data) {
    if (data) {
      var _JSON$parse = JSON.parse(data),
          type = _JSON$parse.type,
          payload = _JSON$parse.payload;

      var tokenUuid = payload.tokenUuid;
      console.log(type, payload);

      switch (type) {
        case 'EXEC':
          {
            var cwd = payload.cwd.replace(/^\~/, this.$HOME);
            var cmd = payload.cmd;

            this.executeCmd(tokenUuid, cwd, cmd);
            break;
          }
        case 'FORK':
          {
            var _cwd = payload.cwd.replace(/^\~/, this.$HOME);
            var parts = payload.cmd.split(' ');
            var _cmd = parts.shift();
            var args = parts;
            console.log(_cwd, _cmd, args);

            this.forkProcess(tokenUuid, _cwd, _cmd, args);
            break;
          }
        case 'KILL':
          {
            this.killProcess(tokenUuid);
            break;
          }
      }
    }
  },
  executeCmd: function executeCmd(tokenUuid, cwd, cmd) {
    var _this3 = this;

    (0, _child_process.exec)(cmd, { cwd: cwd }, function (err, stdout, stderr) {
      if (err) {
        return _this3.pipeStdErr(err.message);
      }

      _this3.pipeStdOut(stdout.toString());
      _this3.pipeStdErr(stderr.toString());

      var ack = {
        type: 'EXEC_ACK',
        payload: { tokenUuid: tokenUuid }
      };

      _this3.send(ack);
    });
  },
  forkProcess: function forkProcess(tokenUuid, cwd, cmd, args) {
    var _this4 = this;

    var fork = function fork() {
      var proc = (0, _child_process.spawn)(cmd, args, { cwd: cwd });

      // remove end of line as console.log will add a new one
      proc.stdout.on('data', function (data) {
        return _this4.pipeStdOut(data.toString());
      });
      proc.stderr.on('data', function (data) {
        return _this4.pipeStdErr(data.toString());
      });
      proc.on('close', function (code) {
        return _this4.pipeStdOut('exit child process (code ' + code + ')');
      });
      proc.on('error', function (err) {
        return _this4.pipeStdErr('' + err.message);
      });

      forkedProcess.uuid = tokenUuid;
      forkedProcess.proc = proc;

      var ack = {
        type: 'FORK_ACK',
        payload: { forkTokenUuid: tokenUuid }
      };

      _this4.send(ack);
    };

    if (forkedProcess.proc === null) {
      fork();
    } else {
      // if a process was running from a previous controller session, kill it
      var proc = forkedProcess.proc;


      this.pipeStdOut('kill process (pid: ' + proc.pid + ')');

      (0, _terminate2.default)(proc.pid, function (err) {
        if (err) {
          _this4.pipeStdErr('...an error occured while killing process (pid: ' + proc.pid + '): "' + err.message + '"');
        }

        forkedProcess.proc = null;
        forkedProcess.uuid = null;

        fork();
      });
    }
  },
  killProcess: function killProcess(killTokenUuid) {
    var _this5 = this;

    var proc = forkedProcess.proc,
        uuid = forkedProcess.uuid;

    var forkTokenUuid = uuid;
    var ack = {
      type: 'KILL_ACK',
      payload: {
        killTokenUuid: killTokenUuid,
        forkTokenUuid: forkTokenUuid
      }
    };

    if (proc !== null && proc.pid) {
      var _forkTokenUuid = uuid;

      (0, _terminate2.default)(proc.pid, function (err) {
        if (err) {
          _this5.pipeStdErr('...an error occured while killing process (pid: ' + proc.pid + '): "' + err.message + '"');
        }

        forkedProcess.proc = null;
        forkedProcess.uuid = null;

        _this5.send(ack);
      });
    } else {
      this.pipeStdErr('cannot kill inexisting process');

      forkedProcess.proc = null;
      forkedProcess.uuid = null;

      this.send(ack);
    }
  },
  quit: function quit() {
    this.discoveryClient.stop();
    this.tcpClient.end();
  }
};

exports.default = client;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsaWVudC5qcyJdLCJuYW1lcyI6WyJNU0dfREVMSU1JVEVSIiwiZm9ya2VkUHJvY2VzcyIsInV1aWQiLCJwcm9jIiwiVENQX1BPUlQiLCJjbGllbnQiLCJpbml0aWFsaXplIiwiZGVidWciLCJkaXNwYXRjaCIsImJpbmQiLCJ0Y3BDbGllbnQiLCIkSE9NRSIsInRvU3RyaW5nIiwicmVwbGFjZSIsImVyciIsImNvbnNvbGUiLCJlcnJvciIsInN0YWNrIiwicG9ydFByb21pc2UiLCJob3N0bmFtZSIsIm9zIiwicmVzb2x2ZSIsImNvbmZpZyIsIkJST0FEQ0FTVF9QT1JUIiwicGFyc2VJbnQiLCJNYXRoIiwicmFuZG9tIiwidGhlbiIsImRpc2NvdmVyeUNsaWVudCIsIkRpc2NvdmVyeUNsaWVudCIsInBvcnQiLCJvbiIsInJpbmZvIiwiY29ubmVjdGVkIiwib3BlblRjcENsaWVudCIsInN0YXJ0IiwiY2F0Y2giLCJsb2ciLCJuZXQiLCJjcmVhdGVDb25uZWN0aW9uIiwiaG9zdCIsImFkZHJlc3MiLCJoYW5kc2hha2VNc2ciLCJ0eXBlIiwicGF5bG9hZCIsIndyaXRlIiwicGlwZSIsInNldFRpbWVvdXQiLCJwaXBlU3RkT3V0IiwiZGF0YSIsIm1zZyIsInRyaW0iLCJwaXBlU3RkRXJyIiwic2VuZCIsIkpTT04iLCJwYXJzZSIsInRva2VuVXVpZCIsImN3ZCIsImNtZCIsImV4ZWN1dGVDbWQiLCJwYXJ0cyIsInNwbGl0Iiwic2hpZnQiLCJhcmdzIiwiZm9ya1Byb2Nlc3MiLCJraWxsUHJvY2VzcyIsInN0ZG91dCIsInN0ZGVyciIsIm1lc3NhZ2UiLCJhY2siLCJmb3JrIiwiY29kZSIsImZvcmtUb2tlblV1aWQiLCJwaWQiLCJraWxsVG9rZW5VdWlkIiwicXVpdCIsInN0b3AiLCJlbmQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUE7Ozs7QUFDQTs7OztBQUNBOztBQUNBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7Ozs7O0FBRUEsSUFBTUEsZ0JBQWdC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bkUsc0JBQWNFLElBQWQsR0FBcUIsSUFBckI7QUFDQUYsc0JBQWNDLElBQWQsR0FBcUIsSUFBckI7O0FBRUEsZUFBS21ELElBQUwsQ0FBVWdCLEdBQVY7QUFDRCxPQVREO0FBVUQsS0FiRCxNQWFPO0FBQ0wsV0FBS2pCLFVBQUwsQ0FBZ0IsZ0NBQWhCOztBQUVBbkQsb0JBQWNFLElBQWQsR0FBcUIsSUFBckI7QUFDQUYsb0JBQWNDLElBQWQsR0FBcUIsSUFBckI7O0FBRUEsV0FBS21ELElBQUwsQ0FBVWdCLEdBQVY7QUFDRDtBQUNGLEdBNU5ZO0FBOE5iTSxNQTlOYSxrQkE4Tk47QUFDTCxTQUFLL0MsZUFBTCxDQUFxQmdELElBQXJCO0FBQ0EsU0FBS2xFLFNBQUwsQ0FBZW1FLEdBQWY7QUFDRDtBQWpPWSxDQUFmOztrQkFvT2V4RSxNIiwiZmlsZSI6ImNsaWVudC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBvcyBmcm9tICdvcyc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBleGVjLCBleGVjU3luYywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IERpc2NvdmVyeUNsaWVudCwgY29uZmlnIH0gZnJvbSAnQGlyY2FtL25vZGUtZGlzY292ZXJ5JztcbmltcG9ydCBnZXRQb3J0IGZyb20gJ2dldC1wb3J0JztcbmltcG9ydCB0ZXJtaW5hdGUgZnJvbSAndGVybWluYXRlJztcbmltcG9ydCBzcGxpdCBmcm9tICdzcGxpdCc7XG5cbmNvbnN0IE1TR19ERUxJTUlURVIgPSAnQU1FSVpFX01TR19ERUxJTUlURVJfJDM1Mk5TMGxBWkwmJztcblxuLy8gcmVmZXJlbmNlIHRvIHRoZSBmb3JrZWQgcHJvY2Vzc1xuY29uc3QgZm9ya2VkUHJvY2VzcyA9IHtcbiAgdXVpZDogbnVsbCxcbiAgcHJvYzogbnVsbCxcbn07XG5cbmNvbnN0IFRDUF9QT1JUID0gODA5MTtcblxuLy8gY2xpZW50IG9mIHRoZSBhbWVpemUtY29udHJvbGxlclxuY29uc3QgY2xpZW50ID0ge1xuICBpbml0aWFsaXplKHtcbiAgICBkZWJ1ZyA9IGZhbHNlLFxuICB9ID0ge30pIHtcblxuICAgIHRoaXMuZGlzcGF0Y2ggPSB0aGlzLmRpc3BhdGNoLmJpbmQodGhpcyk7XG4gICAgdGhpcy50Y3BDbGllbnQgPSBudWxsO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuJEhPTUUgPSBleGVjU3luYygnZWNobyAkSE9NRScpLnRvU3RyaW5nKCkucmVwbGFjZSgvXFxzJC9nLCAnJyk7XG4gICAgfSBjYXRjaChlcnIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrKTtcbiAgICB9XG5cbiAgICBsZXQgcG9ydFByb21pc2U7XG5cbiAgICBpZiAoIWRlYnVnKSB7XG4gICAgICB0aGlzLmhvc3RuYW1lID0gb3MuaG9zdG5hbWUoKTsgLy8gbWF5IGJlIG92ZXJyaWRlbiBpZiBgZGVidWc9dHJ1ZWBcbiAgICAgIHBvcnRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGNvbmZpZy5CUk9BRENBU1RfUE9SVCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSBgYW1laXplLWNsaWVudC0ke3BhcnNlSW50KE1hdGgucmFuZG9tKCkgKiAxMDAwMDApfWA7XG4gICAgICBwb3J0UHJvbWlzZSA9IGdldFBvcnQoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcG9ydFByb21pc2UudGhlbihwb3J0ID0+IHtcbiAgICAgIHRoaXMuZGlzY292ZXJ5Q2xpZW50ID0gbmV3IERpc2NvdmVyeUNsaWVudCh7IHBvcnQ6IHBvcnQgfSk7XG5cbiAgICAgIHRoaXMuZGlzY292ZXJ5Q2xpZW50Lm9uKCdjb25uZWN0aW9uJywgKHJpbmZvKSA9PiB7XG4gICAgICAgIHRoaXMuY29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5vcGVuVGNwQ2xpZW50KHJpbmZvKTtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmRpc2NvdmVyeUNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgIHRoaXMuY29ubmVjdGVkID0gZmFsc2U7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5kaXNjb3ZlcnlDbGllbnQuc3RhcnQoKTtcblxuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9KVxuICAgIC5jYXRjaChlcnIgPT4gY29uc29sZS5lcnJvcihlcnIpKTtcbiAgfSxcblxuICBvcGVuVGNwQ2xpZW50KHJpbmZvKSB7XG4gICAgY29uc29sZS5sb2coJ29wZW5UY3BDbGllbnQnLCAnb3BlbicpO1xuICAgIC8vIGlmIHdlIGFwcGVhciBjb25uZWN0ZWQsIGtlZXAgdHJ5aW5nIHRvIG9wZW4gdGhlIHNvY2tldFxuICAgIGlmICh0aGlzLmNvbm5lY3RlZCkge1xuICAgICAgdGhpcy50Y3BDbGllbnQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IHBvcnQ6IFRDUF9QT1JULCBob3N0OiByaW5mby5hZGRyZXNzIH0sICgpID0+IHtcbiAgICAgICAgY29uc3QgaGFuZHNoYWtlTXNnID0ge1xuICAgICAgICAgIHR5cGU6ICdIQU5EU0hBS0UnLFxuICAgICAgICAgIHBheWxvYWQ6IHsgaG9zdG5hbWU6IHRoaXMuaG9zdG5hbWUgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zb2xlLmxvZygnb3BlblRjcENsaWVudCcsICdvcGVuZWQnKTtcbiAgICAgICAgdGhpcy50Y3BDbGllbnQud3JpdGUoSlNPTi5zdHJpbmdpZnkoaGFuZHNoYWtlTXNnKSArIE1TR19ERUxJTUlURVIpO1xuICAgICAgICB0aGlzLnRjcENsaWVudC5waXBlKHNwbGl0KE1TR19ERUxJTUlURVIpKS5vbignZGF0YScsIHRoaXMuZGlzcGF0Y2gpO1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudGNwQ2xpZW50Lm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyB0aGlzLm9wZW5UY3BDbGllbnQocmluZm8pIH0sIDEwMDApO1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudGNwQ2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IHRoaXMub3BlblRjcENsaWVudChyaW5mbykgfSwgMTAwMCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG5cbiAgcGlwZVN0ZE91dChkYXRhKSB7XG4gICAgY29uc3QgbXNnID0ge1xuICAgICAgdHlwZTogJ1NURE9VVCcsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIG1zZzogZGF0YS50cmltKCksXG4gICAgICB9LFxuICAgIH07XG5cbiAgICB0aGlzLnRjcENsaWVudC53cml0ZShKU09OLnN0cmluZ2lmeShtc2cpICsgTVNHX0RFTElNSVRFUik7XG4gIH0sXG5cbiAgcGlwZVN0ZEVycihkYXRhKSB7XG4gICAgY29uc3QgbXNnID0ge1xuICAgICAgdHlwZTogJ1NUREVSUicsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIG1zZzogZGF0YS50cmltKCksXG4gICAgICB9LFxuICAgIH07XG5cbiAgICB0aGlzLnRjcENsaWVudC53cml0ZShKU09OLnN0cmluZ2lmeShtc2cpICsgTVNHX0RFTElNSVRFUik7XG4gIH0sXG5cbiAgc2VuZChkYXRhKSB7XG4gICAgaWYgKHRoaXMudGNwQ2xpZW50KSB7XG4gICAgICB0aGlzLnRjcENsaWVudC53cml0ZShKU09OLnN0cmluZ2lmeShkYXRhKSArIE1TR19ERUxJTUlURVIpO1xuICAgIH1cbiAgfSxcblxuICBkaXNwYXRjaChkYXRhKSB7XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgIGNvbnN0IHsgdHlwZSwgcGF5bG9hZCB9ID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgIGNvbnN0IHRva2VuVXVpZCA9IHBheWxvYWQudG9rZW5VdWlkO1xuICAgICAgY29uc29sZS5sb2codHlwZSwgcGF5bG9hZCk7XG5cbiAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlICdFWEVDJzoge1xuICAgICAgICAgIGNvbnN0IGN3ZCA9IHBheWxvYWQuY3dkLnJlcGxhY2UoL15cXH4vLCB0aGlzLiRIT01FKTtcbiAgICAgICAgICBjb25zdCBjbWQgPSBwYXlsb2FkLmNtZDtcblxuICAgICAgICAgIHRoaXMuZXhlY3V0ZUNtZCh0b2tlblV1aWQsIGN3ZCwgY21kKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdGT1JLJzoge1xuICAgICAgICAgIGNvbnN0IGN3ZCA9IHBheWxvYWQuY3dkLnJlcGxhY2UoL15cXH4vLCB0aGlzLiRIT01FKTtcbiAgICAgICAgICBjb25zdCBwYXJ0cyA9IHBheWxvYWQuY21kLnNwbGl0KCcgJyk7XG4gICAgICAgICAgY29uc3QgY21kID0gcGFydHMuc2hpZnQoKTtcbiAgICAgICAgICBjb25zdCBhcmdzID0gcGFydHM7XG4gICAgICAgICAgY29uc29sZS5sb2coY3dkLCBjbWQsIGFyZ3MpO1xuXG4gICAgICAgICAgdGhpcy5mb3JrUHJvY2Vzcyh0b2tlblV1aWQsIGN3ZCwgY21kLCBhcmdzKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdLSUxMJzoge1xuICAgICAgICAgIHRoaXMua2lsbFByb2Nlc3ModG9rZW5VdWlkKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSxcblxuICBleGVjdXRlQ21kKHRva2VuVXVpZCwgY3dkLCBjbWQpIHtcbiAgICBleGVjKGNtZCwgeyBjd2QgfSwgKGVyciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGlwZVN0ZEVycihlcnIubWVzc2FnZSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMucGlwZVN0ZE91dChzdGRvdXQudG9TdHJpbmcoKSk7XG4gICAgICB0aGlzLnBpcGVTdGRFcnIoc3RkZXJyLnRvU3RyaW5nKCkpO1xuXG4gICAgICBjb25zdCBhY2sgPSB7XG4gICAgICAgIHR5cGU6ICdFWEVDX0FDSycsXG4gICAgICAgIHBheWxvYWQ6IHsgdG9rZW5VdWlkIH0sXG4gICAgICB9O1xuXG4gICAgICB0aGlzLnNlbmQoYWNrKTtcbiAgICB9KTtcbiAgfSxcblxuICBmb3JrUHJvY2Vzcyh0b2tlblV1aWQsIGN3ZCwgY21kLCBhcmdzKSB7XG4gICAgY29uc3QgZm9yayA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHByb2MgPSBzcGF3bihjbWQsIGFyZ3MsIHsgY3dkIH0pO1xuXG4gICAgICAvLyByZW1vdmUgZW5kIG9mIGxpbmUgYXMgY29uc29sZS5sb2cgd2lsbCBhZGQgYSBuZXcgb25lXG4gICAgICBwcm9jLnN0ZG91dC5vbignZGF0YScsIGRhdGEgPT4gdGhpcy5waXBlU3RkT3V0KGRhdGEudG9TdHJpbmcoKSkpO1xuICAgICAgcHJvYy5zdGRlcnIub24oJ2RhdGEnLCBkYXRhID0+IHRoaXMucGlwZVN0ZEVycihkYXRhLnRvU3RyaW5nKCkpKTtcbiAgICAgIHByb2Mub24oJ2Nsb3NlJywgY29kZSA9PiB0aGlzLnBpcGVTdGRPdXQoYGV4aXQgY2hpbGQgcHJvY2VzcyAoY29kZSAke2NvZGV9KWApKTtcbiAgICAgIHByb2Mub24oJ2Vycm9yJywgZXJyID0+IHRoaXMucGlwZVN0ZEVycihgJHtlcnIubWVzc2FnZX1gKSk7XG5cbiAgICAgIGZvcmtlZFByb2Nlc3MudXVpZCA9IHRva2VuVXVpZDtcbiAgICAgIGZvcmtlZFByb2Nlc3MucHJvYyA9IHByb2M7XG5cbiAgICAgIGNvbnN0IGFjayA9IHtcbiAgICAgICAgdHlwZTogJ0ZPUktfQUNLJyxcbiAgICAgICAgcGF5bG9hZDogeyBmb3JrVG9rZW5VdWlkOiB0b2tlblV1aWQgfSxcbiAgICAgIH07XG5cbiAgICAgIHRoaXMuc2VuZChhY2spO1xuICAgIH1cblxuICAgIGlmIChmb3JrZWRQcm9jZXNzLnByb2MgPT09IG51bGwpIHtcbiAgICAgIGZvcmsoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gaWYgYSBwcm9jZXNzIHdhcyBydW5uaW5nIGZyb20gYSBwcmV2aW91cyBjb250cm9sbGVyIHNlc3Npb24sIGtpbGwgaXRcbiAgICAgIGNvbnN0IHsgcHJvYyB9ID0gZm9ya2VkUHJvY2VzcztcblxuICAgICAgdGhpcy5waXBlU3RkT3V0KGBraWxsIHByb2Nlc3MgKHBpZDogJHtwcm9jLnBpZH0pYCk7XG5cbiAgICAgIHRlcm1pbmF0ZShwcm9jLnBpZCwgZXJyID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHRoaXMucGlwZVN0ZEVycihgLi4uYW4gZXJyb3Igb2NjdXJlZCB3aGlsZSBraWxsaW5nIHByb2Nlc3MgKHBpZDogJHtwcm9jLnBpZH0pOiBcIiR7ZXJyLm1lc3NhZ2V9XCJgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcmtlZFByb2Nlc3MucHJvYyA9IG51bGw7XG4gICAgICAgIGZvcmtlZFByb2Nlc3MudXVpZCA9IG51bGw7XG5cbiAgICAgICAgZm9yaygpO1xuICAgICAgfSk7XG4gICAgfVxuICB9LFxuXG4gIGtpbGxQcm9jZXNzKGtpbGxUb2tlblV1aWQpIHtcbiAgICBjb25zdCB7IHByb2MsIHV1aWQgfSA9IGZvcmtlZFByb2Nlc3M7XG4gICAgY29uc3QgZm9ya1Rva2VuVXVpZCA9IHV1aWQ7XG4gICAgY29uc3QgYWNrID0ge1xuICAgICAgdHlwZTogJ0tJTExfQUNLJyxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAga2lsbFRva2VuVXVpZCxcbiAgICAgICAgZm9ya1Rva2VuVXVpZCxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGlmIChwcm9jICE9PSBudWxsICYmIHByb2MucGlkKSB7XG4gICAgICBjb25zdCBmb3JrVG9rZW5VdWlkID0gdXVpZDtcblxuICAgICAgdGVybWluYXRlKHByb2MucGlkLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgdGhpcy5waXBlU3RkRXJyKGAuLi5hbiBlcnJvciBvY2N1cmVkIHdoaWxlIGtpbGxpbmcgcHJvY2VzcyAocGlkOiAke3Byb2MucGlkfSk6IFwiJHtlcnIubWVzc2FnZX1cImApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ya2VkUHJvY2Vzcy5wcm9jID0gbnVsbDtcbiAgICAgICAgZm9ya2VkUHJvY2Vzcy51dWlkID0gbnVsbDtcblxuICAgICAgICB0aGlzLnNlbmQoYWNrKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnBpcGVTdGRFcnIoJ2Nhbm5vdCBraWxsIGluZXhpc3RpbmcgcHJvY2VzcycpO1xuXG4gICAgICBmb3JrZWRQcm9jZXNzLnByb2MgPSBudWxsO1xuICAgICAgZm9ya2VkUHJvY2Vzcy51dWlkID0gbnVsbDtcblxuICAgICAgdGhpcy5zZW5kKGFjayk7XG4gICAgfVxuICB9LFxuXG4gIHF1aXQoKSB7XG4gICAgdGhpcy5kaXNjb3ZlcnlDbGllbnQuc3RvcCgpO1xuICAgIHRoaXMudGNwQ2xpZW50LmVuZCgpO1xuICB9LFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGllbnQ7XG4iXX0=