'use strict';

const fetch = require('node-fetch');

const config = require('../config');
const { getJwt } = require('../auth');
const { BASE_URL } = require('../common');

const getUserDictionary = async () => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const token = await getJwt(accessKey, secretKey);
  const url = `${BASE_URL}/dictionary`;
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
    console.error(`Failed to get the dictionaries: ${message}`);
    throw new Error('Failed to get the dictionaries.');
  }
  const responseJSON = await response.json();
  return responseJSON.data;
};

const main = async () => {
  try {
    const response = await getUserDictionary();
    console.log('Server response:');
    console.log(response);
  } catch (error) {
    console.error(error);
  }
};

main();
