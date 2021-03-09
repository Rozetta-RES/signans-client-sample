'use strict';

const fs = require('fs');
const WebSocket = require('ws');

const config = require('./config');
const { getJwt } = require('./auth');

const fsPromise = fs.promises;

const apiPath = '/api/v1/translate/stt-streaming';
const start = Date.now();

/**
* Command type sent from the client.
*/
const commandType = {
  setLanguage: 'SET_LANGUAGE',
  setSamplingRate: 'SET_SAMPLING_RATE',
  endStream: 'END_STREAM',
  endSession: 'END_SESSION',
};

/**
* Response types received from API endpoint.
*/
const responseType = {
  languageReady: 'LANGUAGE_READY',
  samplingRateReady: 'SAMPLING_RATE_READY',
  recognitionResult: 'RECOGNITION_RESULT',
  recognitionError: 'RECOGNITION_ERROR',
};

const speechData = {
  language: 'ja',
  samplingRate: 16000,
  audioFile: './audio/ja.wav',
};

const handleSessionMessage = (connection, message) => {
  const messageJSON = JSON.parse(message);
  switch (messageJSON.type) {
    case responseType.languageReady:
      // The language is set. Set the sampling rate.
      console.log('Language is set. Set sampling rate.');
      connection.send(JSON.stringify({
        command: commandType.setSamplingRate,
        value: speechData.samplingRate,
      }));
      break;
    case responseType.samplingRateReady:
      // The language is set. Send the audio data stream.
      console.log('Sampling rate is set. Send audio data stream.');
      connection.send(speechData.audioBuffer, (error) => {
        if (error) {
          console.error(error.message);
        }
        connection.send(JSON.stringify({
          command: commandType.endStream,
          }));
      });
      break;
    case responseType.recognitionResult:
      console.log(`Recognized transcript:${Date.now() - start} milliseconds`);
      console.log(messageJSON);
      break;
    case responseType.recognitionError:
      console.error('Recognition error:');
      console.error(messageJSON.value);
      // In case of error, we close the connection immediately.
      connection.send(JSON.stringify({
        command: commandType.endSession,
      }));
    break;
    default:
      console.log('Unexpected response type:');
      console.log(messageJSON.type);
  }
};

const main = async () => {
  const env = config.signans;
  const { accessKey, secretKey } = env.authConfig;
  const token = await getJwt(accessKey, secretKey);
  if (token) {
    const url = `wss://${env.host}${apiPath}?token=Bearer ${token}`;
    console.log(url);
    speechData.audioBuffer = await fsPromise.readFile(speechData.audioFile);
    const connection = new WebSocket(url);
    connection.on('open', () => {
      console.log('Connected to streaming STT API.');
      // Once connected, set the speech language.
      if (speechData.language) {
        connection.send(JSON.stringify({
          command: commandType.setLanguage,
          value: speechData.language,
        }));
      } else {
        connection.send(JSON.stringify({
          command: commandType.setSamplingRate,
          value: speechData.samplingRate,
        }));
      }
    });
    connection.on('message', (message) => {
      handleSessionMessage(connection, message);
    });
    connection.on('error', (error) => {
      console.error(error.message);
      connection.close();
    });
    connection.on('close', (code, message) => {
      console.log(`${code}: ${message}`);
      console.log('Connection closed.');
    });
  } else {
    console.error('JwtToken error');
  }
};

main();
