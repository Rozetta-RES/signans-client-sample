'use strict';

const fetch = require('node-fetch');

const config = require('../config');
const { getJwt } = require('../auth');
const { BASE_URL } = require('../common');

const payload = {
  'fromLang': 'ja',
  'fromText': '土曜日',
  'toLang': 'en',
  'toText': 'Sat'
}

const updateUserDictionary = async (entryId, payload) => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const token = await getJwt(accessKey, secretKey);
  const url = `${BASE_URL}/dictionary/${entryId}`;
  const response = await fetch(
    url,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    const message = await response.text();
    console.error(`Failed to update the dictionary: ${message}`);
    throw new Error('Failed to update the dictionary.');
  }
  console.log(await response.json());
};

const main = async () => {
  const entryId = process.argv[2];
  if (!entryId) {
    console.error('Please input dictionary entry id.');
    return;
  }
  try {
    await updateUserDictionary(entryId, payload);
    console.log('Success');
  } catch (error) {
    console.error(error);
  }
};

main();
