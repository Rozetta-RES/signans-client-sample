'use strict';

const fetch = require('node-fetch');
const { BASE_URL } = require('./common');

const tokenPath = '/token';
const url = `${BASE_URL}${tokenPath}`

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
