#!/usr/bin/env node
'use strict';

var _yargs = require('yargs');

var _yargs2 = _interopRequireDefault(_yargs);

var _client = require('./client');

var _client2 = _interopRequireDefault(_client);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_yargs2.default.usage('$0 <cmd> [args]').command('start [debug=false]', 'starts an ameiz[ing] client', function (yargs) {
  yargs.positional('debug', {
    type: 'boolean',
    default: false,
    describe: 'define if should run in debug mode'
  });
}, function (argv) {
  _client2.default.initialize({ debug: argv.debug }).catch(function (err) {
    return console.error(err.stack);
  });
}).help().argv;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIl0sIm5hbWVzIjpbInlhcmdzIiwidXNhZ2UiLCJjb21tYW5kIiwicG9zaXRpb25hbCIsInR5cGUiLCJkZWZhdWx0IiwiZGVzY3JpYmUiLCJjbGllbnQiLCJpbml0aWFsaXplIiwiZGVidWciLCJhcmd2IiwiY2F0Y2giLCJjb25zb2xlIiwiZXJyb3IiLCJlcnIiLCJzdGFjayIsImhlbHAiXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7QUFDQTs7Ozs7O0FBRUFBLGdCQUNHQyxLQURILENBQ1MsaUJBRFQsRUFFR0MsT0FGSCxDQUVXLHFCQUZYLEVBRWtDLDZCQUZsQyxFQUVpRSxpQkFBUztBQUN0RUYsUUFBTUcsVUFBTixDQUFpQixPQUFqQixFQUEwQjtBQUN4QkMsVUFBTSxTQURrQjtBQUV4QkMsYUFBUyxLQUZlO0FBR3hCQyxjQUFVO0FBSGMsR0FBMUI7QUFLRCxDQVJILEVBUUssZ0JBQVE7QUFDVEMsbUJBQ0dDLFVBREgsQ0FDYyxFQUFFQyxPQUFPQyxLQUFLRCxLQUFkLEVBRGQsRUFFR0UsS0FGSCxDQUVTO0FBQUEsV0FBT0MsUUFBUUMsS0FBUixDQUFjQyxJQUFJQyxLQUFsQixDQUFQO0FBQUEsR0FGVDtBQUdELENBWkgsRUFhR0MsSUFiSCxHQWNHTixJQWRIIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiXG5pbXBvcnQgeWFyZ3MgZnJvbSAneWFyZ3MnO1xuaW1wb3J0IGNsaWVudCBmcm9tICcuL2NsaWVudCc7XG5cbnlhcmdzXG4gIC51c2FnZSgnJDAgPGNtZD4gW2FyZ3NdJylcbiAgLmNvbW1hbmQoJ3N0YXJ0IFtkZWJ1Zz1mYWxzZV0nLCAnc3RhcnRzIGFuIGFtZWl6W2luZ10gY2xpZW50JywgeWFyZ3MgPT4ge1xuICAgIHlhcmdzLnBvc2l0aW9uYWwoJ2RlYnVnJywge1xuICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgZGVmYXVsdDogZmFsc2UsXG4gICAgICBkZXNjcmliZTogJ2RlZmluZSBpZiBzaG91bGQgcnVuIGluIGRlYnVnIG1vZGUnXG4gICAgfSlcbiAgfSwgYXJndiA9PiB7XG4gICAgY2xpZW50XG4gICAgICAuaW5pdGlhbGl6ZSh7IGRlYnVnOiBhcmd2LmRlYnVnIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IGNvbnNvbGUuZXJyb3IoZXJyLnN0YWNrKSk7XG4gIH0pXG4gIC5oZWxwKClcbiAgLmFyZ3ZcbiJdfQ==