'use strict';

const fetch = require('node-fetch');

const config = require('../config');
const { getJwt } = require('../auth');
const { BASE_URL } = require('../common');

const deleteUserDictionary = async (entryId) => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const token = await getJwt(accessKey, secretKey);
  const url = `${BASE_URL}/dictionary/${entryId}`;
  const response = await fetch(
    url,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    const message = await response.text();
    console.error(`Failed to delete the dictionary: ${message}`);
    throw new Error('Failed to delete the dictionary.');
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
    await deleteUserDictionary(entryId);
    console.log('Success');
  } catch (error) {
    console.error(error);
  }
};

main();
