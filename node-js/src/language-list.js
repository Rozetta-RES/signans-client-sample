'use strict';

const fetch = require('node-fetch');

const config = require('./config');
const { getJwtToken } = require('./auth');

const tokenPath = '/api/v1/token';
const basePath = '/api/v1';

const apiPaths = {
  text: '/languages/engine/insource-fast',
  streaming: '/stt-streaming-languages',
};

const getLanguageList = async (host, token) => {
  const url = `https://${host}${basePath}${apiPaths.text}`;
  // You can also get a list of streaming languages as follows:
  // const url = `https://${host}${basePath}${apiPaths.streaming}`;
  console.log(`Request URL: ${url}`);
  console.log(`Token: ${token}`);
  const response = await fetch(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
      const response = await getLanguageList(
        env.host,
        token,
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
