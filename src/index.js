#!/usr/bin/env node
import yargs from 'yargs';
import client from './client';

yargs
  .usage('$0 <cmd> [args]')
  .command('start [debug=false]', 'starts an ameiz[ing] client', yargs => {
    yargs.positional('debug', {
      type: 'boolean',
      default: false,
      describe: 'define if should run in debug mode'
    })
  }, argv => {
    client
      .initialize({ debug: argv.debug })
      .catch(err => console.error(err.stack));
  })
  .help()
  .argv
