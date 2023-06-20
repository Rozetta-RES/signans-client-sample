'use strict';

(() => {
  const accessKeyInput = document.getElementById('access-key');
  const secretKeyInput = document.getElementById('secret-key');
  const speechLanguageInput = document.getElementById('speech-language');
  const startButton = document.getElementById('start-button');
  const stopButton = document.getElementById('stop-button');
  const showSystemLogInput = document.getElementById('show-system-log');
  const showRecognizingInput = document.getElementById('show-recognizing');
  const output = document.getElementById('output');

  const SIGNANS_TRANSLATE_DOMAIN = 'translate.signans.io';
  const JWT_API_PATH = '/api/v1/token';
  const STREAMING_STT_API_PATH = '/api/v1/translate/stt-streaming';
  const AUDIO_SLICE_INTERVAL = 1000;
  const AUDIO_SAMPLE_RATE = 16000;

  // ユーザー認証キーをあらかじめセットできます
  // アクセスキー
  const ACCESS_KEY_DEFAULT = 'c80a380d0e464cc995823c33d992ece6823da5124c6e5b1386bb913a8b28fb95';
  // シークレットキー
  const SECRET_KEY_DEFAULT = '72d2a50017a9e0700374ccc52cae5a0510be118abac96245ea1ee233ed0eec3d0672c6262d1a00dfc788880b0d94d12d';

  if (ACCESS_KEY_DEFAULT) {
    accessKeyInput.value = ACCESS_KEY_DEFAULT;
  }

  if (SECRET_KEY_DEFAULT) {
    secretKeyInput.value = SECRET_KEY_DEFAULT;
  }

  const SIGNANS_CONNECTION_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };

  // Signans 接続切断時に送信するイベントコード
  const SIGNANS_CONNECTION_CLOSE_EVENT = {
    NORMAL_CLOSURE: 1000,
  };

  // Signans に送信するコマンド種類
  const COMMAND_TYPE = {
    SET_LANGUAGE: 'SET_LANGUAGE',
    SET_SAMPLING_RATE: 'SET_SAMPLING_RATE',
    END_STREAM: 'END_STREAM',
    END_SESSION: 'END_SESSION',
  };

  // Signans から受信するメッセージ種類
  const RESPONSE_TYPE = {
    LANGUAGE_READY: 'LANGUAGE_READY',
    SAMPLING_RATE_READY: 'SAMPLING_RATE_READY',
    RECOGNITION_RESULT: 'RECOGNITION_RESULT',
    RECOGNITION_ERROR: 'RECOGNITION_ERROR',
  };

  // レコーダーの状態
  const RECORDER_STATE = {
    INACTIVE: 'inactive',
    RECORDING: 'recording',
    PAUSED: 'paused',
  };

  const HTML_CLASSES = {
    SYSTEM_LOG: 'system-log',
    RECOGNIZING: 'recognizing',
    RECOGNIZED: 'recognized',
  };

  const audioContext = new window.AudioContext();

  class SignansClient {

  }

  let accessKey = null;
  let secretKey = null;
  let speechLanguage = null;

  let client = null;

  let audioStream = null;
  let audioRecorder = null;
  let audioChunks = [];
  let recordLoopTimer = null;

  const isLocal = () => {
    const { hostname } = window.location;
    return (!hostname || (hostname === '127.0.0.1') || (hostname === 'localhost'));
  };

  const isConnectionOpen = () => {
    if (client === null) {
      return false;
    }
    return (client.readyState === SIGNANS_CONNECTION_READY_STATE.OPEN);
  };

  const getSignansToken = async () => {
    let protocol = null;
    if (isLocal()) {
      protocol = 'http:';
    } else {
      protocol = 'https:';
    }
    const url = `${protocol}//${SIGNANS_TRANSLATE_DOMAIN}${JWT_API_PATH}`;
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
      outputLog('Unable to obtain JWT for authentication.', HTML_CLASSES.SYSTEM_LOG);
      return null;
    }
    const responseJSON = await response.json();
    return responseJSON.data.encodedJWT;
  };

  const setLangauge = (language) => {
    if (!isConnectionOpen()) {
      outputLog('Connection is not open, unable to set speech language.', HTML_CLASSES.SYSTEM_LOG);
      return;
    }
    client.send(JSON.stringify({
      command: COMMAND_TYPE.SET_LANGUAGE,
      value: language,
    }));
  };

  const setSamplingRate = (samplingRate) => {
    if (!isConnectionOpen()) {
      outputLog('Connection is not open, unable to set sampling rate.', HTML_CLASSES.SYSTEM_LOG);
      return;
    }
    client.send(JSON.stringify({
      command: COMMAND_TYPE.SET_SAMPLING_RATE,
      value: samplingRate,
    }));
  };

  const sendAudio = (blob) => {
    if (!isConnectionOpen()) {
      outputLog('Connection is not open, unable to send audio.', HTML_CLASSES.SYSTEM_LOG);
      return;
    }
    client.send(blob);
  };

  const endSession = () => {
    if (!isConnectionOpen()) {
      outputLog('Connection is not open, unable end session.', HTML_CLASSES.SYSTEM_LOG);
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
    outputLog('Error occurred during recording.', HTML_CLASSES.SYSTEM_LOG);
  };

  const initRecorder = async () => {
    audioRecorder = new window.MediaRecorder(audioStream);
    const { audioBitsPerSecond } = audioRecorder;
    outputLog(`Recorder encodes at ${audioBitsPerSecond} bits/s.`, HTML_CLASSES.SYSTEM_LOG);
    audioRecorder.ondataavailable = (event) => audioChunks.push(event.data);
    audioRecorder.onerror = (event) => processRecorderError(event);
    audioRecorder.start(AUDIO_SLICE_INTERVAL);
    outputLog('Please speak.', HTML_CLASSES.SYSTEM_LOG);
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
      outputLog('Ignored a message, which cannot be parsed, from server.', HTML_CLASSES.SYSTEM_LOG);
      return;
    }
    switch (parsedMessage.type) {
      case RESPONSE_TYPE.LANGUAGE_READY:
        outputLog('Speech language has been set.', HTML_CLASSES.SYSTEM_LOG);
        setSamplingRate(AUDIO_SAMPLE_RATE);
        break;
      case RESPONSE_TYPE.SAMPLING_RATE_READY:
        outputLog('Sampling rate has been set.', HTML_CLASSES.SYSTEM_LOG);
        outputLog('Initializing recorder.', HTML_CLASSES.SYSTEM_LOG);
        initRecorder();
        break;
      case RESPONSE_TYPE.RECOGNITION_RESULT:
        if (parsedMessage.status === 'recognizing') {
          outputLog(`${parsedMessage.value}`, HTML_CLASSES.RECOGNIZING);
        } else {
          outputLog(`${parsedMessage.value}`, HTML_CLASSES.RECOGNIZED);
        }
        break;
      case RESPONSE_TYPE.RECOGNITION_ERROR:
        outputLog('Recognition error detected.', HTML_CLASSES.SYSTEM_LOG);
        outputLog(parsedMessage.value);
        outputLog('Stopping recorder.', HTML_CLASSES.SYSTEM_LOG);
        stopRecorder();
        outputLog('Ending session.', HTML_CLASSES.SYSTEM_LOG);
        endSession();
        break;
      default:
        outputLog(`Unexpected message type ${parsedMessage.type}.`, HTML_CLASSES.SYSTEM_LOG);
    }
  };

  const connect = async () => {
    const token = await getSignansToken();
    outputLog(`Token: ${token}`, HTML_CLASSES.SYSTEM_LOG);
    let protocol = null;
    if (isLocal()) {
      protocol = 'ws:';
    } else {
      protocol = 'wss:';
    }
    const params = new URLSearchParams();
    params.set('token', `Bearer ${token}`);
    const url = `${protocol}//${SIGNANS_TRANSLATE_DOMAIN}${STREAMING_STT_API_PATH}?${params.toString()}`;
    outputLog(`Connecting to ${url}.`, HTML_CLASSES.SYSTEM_LOG);
    client = new window.WebSocket(url);
    client.onopen = () => {
      outputLog('Connection is opened.', HTML_CLASSES.SYSTEM_LOG);
      setLangauge(speechLanguage);
    };
    client.onmessage = (message) => processMessage(message.data);
    client.onerror = (event) => {
      console.error('Client detected an error.', HTML_CLASSES.SYSTEM_LOG);
      console.error(event);
      outputLog('Connection has an error. See log for details.', HTML_CLASSES.SYSTEM_LOG);
    };
    client.onclose = () => {
      outputLog('Connection is closed.', HTML_CLASSES.SYSTEM_LOG);
      audioRecorder = null;
      client = null;
    };
  };

  const disconnect = () => {
    if (!isConnectionOpen()) {
      return;
    }
    client.close(SIGNANS_CONNECTION_CLOSE_EVENT.NORMAL_CLOSURE);
  };

  const initAudioStream = async () => {
    if (!navigator.mediaDevices) {
      outputLog('MediaDevices not supported, no speech can be recorded.', HTML_CLASSES.SYSTEM_LOG);
      return;
    }
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch (error) {
      console.error('Unable to get media input (audio).');
      console.error(error);
      outputLog('Unable to get audio stream, no speech can be recorded.', HTML_CLASSES.SYSTEM_LOG);
    }
  };

  startButton.onclick = () => {
    accessKey = accessKeyInput.value;
    secretKey = secretKeyInput.value;
    speechLanguage = speechLanguageInput.options[speechLanguageInput.selectedIndex].value;
    outputLog(`Access key: ${accessKey}`, HTML_CLASSES.SYSTEM_LOG);
    outputLog(`Secret key: ${secretKey}`, HTML_CLASSES.SYSTEM_LOG);
    outputLog(`Language: ${speechLanguage}`, HTML_CLASSES.SYSTEM_LOG);
    connect();
  };

  showRecognizingInput.onchange = () => {
    Array.from(document.querySelectorAll(`.${HTML_CLASSES.RECOGNIZING}`)).forEach((element) => applyVisibility(element, showRecognizingInput));
  }

  showSystemLogInput.onchange = () => {
    Array.from(document.querySelectorAll(`.${HTML_CLASSES.SYSTEM_LOG}`)).forEach((element) => applyVisibility(element, showSystemLogInput));
  }

  stopButton.onclick = () => {
    stopRecorder();
    disconnect();
  };

  const outputLog = (message, _class) => {
    const tableTr = document.createElement('tr');
    if (_class) {
      tableTr.classList.add(_class);
      if (_class === HTML_CLASSES.RECOGNIZING) {
        applyVisibility(tableTr, showRecognizingInput);
      }
      if (_class === HTML_CLASSES.SYSTEM_LOG) {
        applyVisibility(tableTr, showSystemLogInput);
      }
    }
    const tableTd1 = document.createElement('td');
    const tableTd2 = document.createElement('td');
    const tableTd3 = document.createElement('td');
    tableTd1.appendChild(document.createTextNode(`${(new Date()).toISOString()}`));
    tableTd2.appendChild(document.createTextNode(`${_class}`));
    tableTd3.appendChild(document.createTextNode(`${message}`));
    tableTr.appendChild(tableTd1);
    tableTr.appendChild(tableTd2);
    tableTr.appendChild(tableTd3);
    output.prepend(tableTr);
  };

  const applyVisibility = (element, input) => {
    element.style.display = input.checked ? 'table-row': 'none';
  }

  initAudioStream();
})();
