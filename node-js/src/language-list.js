'use strict';

const fetch = require('node-fetch');

const config = require('./config');
const { getJwt } = require('./auth');
const { BASE_URL } = require('./common');

const apiPaths = {
  text: '/languages/engine/insource-fast',
  streaming: '/stt-streaming-languages',
};

const getLanguageList = async (token) => {
  const url = `${BASE_URL}${apiPaths.text}`;
  // You can also get a list of streaming languages as follows:
  // const url = `${BASE_URL}${apiPaths.streaming}`;
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
      const response = await getLanguageList(token);
      console.log('Server response:');
      console.log(response);
    } catch (error) {
      console.error(error);
    }
  } else {
    console.error('Unable to get JWT.');
  }
};

main();
