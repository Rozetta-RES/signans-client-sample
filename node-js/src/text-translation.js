'use strict';

const fetch = require('node-fetch');

const config = require('./config');
const { getJwtToken } = require('./auth');

const tokenPath = '/api/v1/token';
const apiPath = '/api/v1/translate';

const translationData = {
  text: [
    'Hello'
  ],
  sourceLang: 'en',
  targetLang: 'ja',
};

const getTextResult = async (host, token, translationData) => {
  const url = `https://${host}${apiPath}`;
  console.log(`Request URL: ${url}`);
  console.log(`Token: ${token}`);
  const response = await fetch(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(translationData),
    },
  );
  if (!response.ok) {
    const message = await response.text();
    console.error(`Failed to translate the text: ${message}`);
    throw new Error('Failed to translate the text.');
  }
  const responseJSON = await response.json();
  return responseJSON.data;
};

const main = async () => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const tokenUrl = `https://${env.host}${tokenPath}`;
  const token = await getJwtToken(tokenUrl, accessKey, secretKey);
  if (token) {
    try {
      const response = await getTextResult(
        env.host,
        token,
        translationData
      );
      console.log('Server response:');
      console.log(response);
    } catch (error) {
      console.error(error);
    }
  } else {
    console.error('JwtToken error');
  }
};

main();
