const client = require('../dist/client').default;

client
  .initialize({ debug: true })
  .catch(err => console.error(err.stack));
