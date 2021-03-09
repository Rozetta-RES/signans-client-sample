'use strict';

const fetch = require('node-fetch');

const getJwtToken = async (url, accessKey, secretKey) => {
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
  getJwtToken,
};
