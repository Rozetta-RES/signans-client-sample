'use strict';

const fetch = require('node-fetch');
const config = require('./config');

const tokenPath = '/api/v1/token';
const url = `https://${config.signans.host}${tokenPath}`

const getJwt = async (accessKey, secretKey) => {
  const data = {
    accessKey,
    secretKey,
    duration: 300
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const responseJSON = await response.json();
  return responseJSON.data.encodedJWT;
}

module.exports = {
  getJwt,
};
