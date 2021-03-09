'use strict';

const fetch = require('node-fetch');

const config = require('./config');
const { getJwt } = require('./auth');

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
  const token = await getJwt(accessKey, secretKey);
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
    console.error('JWT error');
  }
};

main();
