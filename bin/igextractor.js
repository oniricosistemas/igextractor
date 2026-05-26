#!/usr/bin/env node
'use strict';

const { run } = require('../src/index');

run().catch(err => {
  const chalk = require('chalk');
  console.error('\n  ' + chalk.red('✗ Fatal error: ') + err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
