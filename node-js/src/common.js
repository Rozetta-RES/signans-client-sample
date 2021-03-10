'use strict';

const config = require('./config');

const BASE_URL = `https://${config.signans.host}/api/v1`;

module.exports = {
  BASE_URL,
};
