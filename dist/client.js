'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _nodeDiscovery = require('@ircam/node-discovery');

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _getPort = require('get-port');

var _getPort2 = _interopRequireDefault(_getPort);

var _child_process = require('child_process');

var _readline = require('readline');

var _readline2 = _interopRequireDefault(_readline);

var _terminate = require('terminate');

var _terminate2 = _interopRequireDefault(_terminate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import captureConsole from 'capture-console';
var intercept = require("intercept-stdout");
var captureConsole = require('capture-console');

var client = {
  initialize: function initialize() {
    var _this = this;

    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref$debug = _ref.debug,
        debug = _ref$debug === undefined ? false : _ref$debug;

    this.dispatch = this.dispatch.bind(this);
    this.$HOME = null;
    this.hostname = _os2.default.hostname(); // may be overriden if `debug=true`

    this.forkedProcess = {
      uuid: null,
      proc: null
    };

    var homePromise = new _promise2.default(function (resolve, reject) {
      (0, _child_process.exec)('echo $HOME', function (err, stdout, stderr) {
        if (err) return console.error(err);
        // remove trailing new line
        resolve(stdout.toString().replace(/\s$/g, ''));
      });
    });

    var discoveryOptions = {
      verbose: false,
      port: _nodeDiscovery.config.BROADCAST_PORT
    };

    var discoveryPromise = null;

    if (debug === false) {
      discoveryPromise = _promise2.default.resolve(discoveryOptions);
    } else {
      discoveryPromise = (0, _getPort2.default)().then(function (port) {
        // create dummy hostname in debug mode
        _this.hostname = 'wat-debug-' + parseInt(Math.random() * 100);

        discoveryOptions.verbose = true;
        discoveryOptions.port = port;

        return discoveryOptions;
      }).catch(function (err) {
        return console.error(err.stack);
      });
    }

    return _promise2.default.all([homePromise, discoveryPromise]).then(function (_ref2) {
      var _ref3 = (0, _slicedToArray3.default)(_ref2, 2),
          homePath = _ref3[0],
          discoveryOptions = _ref3[1];

      _this.$HOME = homePath;

      discoveryOptions.payload = { hostname: _this.hostname };

      _this.discoveryOptions = discoveryOptions;
      _this.udpClient = new _nodeDiscovery.DiscoveryClient(discoveryOptions);

      _this.udpClient.once('connection', function () {

        captureConsole.startIntercept(process.stdout, function (stdout) {
          _this.udpClient.send('STDOUT ' + stdout.toString());
        });

        captureConsole.startIntercept(process.stderr, function (stderr) {
          _this.udpClient.send('STDERR ' + stderr.toString());
        });

        console.log(_this.hostname + ' connected');
      });

      // receive only message that do not match the discovery protocol
      _this.udpClient.on('message', _this.dispatch);
      _this.udpClient.start();

      return _promise2.default.resolve(_this);
    }).catch(function (err) {
      return console.error(err);
    });
  },
  dispatch: function dispatch(buffer, rinfo) {
    var msg = buffer.toString().replace(/\s\s+/g, ' ').split(' ');
    var protocol = msg.shift();
    var tokenUuid = msg.shift();

    switch (protocol) {
      case 'EXEC':
        {
          var cwd = msg.shift().replace(/^\~/, this.$HOME);
          var cmd = msg.join(' ');

          this.executeCmd(tokenUuid, cwd, cmd);
          break;
        }
      case 'FORK':
        {
          var _cwd = msg.shift().replace(/^\~/, this.$HOME);
          var _cmd = msg.shift();
          var args = msg;

          this.forkProcess(tokenUuid, _cwd, _cmd, args);
          break;
        }
      case 'KILL':
        {
          this.killProcess(tokenUuid);
          break;
        }
    }
  },
  executeCmd: function executeCmd(tokenUuid, cwd, cmd) {
    var _this2 = this;

    (0, _child_process.exec)(cmd, { cwd: cwd }, function (err, stdout, stderr) {
      if (err) return console.error(err);

      console.log(stdout.toString());
      console.log(stderr.toString());

      var ack = 'EXEC_ACK ' + tokenUuid;
      _this2.udpClient.send(ack);
    });
  },
  forkProcess: function forkProcess(tokenUuid, cwd, cmd, args) {
    if (this.forkedProcess.proc === null) {
      var proc = (0, _child_process.spawn)(cmd, args, { cwd: cwd });

      // remove end of line as console.log will add a new one
      proc.stdout.on('data', function (data) {
        return console.log(data.toString().trim());
      });
      proc.stderr.on('data', function (data) {
        return console.error(data.toString().trim());
      });
      proc.on('close', function (code) {
        return console.log('child process exited with code ' + code);
      });

      this.forkedProcess.uuid = tokenUuid;
      this.forkedProcess.proc = proc;

      var ack = 'FORK_ACK ' + tokenUuid;
      this.udpClient.send(ack);
    } else {
      console.error('cannot start process, a process is already running');
    }
  },
  killProcess: function killProcess(killTokenUuid) {
    var _this3 = this;

    var _forkedProcess = this.forkedProcess,
        proc = _forkedProcess.proc,
        uuid = _forkedProcess.uuid;


    if (proc !== null) {
      var forkTokenUuid = uuid;

      (0, _terminate2.default)(proc.pid, function (err) {
        if (err) console.error('...an error occured while killing the process', err);

        // if process has crashed and thus cannot be killed,
        // we still want to reset everything...
        _this3.forkedProcess.proc = null;
        _this3.forkedProcess.uuid = null;

        var ack = 'KILL_ACK ' + killTokenUuid + ' ' + forkTokenUuid;
        _this3.udpClient.send(ack);
      });
    } else {
      console.error('cannot kill inexisting process');
    }
  },
  quit: function quit() {
    this.udpClient.stop();
  }
};

exports.default = client;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsaWVudC5qcyJdLCJuYW1lcyI6WyJpbnRlcmNlcHQiLCJyZXF1aXJlIiwiY2FwdHVyZUNvbnNvbGUiLCJjbGllbnQiLCJpbml0aWFsaXplIiwiZGVidWciLCJkaXNwYXRjaCIsImJpbmQiLCIkSE9NRSIsImhvc3RuYW1lIiwib3MiLCJmb3JrZWRQcm9jZXNzIiwidXVpZCIsInByb2MiLCJob21lUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJlcnIiLCJzdGRvdXQiLCJzdGRlcnIiLCJjb25zb2xlIiwiZXJyb3IiLCJ0b1N0cmluZyIsInJlcGxhY2UiLCJkaXNjb3ZlcnlPcHRpb25zIiwidmVyYm9zZSIsInBvcnQiLCJjb25maWciLCJCUk9BRENBU1RfUE9SVCIsImRpc2NvdmVyeVByb21pc2UiLCJ0aGVuIiwicGFyc2VJbnQiLCJNYXRoIiwicmFuZG9tIiwiY2F0Y2giLCJzdGFjayIsImFsbCIsImhvbWVQYXRoIiwicGF5bG9hZCIsInVkcENsaWVudCIsIkRpc2NvdmVyeUNsaWVudCIsIm9uY2UiLCJzdGFydEludGVyY2VwdCIsInByb2Nlc3MiLCJzZW5kIiwibG9nIiwib24iLCJzdGFydCIsImJ1ZmZlciIsInJpbmZvIiwibXNnIiwic3BsaXQiLCJwcm90b2NvbCIsInNoaWZ0IiwidG9rZW5VdWlkIiwiY3dkIiwiY21kIiwiam9pbiIsImV4ZWN1dGVDbWQiLCJhcmdzIiwiZm9ya1Byb2Nlc3MiLCJraWxsUHJvY2VzcyIsImFjayIsImRhdGEiLCJ0cmltIiwiY29kZSIsImtpbGxUb2tlblV1aWQiLCJmb3JrVG9rZW5VdWlkIiwicGlkIiwicXVpdCIsInN0b3AiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOztBQUNBOzs7O0FBQ0E7Ozs7OztBQUNBO0FBQ0EsSUFBSUEsWUFBWUMsUUFBUSxrQkFBUixDQUFoQjtBQUNBLElBQUlDLGlCQUFpQkQsUUFBUSxpQkFBUixDQUFyQjs7QUFHQSxJQUFNRSxT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QUFDQSxXQUFLM0MsYUFBTCxDQUFtQkUsSUFBbkIsR0FBMEJBLElBQTFCOztBQUVBLFVBQU1pRCxvQkFBa0JSLFNBQXhCO0FBQ0EsV0FBS2YsU0FBTCxDQUFlSyxJQUFmLENBQW9Ca0IsR0FBcEI7QUFDRCxLQWJELE1BYU87QUFDTDFDLGNBQVFDLEtBQVIsQ0FBYyxvREFBZDtBQUNEO0FBQ0YsR0F2SVk7QUF5SWJ3QyxhQXpJYSx1QkF5SURLLGFBeklDLEVBeUljO0FBQUE7O0FBQUEseUJBQ0YsS0FBS3ZELGFBREg7QUFBQSxRQUNqQkUsSUFEaUIsa0JBQ2pCQSxJQURpQjtBQUFBLFFBQ1hELElBRFcsa0JBQ1hBLElBRFc7OztBQUd6QixRQUFJQyxTQUFTLElBQWIsRUFBbUI7QUFDakIsVUFBTXNELGdCQUFnQnZELElBQXRCOztBQUVBLCtCQUFVQyxLQUFLdUQsR0FBZixFQUFvQixlQUFPO0FBQ3pCLFlBQUluRCxHQUFKLEVBQ0VHLFFBQVFDLEtBQVIsQ0FBYywrQ0FBZCxFQUErREosR0FBL0Q7O0FBRUY7QUFDQTtBQUNBLGVBQUtOLGFBQUwsQ0FBbUJFLElBQW5CLEdBQTBCLElBQTFCO0FBQ0EsZUFBS0YsYUFBTCxDQUFtQkMsSUFBbkIsR0FBMEIsSUFBMUI7O0FBRUEsWUFBTWtELG9CQUFrQkksYUFBbEIsU0FBbUNDLGFBQXpDO0FBQ0EsZUFBSzVCLFNBQUwsQ0FBZUssSUFBZixDQUFvQmtCLEdBQXBCO0FBQ0QsT0FYRDtBQVlELEtBZkQsTUFlTztBQUNMMUMsY0FBUUMsS0FBUixDQUFjLGdDQUFkO0FBQ0Q7QUFDRixHQTlKWTtBQWdLYmdELE1BaEthLGtCQWdLTjtBQUNMLFNBQUs5QixTQUFMLENBQWUrQixJQUFmO0FBQ0Q7QUFsS1ksQ0FBZjs7a0JBcUtlbkUsTSIsImZpbGUiOiJjbGllbnQuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEaXNjb3ZlcnlDbGllbnQsIGNvbmZpZyB9IGZyb20gJ0BpcmNhbS9ub2RlLWRpc2NvdmVyeSc7XG5pbXBvcnQgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IGdldFBvcnQgZnJvbSAnZ2V0LXBvcnQnO1xuaW1wb3J0IHsgZXhlYywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCByZWFkbGluZSBmcm9tICdyZWFkbGluZSc7XG5pbXBvcnQgdGVybWluYXRlIGZyb20gJ3Rlcm1pbmF0ZSc7XG4vLyBpbXBvcnQgY2FwdHVyZUNvbnNvbGUgZnJvbSAnY2FwdHVyZS1jb25zb2xlJztcbnZhciBpbnRlcmNlcHQgPSByZXF1aXJlKFwiaW50ZXJjZXB0LXN0ZG91dFwiKTtcbnZhciBjYXB0dXJlQ29uc29sZSA9IHJlcXVpcmUoJ2NhcHR1cmUtY29uc29sZScpO1xuXG5cbmNvbnN0IGNsaWVudCA9IHtcbiAgaW5pdGlhbGl6ZSh7XG4gICAgZGVidWcgPSBmYWxzZSxcbiAgfSA9IHt9KSB7XG5cbiAgICB0aGlzLmRpc3BhdGNoID0gdGhpcy5kaXNwYXRjaC5iaW5kKHRoaXMpO1xuICAgIHRoaXMuJEhPTUUgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBvcy5ob3N0bmFtZSgpOyAvLyBtYXkgYmUgb3ZlcnJpZGVuIGlmIGBkZWJ1Zz10cnVlYFxuXG4gICAgdGhpcy5mb3JrZWRQcm9jZXNzID0ge1xuICAgICAgdXVpZDogbnVsbCxcbiAgICAgIHByb2M6IG51bGwsXG4gICAgfTtcblxuICAgIGNvbnN0IGhvbWVQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgZXhlYygnZWNobyAkSE9NRScsIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG4gICAgICAgIGlmIChlcnIpXG4gICAgICAgICAgcmV0dXJuIGNvbnNvbGUuZXJyb3IoZXJyKTtcbiAgICAgICAgLy8gcmVtb3ZlIHRyYWlsaW5nIG5ldyBsaW5lXG4gICAgICAgIHJlc29sdmUoc3Rkb3V0LnRvU3RyaW5nKCkucmVwbGFjZSgvXFxzJC9nLCAnJykpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBkaXNjb3ZlcnlPcHRpb25zID0ge1xuICAgICAgdmVyYm9zZTogZmFsc2UsXG4gICAgICBwb3J0OiBjb25maWcuQlJPQURDQVNUX1BPUlQsXG4gICAgfTtcblxuICAgIGxldCBkaXNjb3ZlcnlQcm9taXNlID0gbnVsbDtcblxuICAgIGlmIChkZWJ1ZyA9PT0gZmFsc2UpIHtcbiAgICAgIGRpc2NvdmVyeVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZGlzY292ZXJ5T3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpc2NvdmVyeVByb21pc2UgPSBnZXRQb3J0KClcbiAgICAgICAgLnRoZW4ocG9ydCA9PiB7XG4gICAgICAgICAgLy8gY3JlYXRlIGR1bW15IGhvc3RuYW1lIGluIGRlYnVnIG1vZGVcbiAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gYHdhdC1kZWJ1Zy0ke3BhcnNlSW50KE1hdGgucmFuZG9tKCkgKiAxMDApfWA7XG5cbiAgICAgICAgICBkaXNjb3ZlcnlPcHRpb25zLnZlcmJvc2UgPSB0cnVlO1xuICAgICAgICAgIGRpc2NvdmVyeU9wdGlvbnMucG9ydCA9IHBvcnQ7XG5cbiAgICAgICAgICByZXR1cm4gZGlzY292ZXJ5T3B0aW9ucztcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiBjb25zb2xlLmVycm9yKGVyci5zdGFjaykpO1xuICAgIH1cblxuICAgIHJldHVybiBQcm9taXNlLmFsbChbaG9tZVByb21pc2UsIGRpc2NvdmVyeVByb21pc2VdKVxuICAgICAgLnRoZW4oKFtob21lUGF0aCwgZGlzY292ZXJ5T3B0aW9uc10pID0+IHtcbiAgICAgICAgdGhpcy4kSE9NRSA9IGhvbWVQYXRoO1xuXG4gICAgICAgIGRpc2NvdmVyeU9wdGlvbnMucGF5bG9hZCA9IHsgaG9zdG5hbWU6IHRoaXMuaG9zdG5hbWUgfTtcblxuICAgICAgICB0aGlzLmRpc2NvdmVyeU9wdGlvbnMgPSBkaXNjb3ZlcnlPcHRpb25zO1xuICAgICAgICB0aGlzLnVkcENsaWVudCA9IG5ldyBEaXNjb3ZlcnlDbGllbnQoZGlzY292ZXJ5T3B0aW9ucyk7XG5cbiAgICAgICAgdGhpcy51ZHBDbGllbnQub25jZSgnY29ubmVjdGlvbicsICgpID0+IHtcblxuICAgICAgICAgIGNhcHR1cmVDb25zb2xlLnN0YXJ0SW50ZXJjZXB0KHByb2Nlc3Muc3Rkb3V0LCBzdGRvdXQgPT4ge1xuICAgICAgICAgICAgdGhpcy51ZHBDbGllbnQuc2VuZChgU1RET1VUICR7c3Rkb3V0LnRvU3RyaW5nKCl9YCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBjYXB0dXJlQ29uc29sZS5zdGFydEludGVyY2VwdChwcm9jZXNzLnN0ZGVyciwgc3RkZXJyID0+IHtcbiAgICAgICAgICAgIHRoaXMudWRwQ2xpZW50LnNlbmQoYFNUREVSUiAke3N0ZGVyci50b1N0cmluZygpfWApO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYCR7dGhpcy5ob3N0bmFtZX0gY29ubmVjdGVkYCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHJlY2VpdmUgb25seSBtZXNzYWdlIHRoYXQgZG8gbm90IG1hdGNoIHRoZSBkaXNjb3ZlcnkgcHJvdG9jb2xcbiAgICAgICAgdGhpcy51ZHBDbGllbnQub24oJ21lc3NhZ2UnLCB0aGlzLmRpc3BhdGNoKTtcbiAgICAgICAgdGhpcy51ZHBDbGllbnQuc3RhcnQoKTtcblxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gY29uc29sZS5lcnJvcihlcnIpKTtcbiAgfSxcblxuICBkaXNwYXRjaChidWZmZXIsIHJpbmZvKSB7XG4gICAgY29uc3QgbXNnID0gYnVmZmVyLnRvU3RyaW5nKCkucmVwbGFjZSgvXFxzXFxzKy9nLCAnICcpLnNwbGl0KCcgJyk7XG4gICAgY29uc3QgcHJvdG9jb2wgPSBtc2cuc2hpZnQoKTtcbiAgICBjb25zdCB0b2tlblV1aWQgPSBtc2cuc2hpZnQoKVxuXG4gICAgc3dpdGNoIChwcm90b2NvbCkge1xuICAgICAgY2FzZSAnRVhFQyc6IHtcbiAgICAgICAgY29uc3QgY3dkID0gbXNnLnNoaWZ0KCkucmVwbGFjZSgvXlxcfi8sIHRoaXMuJEhPTUUpO1xuICAgICAgICBjb25zdCBjbWQgPSBtc2cuam9pbignICcpO1xuXG4gICAgICAgIHRoaXMuZXhlY3V0ZUNtZCh0b2tlblV1aWQsIGN3ZCwgY21kKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdGT1JLJzoge1xuICAgICAgICBjb25zdCBjd2QgPSBtc2cuc2hpZnQoKS5yZXBsYWNlKC9eXFx+LywgdGhpcy4kSE9NRSk7XG4gICAgICAgIGNvbnN0IGNtZCA9IG1zZy5zaGlmdCgpO1xuICAgICAgICBjb25zdCBhcmdzID0gbXNnO1xuXG4gICAgICAgIHRoaXMuZm9ya1Byb2Nlc3ModG9rZW5VdWlkLCBjd2QsIGNtZCwgYXJncyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnS0lMTCc6IHtcbiAgICAgICAgdGhpcy5raWxsUHJvY2Vzcyh0b2tlblV1aWQpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH0sXG5cbiAgZXhlY3V0ZUNtZCh0b2tlblV1aWQsIGN3ZCwgY21kKSB7XG4gICAgZXhlYyhjbWQsIHsgY3dkOiBjd2QsIH0sIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG4gICAgICBpZiAoZXJyKVxuICAgICAgICByZXR1cm4gY29uc29sZS5lcnJvcihlcnIpO1xuXG4gICAgICBjb25zb2xlLmxvZyhzdGRvdXQudG9TdHJpbmcoKSk7XG4gICAgICBjb25zb2xlLmxvZyhzdGRlcnIudG9TdHJpbmcoKSk7XG5cbiAgICAgIGNvbnN0IGFjayA9IGBFWEVDX0FDSyAke3Rva2VuVXVpZH1gO1xuICAgICAgdGhpcy51ZHBDbGllbnQuc2VuZChhY2spO1xuICAgIH0pO1xuICB9LFxuXG4gIGZvcmtQcm9jZXNzKHRva2VuVXVpZCwgY3dkLCBjbWQsIGFyZ3MpIHtcbiAgICBpZiAodGhpcy5mb3JrZWRQcm9jZXNzLnByb2MgPT09IG51bGwpIHtcbiAgICAgIGNvbnN0IHByb2MgPSBzcGF3bihjbWQsIGFyZ3MsIHsgY3dkIH0pO1xuXG4gICAgICAvLyByZW1vdmUgZW5kIG9mIGxpbmUgYXMgY29uc29sZS5sb2cgd2lsbCBhZGQgYSBuZXcgb25lXG4gICAgICBwcm9jLnN0ZG91dC5vbignZGF0YScsIGRhdGEgPT4gY29uc29sZS5sb2coZGF0YS50b1N0cmluZygpLnRyaW0oKSkpO1xuICAgICAgcHJvYy5zdGRlcnIub24oJ2RhdGEnLCBkYXRhID0+IGNvbnNvbGUuZXJyb3IoZGF0YS50b1N0cmluZygpLnRyaW0oKSkpO1xuICAgICAgcHJvYy5vbignY2xvc2UnLCBjb2RlID0+IGNvbnNvbGUubG9nKGBjaGlsZCBwcm9jZXNzIGV4aXRlZCB3aXRoIGNvZGUgJHtjb2RlfWApKTtcblxuICAgICAgdGhpcy5mb3JrZWRQcm9jZXNzLnV1aWQgPSB0b2tlblV1aWQ7XG4gICAgICB0aGlzLmZvcmtlZFByb2Nlc3MucHJvYyA9IHByb2M7XG5cbiAgICAgIGNvbnN0IGFjayA9IGBGT1JLX0FDSyAke3Rva2VuVXVpZH1gO1xuICAgICAgdGhpcy51ZHBDbGllbnQuc2VuZChhY2spO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdjYW5ub3Qgc3RhcnQgcHJvY2VzcywgYSBwcm9jZXNzIGlzIGFscmVhZHkgcnVubmluZycpO1xuICAgIH1cbiAgfSxcblxuICBraWxsUHJvY2VzcyhraWxsVG9rZW5VdWlkKSB7XG4gICAgY29uc3QgeyBwcm9jLCB1dWlkIH0gPSB0aGlzLmZvcmtlZFByb2Nlc3M7XG5cbiAgICBpZiAocHJvYyAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgZm9ya1Rva2VuVXVpZCA9IHV1aWQ7XG5cbiAgICAgIHRlcm1pbmF0ZShwcm9jLnBpZCwgZXJyID0+IHtcbiAgICAgICAgaWYgKGVycilcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCcuLi5hbiBlcnJvciBvY2N1cmVkIHdoaWxlIGtpbGxpbmcgdGhlIHByb2Nlc3MnLCBlcnIpO1xuXG4gICAgICAgIC8vIGlmIHByb2Nlc3MgaGFzIGNyYXNoZWQgYW5kIHRodXMgY2Fubm90IGJlIGtpbGxlZCxcbiAgICAgICAgLy8gd2Ugc3RpbGwgd2FudCB0byByZXNldCBldmVyeXRoaW5nLi4uXG4gICAgICAgIHRoaXMuZm9ya2VkUHJvY2Vzcy5wcm9jID0gbnVsbDtcbiAgICAgICAgdGhpcy5mb3JrZWRQcm9jZXNzLnV1aWQgPSBudWxsO1xuXG4gICAgICAgIGNvbnN0IGFjayA9IGBLSUxMX0FDSyAke2tpbGxUb2tlblV1aWR9ICR7Zm9ya1Rva2VuVXVpZH1gO1xuICAgICAgICB0aGlzLnVkcENsaWVudC5zZW5kKGFjayk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5lcnJvcignY2Fubm90IGtpbGwgaW5leGlzdGluZyBwcm9jZXNzJyk7XG4gICAgfVxuICB9LFxuXG4gIHF1aXQoKSB7XG4gICAgdGhpcy51ZHBDbGllbnQuc3RvcCgpO1xuICB9LFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGllbnQ7XG4iXX0=