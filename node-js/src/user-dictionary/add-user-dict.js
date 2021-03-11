'use strict';

const fetch = require('node-fetch');

const config = require('../config');
const { getJwt } = require('../auth');
const { BASE_URL } = require('../common');

const dictionary = {
  'fromLang': 'en',
  'fromText': 'FRI',
  'toLang': 'ja',
  'toText': '金曜日'
}

const addUserDictionary = async (dictionary) => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const token = await getJwt(accessKey, secretKey);
  const url = `${BASE_URL}/dictionary`;
  const response = await fetch(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dictionary),
    },
  );
  if (!response.ok) {
    const message = await response.text();
    console.error(`Failed to translate the text: ${message}`);
    throw new Error('Failed to translate the text.');
  }
  console.log(await response.json());
};

const main = async () => {
  try {
    await addUserDictionary(dictionary);
    console.log('Success');
  } catch (error) {
    console.error(error);
  }
};

main();
