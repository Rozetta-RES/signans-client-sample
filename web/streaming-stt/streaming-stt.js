'use strict';

(() => {
  const accessKeyInput = document.getElementById('access-key');
  const secretKeyInput = document.getElementById('secret-key');
  const contractIdInput = document.getElementById('contract-id');
  const speechLanguageInput = document.getElementById('speech-language');
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const output = document.getElementById('output');

  const JWT_API_PATH = '/api/v1/token';
  const STREAMING_STT_API_PATH = '/api/v1/translate/stt-streaming';

  const WEBSOCKET_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };
  const WEBSOCKET_CLOSE_EVENT = {
    NORMAL_CLOSURE: 1000,
  };

  const COMMAND_TYPE = {
    SET_LANGUAGE: 'SET_LANGUAGE',
    SET_SAMPLING_RATE: 'SET_SAMPLING_RATE',
    END_STREAM: 'END_STREAM',
    END_SESSION: 'END_SESSION',
  };
  const RESPONSE_TYPE = {
    LANGUAGE_READY: 'LANGUAGE_READY',
    SAMPLING_RATE_READY: 'SAMPLING_RATE_READY',
    RECOGNITION_RESULT: 'RECOGNITION_RESULT',
    RECOGNITION_ERROR: 'RECOGNITION_ERROR',
  };

  const RECORDER_STATE = {
    INACTIVE: 'inactive',
    RECORDING: 'recording',
    PAUSED: 'paused',
  };
  const AUDIO_SLICE_INTERVAL = 1000;
  const AUDIO_SAMPLE_RATE = 16000;

  const audioContext = new window.AudioContext();

  let accessKey = null;
  let secretKey = null;
  let contractId = null;
  let speechLanguage = null;

  let client = null;

  let audioStream = null;
  let audioRecorder = null;
  let audioChunks = [];
  let recordLoopTimer = null;

  const prependOutput = (message) => {
    const line = `${(new Date()).toISOString()}: ${message}`;
    const paragraph = document.createElement('p');
    paragraph.appendChild(document.createTextNode(line));
    output.prepend(paragraph);
  };

  const isLocalConnection = () => {
    const { hostname } = window.location;
    return ((hostname === '127.0.0.1') || (hostname === 'localhost'));
  };

  const isConnectionOpen = () => {
    if (client === null) {
      return false;
    }
    return (client.readyState === WEBSOCKET_READY_STATE.OPEN);
  };

  const getJWT = async () => {
    const { host } = window.location;
    let protocol = null;
    if (window.isSecureContext && !isLocalConnection()) {
      protocol = 'https:';
    } else {
      protocol = 'http:';
    }
    const url = `${protocol}//${host}${JWT_API_PATH}`;
    const response = await window.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessKey,
        secretKey,
      }),
    });
    if (!response.ok) {
      prependOutput('Unable to obtain JWT for authentication.');
      return null;
    }
    const responseJSON = await response.json();
    return responseJSON.data.encodedJWT;
  };

  const setLangauge = (language) => {
    if (!isConnectionOpen()) {
      prependOutput('Connection is not open, unable to set speech language.');
      return;
    }
    client.send(JSON.stringify({
      command: COMMAND_TYPE.SET_LANGUAGE,
      value: language,
    }));
  };

  const setSamplingRate = (samplingRate) => {
    if (!isConnectionOpen()) {
      prependOutput('Connection is not open, unable to set sampling rate.');
      return;
    }
    client.send(JSON.stringify({
      command: COMMAND_TYPE.SET_SAMPLING_RATE,
      value: samplingRate,
    }));
  };

  const sendAudio = (blob) => {
    if (!isConnectionOpen()) {
      prependOutput('Connection is not open, unable to send audio.');
      return;
    }
    client.send(blob);
  };

  const endSession = () => {
    if (!isConnectionOpen()) {
      prependOutput('Connection is not open, unable end session.');
      return;
    }
    client.send(JSON.stringify({
      command: COMMAND_TYPE.END_SESSION,
    }));
  };

  const downSampling = (channelData, originalSampleRate, exportSampleRate) => {
    const sampleRateRatio = originalSampleRate / exportSampleRate;
    const newDataLength = Math.round(channelData.length / sampleRateRatio);
    const result = new Float32Array(newDataLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; (i < nextOffsetBuffer && i < channelData.length); i += 1) {
        accum += channelData[i];
        count += 1;
      }
      result[offsetResult] = accum / count;
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  };

  const processAudioSliceBlob = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const originalSampleRate = audioBuffer.sampleRate;
      const fistChannelIndex = 0;
      const f32Array = audioBuffer.getChannelData(fistChannelIndex);
      const modF32Array = downSampling(
        f32Array,
        originalSampleRate,
        AUDIO_SAMPLE_RATE,
      );
      const monoChannelCount = 1;
      const wavEncoder = new window.WavAudioEncoder(
        AUDIO_SAMPLE_RATE,
        monoChannelCount,
      );
      wavEncoder.encode([modF32Array]);
      const wavBlob = wavEncoder.finish();
      sendAudio(wavBlob);
    } catch (error) {
      console.error('Unable to decode arraybuffer to audiobuffer.');
      console.error(error);
    }
  };

  const initRecordLoop = () => {
    audioChunks = [];
    recordLoopTimer = setInterval(() => {
      audioRecorder.stop();
      let blob = null;
      if (audioChunks.length > 0) {
        blob = new Blob(audioChunks);
        audioChunks = [];
      }
      audioRecorder.start(AUDIO_SLICE_INTERVAL);
      if (blob !== null) {
        processAudioSliceBlob(blob);
      }
    }, AUDIO_SLICE_INTERVAL);
  };

  const processRecorderError = (event) => {
    const { error } = event;
    console.error(`Record error: ${error.name}.`);
    console.error(error);
    prependOutput('Error occurred during recording.');
  };

  const initRecorder = async () => {
    audioRecorder = new window.MediaRecorder(audioStream);
    const { audioBitsPerSecond } = audioRecorder;
    prependOutput(`Recorder encodes at ${audioBitsPerSecond} bits/s.`);
    audioRecorder.ondataavailable = (event) => audioChunks.push(event.data);
    audioRecorder.onerror = (event) => processRecorderError(event);
    audioRecorder.start(AUDIO_SLICE_INTERVAL);
    prependOutput('Please speak.');
    initRecordLoop();
  };

  const stopRecorder = () => {
    if (audioRecorder === null) {
      return;
    }
    if (audioRecorder.state !== RECORDER_STATE.RECORDING) {
      return;
    }
    clearInterval(recordLoopTimer);
    audioRecorder.stop();
  };

  const processMessage = (message) => {
    let parsedMessage = null;
    try {
      parsedMessage = JSON.parse(message);
    } catch (error) {
      console.error(`Unable to parse the raw message: ${message}`);
      prependOutput('Ignored a message, which cannot be parsed, from server.');
      return;
    }
    switch (parsedMessage.type) {
      case RESPONSE_TYPE.LANGUAGE_READY:
        prependOutput('Speech language has been set.');
        setSamplingRate(AUDIO_SAMPLE_RATE);
        break;
      case RESPONSE_TYPE.SAMPLING_RATE_READY:
        prependOutput('Sampling rate has been set.');
        prependOutput('Initializing recorder.');
        initRecorder();
        break;
      case RESPONSE_TYPE.RECOGNITION_RESULT:
        prependOutput(`Detected transcript: ${parsedMessage.value}`);
        break;
      case RESPONSE_TYPE.RECOGNITION_ERROR:
        prependOutput('Recognition error detected.');
        prependOutput(parsedMessage.value);
        prependOutput('Stopping recorder.');
        stopRecorder();
        prependOutput('Ending session.');
        endSession();
        break;
      default:
        prependOutput(`Unexpected message type ${parsedMessage.type}.`);
    }
  };

  const connect = async () => {
    const token = await getJWT();
    prependOutput(`Token: ${token}`);
    const { host } = window.location;
    let protocol = null;
    if (window.isSecureContext && !isLocalConnection()) {
      protocol = 'wss:';
    } else {
      protocol = 'ws:';
    }
    const params = new URLSearchParams();
    params.set('token', `Bearer ${token}`);
    const url = `${protocol}//${host}${STREAMING_STT_API_PATH}?${params.toString()}`;
    prependOutput(`Connecting to ${url}.`);
    client = new window.WebSocket(url);
    client.onopen = () => {
      prependOutput('Connection is opened.');
      setLangauge(speechLanguage);
    };
    client.onmessage = (message) => processMessage(message.data);
    client.onerror = (event) => {
      console.error('Client detected an error.');
      console.error(event);
      prependOutput('Connection has an error. See log for details.');
    };
    client.onclose = () => {
      prependOutput('Connection is closed.');
      audioRecorder = null;
      client = null;
    };
  };

  const disconnect = () => {
    if (!isConnectionOpen()) {
      return;
    }
    client.close(WEBSOCKET_CLOSE_EVENT.NORMAL_CLOSURE);
  };

  const initAudioStream = async () => {
    if (!navigator.mediaDevices) {
      prependOutput('MediaDevices not supported, no speech can be recorded.')
      return;
    }
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch (error) {
      console.error('Unable to get media input (audio).');
      console.error(error);
      prependOutput('Unable to get audio stream, no speech can be recorded.');
    }
  };

  startButton.onclick = () => {
    accessKey = accessKeyInput.value;
    secretKey = secretKeyInput.value;
    contractId = contractIdInput.value;
    speechLanguage = speechLanguageInput.options[speechLanguageInput.selectedIndex].value;
    prependOutput(`Access key: ${accessKey}`);
    prependOutput(`Secret key: ${secretKey}`);
    prependOutput(`Contract ID: ${contractId}`);
    prependOutput(`Language: ${speechLanguage}`);
    connect();
  };

  stopButton.onclick = () => {
    stopRecorder();
    disconnect();
  };

  initAudioStream();
})();
