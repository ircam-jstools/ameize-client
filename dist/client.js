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

function sanitizeJSON(unsanitized) {
  return unsanitized.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\f/g, "\\f").replace(/"/g, "\\\"").replace(/'/g, "\\\'").replace(/\&/g, "\\&");
}

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsaWVudC5qcyJdLCJuYW1lcyI6WyJNU0dfREVMSU1JVEVSIiwic2FuaXRpemVKU09OIiwidW5zYW5pdGl6ZWQiLCJyZXBsYWNlIiwiZm9ya2VkUHJvY2VzcyIsInV1aWQiLCJwcm9jIiwiVENQX1BPUlQiLCJjbGllbnQiLCJpbml0aWFsaXplIiwiZGVidWciLCJkaXNwYXRjaCIsImJpbmQiLCJ0Y3BDbGllbnQiLCIkSE9NRSIsInRvU3RyaW5nIiwiZXJyIiwiY29uc29sZSIsImVycm9yIiwic3RhY2siLCJwb3J0UHJvbWlzZSIsImhvc3RuYW1lIiwib3MiLCJyZXNvbHZlIiwiY29uZmlnIiwiQlJPQURDQVNUX1BPUlQiLCJwYXJzZUludCIsIk1hdGgiLCJyYW5kb20iLCJ0aGVuIiwiZGlzY292ZXJ5Q2xpZW50IiwiRGlzY292ZXJ5Q2xpZW50IiwicG9ydCIsIm9uIiwicmluZm8iLCJjb25uZWN0ZWQiLCJvcGVuVGNwQ2xpZW50Iiwic3RhcnQiLCJjYXRjaCIsImxvZyIsIm5ldCIsImNyZWF0ZUNvbm5lY3Rpb24iLCJob3N0IiwiYWRkcmVzcyIsImhhbmRzaGFrZU1zZyIsInR5cGUiLCJwYXlsb2FkIiwid3JpdGUiLCJwaXBlIiwic2V0VGltZW91dCIsInBpcGVTdGRPdXQiLCJkYXRhIiwibXNnIiwidHJpbSIsInBpcGVTdGRFcnIiLCJzZW5kIiwiSlNPTiIsInBhcnNlIiwidG9rZW5VdWlkIiwiY3dkIiwiY21kIiwiZXhlY3V0ZUNtZCIsInBhcnRzIiwic3BsaXQiLCJzaGlmdCIsImFyZ3MiLCJmb3JrUHJvY2VzcyIsImtpbGxQcm9jZXNzIiwic3Rkb3V0Iiwic3RkZXJyIiwibWVzc2FnZSIsImFjayIsImZvcmsiLCJjb2RlIiwiZm9ya1Rva2VuVXVpZCIsInBpZCIsImtpbGxUb2tlblV1aWQiLCJxdWl0Iiwic3RvcCIsImVuZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7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QURpQixHQUNGRixhQURFLENBQ2pCRSxJQURpQjtBQUFBLFFBQ1hELElBRFcsR0FDRkQsYUFERSxDQUNYQyxJQURXOztBQUV6QixRQUFNcUUsZ0JBQWdCckUsSUFBdEI7QUFDQSxRQUFNa0UsTUFBTTtBQUNWMUIsWUFBTSxVQURJO0FBRVZDLGVBQVM7QUFDUDhCLG9DQURPO0FBRVBGO0FBRk87QUFGQyxLQUFaOztBQVFBLFFBQUlwRSxTQUFTLElBQVQsSUFBaUJBLEtBQUtxRSxHQUExQixFQUErQjtBQUM3QixVQUFNRCxpQkFBZ0JyRSxJQUF0Qjs7QUFFQSwrQkFBVUMsS0FBS3FFLEdBQWYsRUFBb0IsZUFBTztBQUN6QixZQUFJM0QsR0FBSixFQUFTO0FBQ1AsaUJBQUtzQyxVQUFMLHNEQUFtRWhELEtBQUtxRSxHQUF4RSxZQUFrRjNELElBQUlzRCxPQUF0RjtBQUNEOztBQUVEbEUsc0JBQWNFLElBQWQsR0FBcUIsSUFBckI7QUFDQUYsc0JBQWNDLElBQWQsR0FBcUIsSUFBckI7O0FBRUEsZUFBS2tELElBQUwsQ0FBVWdCLEdBQVY7QUFDRCxPQVREO0FBVUQsS0FiRCxNQWFPO0FBQ0wsV0FBS2pCLFVBQUwsQ0FBZ0IsZ0NBQWhCOztBQUVBbEQsb0JBQWNFLElBQWQsR0FBcUIsSUFBckI7QUFDQUYsb0JBQWNDLElBQWQsR0FBcUIsSUFBckI7O0FBRUEsV0FBS2tELElBQUwsQ0FBVWdCLEdBQVY7QUFDRDtBQUNGLEdBNU5ZO0FBOE5iTSxNQTlOYSxrQkE4Tk47QUFDTCxTQUFLL0MsZUFBTCxDQUFxQmdELElBQXJCO0FBQ0EsU0FBS2pFLFNBQUwsQ0FBZWtFLEdBQWY7QUFDRDtBQWpPWSxDQUFmOztrQkFvT2V2RSxNIiwiZmlsZSI6ImNsaWVudC5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBvcyBmcm9tICdvcyc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBleGVjLCBleGVjU3luYywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IERpc2NvdmVyeUNsaWVudCwgY29uZmlnIH0gZnJvbSAnQGlyY2FtL25vZGUtZGlzY292ZXJ5JztcbmltcG9ydCBnZXRQb3J0IGZyb20gJ2dldC1wb3J0JztcbmltcG9ydCB0ZXJtaW5hdGUgZnJvbSAndGVybWluYXRlJztcbmltcG9ydCBzcGxpdCBmcm9tICdzcGxpdCc7XG5cbmNvbnN0IE1TR19ERUxJTUlURVIgPSAnQU1FSVpFX01TR19ERUxJTUlURVJfJDM1Mk5TMGxBWkwmJztcblxuZnVuY3Rpb24gc2FuaXRpemVKU09OKHVuc2FuaXRpemVkKXtcbiAgICByZXR1cm4gdW5zYW5pdGl6ZWQucmVwbGFjZSgvXFxcXC9nLCBcIlxcXFxcXFxcXCIpLnJlcGxhY2UoL1xcbi9nLCBcIlxcXFxuXCIpLnJlcGxhY2UoL1xcci9nLCBcIlxcXFxyXCIpLnJlcGxhY2UoL1xcdC9nLCBcIlxcXFx0XCIpLnJlcGxhY2UoL1xcZi9nLCBcIlxcXFxmXCIpLnJlcGxhY2UoL1wiL2csXCJcXFxcXFxcIlwiKS5yZXBsYWNlKC8nL2csXCJcXFxcXFwnXCIpLnJlcGxhY2UoL1xcJi9nLCBcIlxcXFwmXCIpO1xufVxuXG4vLyByZWZlcmVuY2UgdG8gdGhlIGZvcmtlZCBwcm9jZXNzXG5jb25zdCBmb3JrZWRQcm9jZXNzID0ge1xuICB1dWlkOiBudWxsLFxuICBwcm9jOiBudWxsLFxufTtcblxuY29uc3QgVENQX1BPUlQgPSA4MDkxO1xuXG4vLyBjbGllbnQgb2YgdGhlIGFtZWl6ZS1jb250cm9sbGVyXG5jb25zdCBjbGllbnQgPSB7XG4gIGluaXRpYWxpemUoe1xuICAgIGRlYnVnID0gZmFsc2UsXG4gIH0gPSB7fSkge1xuXG4gICAgdGhpcy5kaXNwYXRjaCA9IHRoaXMuZGlzcGF0Y2guYmluZCh0aGlzKTtcbiAgICB0aGlzLnRjcENsaWVudCA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy4kSE9NRSA9IGV4ZWNTeW5jKCdlY2hvICRIT01FJykudG9TdHJpbmcoKS5yZXBsYWNlKC9cXHMkL2csICcnKTtcbiAgICB9IGNhdGNoKGVycikge1xuICAgICAgY29uc29sZS5lcnJvcihlcnIuc3RhY2spO1xuICAgIH1cblxuICAgIGxldCBwb3J0UHJvbWlzZTtcblxuICAgIGlmICghZGVidWcpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSBvcy5ob3N0bmFtZSgpOyAvLyBtYXkgYmUgb3ZlcnJpZGVuIGlmIGBkZWJ1Zz10cnVlYFxuICAgICAgcG9ydFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoY29uZmlnLkJST0FEQ0FTVF9QT1JUKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9IGBhbWVpemUtY2xpZW50LSR7cGFyc2VJbnQoTWF0aC5yYW5kb20oKSAqIDEwMDAwMCl9YDtcbiAgICAgIHBvcnRQcm9taXNlID0gZ2V0UG9ydCgpO1xuICAgIH1cblxuICAgIHJldHVybiBwb3J0UHJvbWlzZS50aGVuKHBvcnQgPT4ge1xuICAgICAgdGhpcy5kaXNjb3ZlcnlDbGllbnQgPSBuZXcgRGlzY292ZXJ5Q2xpZW50KHsgcG9ydDogcG9ydCB9KTtcblxuICAgICAgdGhpcy5kaXNjb3ZlcnlDbGllbnQub24oJ2Nvbm5lY3Rpb24nLCAocmluZm8pID0+IHtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLm9wZW5UY3BDbGllbnQocmluZm8pO1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuZGlzY292ZXJ5Q2xpZW50Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgdGhpcy5jb25uZWN0ZWQgPSBmYWxzZTtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmRpc2NvdmVyeUNsaWVudC5zdGFydCgpO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH0pXG4gICAgLmNhdGNoKGVyciA9PiBjb25zb2xlLmVycm9yKGVycikpO1xuICB9LFxuXG4gIG9wZW5UY3BDbGllbnQocmluZm8pIHtcbiAgICBjb25zb2xlLmxvZygnb3BlblRjcENsaWVudCcsICdvcGVuJyk7XG4gICAgLy8gaWYgd2UgYXBwZWFyIGNvbm5lY3RlZCwga2VlcCB0cnlpbmcgdG8gb3BlbiB0aGUgc29ja2V0XG4gICAgaWYgKHRoaXMuY29ubmVjdGVkKSB7XG4gICAgICB0aGlzLnRjcENsaWVudCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKHsgcG9ydDogVENQX1BPUlQsIGhvc3Q6IHJpbmZvLmFkZHJlc3MgfSwgKCkgPT4ge1xuICAgICAgICBjb25zdCBoYW5kc2hha2VNc2cgPSB7XG4gICAgICAgICAgdHlwZTogJ0hBTkRTSEFLRScsXG4gICAgICAgICAgcGF5bG9hZDogeyBob3N0bmFtZTogdGhpcy5ob3N0bmFtZSB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdvcGVuVGNwQ2xpZW50JywgJ29wZW5lZCcpO1xuICAgICAgICB0aGlzLnRjcENsaWVudC53cml0ZShKU09OLnN0cmluZ2lmeShoYW5kc2hha2VNc2cpICsgTVNHX0RFTElNSVRFUik7XG4gICAgICAgIHRoaXMudGNwQ2xpZW50LnBpcGUoc3BsaXQoTVNHX0RFTElNSVRFUikpLm9uKCdkYXRhJywgdGhpcy5kaXNwYXRjaCk7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy50Y3BDbGllbnQub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IHRoaXMub3BlblRjcENsaWVudChyaW5mbykgfSwgMTAwMCk7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy50Y3BDbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5vcGVuVGNwQ2xpZW50KHJpbmZvKSB9LCAxMDAwKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSxcblxuICBwaXBlU3RkT3V0KGRhdGEpIHtcbiAgICBjb25zdCBtc2cgPSB7XG4gICAgICB0eXBlOiAnU1RET1VUJyxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgbXNnOiBkYXRhLnRyaW0oKSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIHRoaXMudGNwQ2xpZW50LndyaXRlKEpTT04uc3RyaW5naWZ5KG1zZykgKyBNU0dfREVMSU1JVEVSKTtcbiAgfSxcblxuICBwaXBlU3RkRXJyKGRhdGEpIHtcbiAgICBjb25zdCBtc2cgPSB7XG4gICAgICB0eXBlOiAnU1RERVJSJyxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgbXNnOiBkYXRhLnRyaW0oKSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIHRoaXMudGNwQ2xpZW50LndyaXRlKEpTT04uc3RyaW5naWZ5KG1zZykgKyBNU0dfREVMSU1JVEVSKTtcbiAgfSxcblxuICBzZW5kKGRhdGEpIHtcbiAgICBpZiAodGhpcy50Y3BDbGllbnQpIHtcbiAgICAgIHRoaXMudGNwQ2xpZW50LndyaXRlKEpTT04uc3RyaW5naWZ5KGRhdGEpICsgTVNHX0RFTElNSVRFUik7XG4gICAgfVxuICB9LFxuXG4gIGRpc3BhdGNoKGRhdGEpIHtcbiAgICBpZiAoZGF0YSkge1xuICAgICAgY29uc3QgeyB0eXBlLCBwYXlsb2FkIH0gPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgY29uc3QgdG9rZW5VdWlkID0gcGF5bG9hZC50b2tlblV1aWQ7XG4gICAgICBjb25zb2xlLmxvZyh0eXBlLCBwYXlsb2FkKTtcblxuICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgJ0VYRUMnOiB7XG4gICAgICAgICAgY29uc3QgY3dkID0gcGF5bG9hZC5jd2QucmVwbGFjZSgvXlxcfi8sIHRoaXMuJEhPTUUpO1xuICAgICAgICAgIGNvbnN0IGNtZCA9IHBheWxvYWQuY21kO1xuXG4gICAgICAgICAgdGhpcy5leGVjdXRlQ21kKHRva2VuVXVpZCwgY3dkLCBjbWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0ZPUksnOiB7XG4gICAgICAgICAgY29uc3QgY3dkID0gcGF5bG9hZC5jd2QucmVwbGFjZSgvXlxcfi8sIHRoaXMuJEhPTUUpO1xuICAgICAgICAgIGNvbnN0IHBhcnRzID0gcGF5bG9hZC5jbWQuc3BsaXQoJyAnKTtcbiAgICAgICAgICBjb25zdCBjbWQgPSBwYXJ0cy5zaGlmdCgpO1xuICAgICAgICAgIGNvbnN0IGFyZ3MgPSBwYXJ0cztcbiAgICAgICAgICBjb25zb2xlLmxvZyhjd2QsIGNtZCwgYXJncyk7XG5cbiAgICAgICAgICB0aGlzLmZvcmtQcm9jZXNzKHRva2VuVXVpZCwgY3dkLCBjbWQsIGFyZ3MpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ0tJTEwnOiB7XG4gICAgICAgICAgdGhpcy5raWxsUHJvY2Vzcyh0b2tlblV1aWQpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LFxuXG4gIGV4ZWN1dGVDbWQodG9rZW5VdWlkLCBjd2QsIGNtZCkge1xuICAgIGV4ZWMoY21kLCB7IGN3ZCB9LCAoZXJyLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gdGhpcy5waXBlU3RkRXJyKGVyci5tZXNzYWdlKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5waXBlU3RkT3V0KHN0ZG91dC50b1N0cmluZygpKTtcbiAgICAgIHRoaXMucGlwZVN0ZEVycihzdGRlcnIudG9TdHJpbmcoKSk7XG5cbiAgICAgIGNvbnN0IGFjayA9IHtcbiAgICAgICAgdHlwZTogJ0VYRUNfQUNLJyxcbiAgICAgICAgcGF5bG9hZDogeyB0b2tlblV1aWQgfSxcbiAgICAgIH07XG5cbiAgICAgIHRoaXMuc2VuZChhY2spO1xuICAgIH0pO1xuICB9LFxuXG4gIGZvcmtQcm9jZXNzKHRva2VuVXVpZCwgY3dkLCBjbWQsIGFyZ3MpIHtcbiAgICBjb25zdCBmb3JrID0gKCkgPT4ge1xuICAgICAgY29uc3QgcHJvYyA9IHNwYXduKGNtZCwgYXJncywgeyBjd2QgfSk7XG5cbiAgICAgIC8vIHJlbW92ZSBlbmQgb2YgbGluZSBhcyBjb25zb2xlLmxvZyB3aWxsIGFkZCBhIG5ldyBvbmVcbiAgICAgIHByb2Muc3Rkb3V0Lm9uKCdkYXRhJywgZGF0YSA9PiB0aGlzLnBpcGVTdGRPdXQoZGF0YS50b1N0cmluZygpKSk7XG4gICAgICBwcm9jLnN0ZGVyci5vbignZGF0YScsIGRhdGEgPT4gdGhpcy5waXBlU3RkRXJyKGRhdGEudG9TdHJpbmcoKSkpO1xuICAgICAgcHJvYy5vbignY2xvc2UnLCBjb2RlID0+IHRoaXMucGlwZVN0ZE91dChgZXhpdCBjaGlsZCBwcm9jZXNzIChjb2RlICR7Y29kZX0pYCkpO1xuICAgICAgcHJvYy5vbignZXJyb3InLCBlcnIgPT4gdGhpcy5waXBlU3RkRXJyKGAke2Vyci5tZXNzYWdlfWApKTtcblxuICAgICAgZm9ya2VkUHJvY2Vzcy51dWlkID0gdG9rZW5VdWlkO1xuICAgICAgZm9ya2VkUHJvY2Vzcy5wcm9jID0gcHJvYztcblxuICAgICAgY29uc3QgYWNrID0ge1xuICAgICAgICB0eXBlOiAnRk9SS19BQ0snLFxuICAgICAgICBwYXlsb2FkOiB7IGZvcmtUb2tlblV1aWQ6IHRva2VuVXVpZCB9LFxuICAgICAgfTtcblxuICAgICAgdGhpcy5zZW5kKGFjayk7XG4gICAgfVxuXG4gICAgaWYgKGZvcmtlZFByb2Nlc3MucHJvYyA9PT0gbnVsbCkge1xuICAgICAgZm9yaygpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBpZiBhIHByb2Nlc3Mgd2FzIHJ1bm5pbmcgZnJvbSBhIHByZXZpb3VzIGNvbnRyb2xsZXIgc2Vzc2lvbiwga2lsbCBpdFxuICAgICAgY29uc3QgeyBwcm9jIH0gPSBmb3JrZWRQcm9jZXNzO1xuXG4gICAgICB0aGlzLnBpcGVTdGRPdXQoYGtpbGwgcHJvY2VzcyAocGlkOiAke3Byb2MucGlkfSlgKTtcblxuICAgICAgdGVybWluYXRlKHByb2MucGlkLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgdGhpcy5waXBlU3RkRXJyKGAuLi5hbiBlcnJvciBvY2N1cmVkIHdoaWxlIGtpbGxpbmcgcHJvY2VzcyAocGlkOiAke3Byb2MucGlkfSk6IFwiJHtlcnIubWVzc2FnZX1cImApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9ya2VkUHJvY2Vzcy5wcm9jID0gbnVsbDtcbiAgICAgICAgZm9ya2VkUHJvY2Vzcy51dWlkID0gbnVsbDtcblxuICAgICAgICBmb3JrKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG5cbiAga2lsbFByb2Nlc3Moa2lsbFRva2VuVXVpZCkge1xuICAgIGNvbnN0IHsgcHJvYywgdXVpZCB9ID0gZm9ya2VkUHJvY2VzcztcbiAgICBjb25zdCBmb3JrVG9rZW5VdWlkID0gdXVpZDtcbiAgICBjb25zdCBhY2sgPSB7XG4gICAgICB0eXBlOiAnS0lMTF9BQ0snLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBraWxsVG9rZW5VdWlkLFxuICAgICAgICBmb3JrVG9rZW5VdWlkLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgaWYgKHByb2MgIT09IG51bGwgJiYgcHJvYy5waWQpIHtcbiAgICAgIGNvbnN0IGZvcmtUb2tlblV1aWQgPSB1dWlkO1xuXG4gICAgICB0ZXJtaW5hdGUocHJvYy5waWQsIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICB0aGlzLnBpcGVTdGRFcnIoYC4uLmFuIGVycm9yIG9jY3VyZWQgd2hpbGUga2lsbGluZyBwcm9jZXNzIChwaWQ6ICR7cHJvYy5waWR9KTogXCIke2Vyci5tZXNzYWdlfVwiYCk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3JrZWRQcm9jZXNzLnByb2MgPSBudWxsO1xuICAgICAgICBmb3JrZWRQcm9jZXNzLnV1aWQgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuc2VuZChhY2spO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGlwZVN0ZEVycignY2Fubm90IGtpbGwgaW5leGlzdGluZyBwcm9jZXNzJyk7XG5cbiAgICAgIGZvcmtlZFByb2Nlc3MucHJvYyA9IG51bGw7XG4gICAgICBmb3JrZWRQcm9jZXNzLnV1aWQgPSBudWxsO1xuXG4gICAgICB0aGlzLnNlbmQoYWNrKTtcbiAgICB9XG4gIH0sXG5cbiAgcXVpdCgpIHtcbiAgICB0aGlzLmRpc2NvdmVyeUNsaWVudC5zdG9wKCk7XG4gICAgdGhpcy50Y3BDbGllbnQuZW5kKCk7XG4gIH0sXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsaWVudDtcbiJdfQ==