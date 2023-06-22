/*
  Streaming Speech-to-text example

  Note:
    - This sample code works in the browser. Doesn't work with server-side JavaScript.
    - This JavaSript file is loaded when streaming-stt.html is opened in a browser.

  Architecture:
    - class SignansClient: Establish a websocket connection with Signans.
    - class AudioRecorder: Utilize MediaRecorder object on browser.
    - By these, integrate websocket connection and audio streams to get speech recognition results.

*/

// audio recorder constants (parameter)
const AUDIO_SLICE_INTERVAL = 1000;
const AUDIO_SAMPLE_RATE = 16000;

// signans client constants (parameter)
const SIGNANS_CLIENT = {
    SIGNANS_DOMAIN: 'translate.signans.io',
    ACCESS_KEY: '',
    SECRET_KEY: '',
};

// signans client constants (for logic)
SIGNANS_CLIENT.CONNECTION_READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
};

SIGNANS_CLIENT.CONNECTION_CLOSE_EVENT = {
    NORMAL_CLOSURE: 1000,
};

SIGNANS_CLIENT.COMMAND_TYPE = {
    SET_LANGUAGE: 'SET_LANGUAGE',
    SET_SAMPLING_RATE: 'SET_SAMPLING_RATE',
    END_STREAM: 'END_STREAM',
    END_SESSION: 'END_SESSION',
};

SIGNANS_CLIENT.RESPONSE_TYPE = {
    LANGUAGE_READY: 'LANGUAGE_READY',
    SAMPLING_RATE_READY: 'SAMPLING_RATE_READY',
    RECOGNITION_RESULT: 'RECOGNITION_RESULT',
    RECOGNITION_ERROR: 'RECOGNITION_ERROR',
};

// audio recorder constants (for logic)
const AUDIO_RECORDER_STATE = {
    INACTIVE: 'inactive',
    RECORDING: 'recording',
    PAUSED: 'paused',
};

// Signans API wrapper class
class SignansClient {
    connection;
    token;
    recorder;
    constructor(accessKey, secretKey, speechLanguage) {
        this.accessKey = accessKey;
        this.secretKey = secretKey;
        this.speechLanguage = speechLanguage;
        outputLog(`Access key: ${accessKey}`, HTML_CLASSES.SYSTEM_LOG);
        outputLog(`Secret key: ${secretKey}`, HTML_CLASSES.SYSTEM_LOG);
        outputLog(`Language: ${speechLanguage}`, HTML_CLASSES.SYSTEM_LOG);
    }
    setRecorder(recorder) {
        this.recorder = recorder;
    }
    isLocal() {
        const { hostname } = window.location;
        return (!hostname || (hostname === '127.0.0.1') || (hostname === 'localhost'));
    }
    isConnectionOpen() {
        if (this.connection === null) {
            return false;
        }
        return (this.connection.readyState === SIGNANS_CLIENT.CONNECTION_READY_STATE.OPEN);
    }
    async getSignansToken() {
        const protocol = this.isLocal() ? 'http:' : 'https:';
        const url = `${protocol}//${SIGNANS_CLIENT.SIGNANS_DOMAIN}/api/v1/token`;
        const response = await window.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                accessKey: this.accessKey,
                secretKey: this.secretKey,
            }),
        });
        if (!response.ok) {
            outputLog('Unable to obtain JWT for authentication.', HTML_CLASSES.SYSTEM_LOG);
            return null;
        }
        const responseJSON = await response.json();
        return responseJSON.data.encodedJWT;
    }
    setLanguage(language) {
        if (!this.isConnectionOpen()) {
            outputLog('Connection is not open, unable to set speech language.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        this.connection.send(JSON.stringify({
            command: SIGNANS_CLIENT.COMMAND_TYPE.SET_LANGUAGE,
            value: language,
        }));
    }
    setSamplingRate(samplingRate) {
        if (!this.isConnectionOpen()) {
            outputLog('Connection is not open, unable to set sampling rate.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        this.connection.send(JSON.stringify({
            command: SIGNANS_CLIENT.COMMAND_TYPE.SET_SAMPLING_RATE,
            value: samplingRate,
        }));
    }
    sendAudio(blob) {
        if (!this.isConnectionOpen()) {
            outputLog('Connection is not open, unable to send audio.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        this.connection.send(blob);
    }
    endSession() {
        if (!this.isConnectionOpen()) {
            outputLog('Connection is not open, unable end session.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        this.connection.send(JSON.stringify({
            command: SIGNANS_CLIENT.COMMAND_TYPE.END_SESSION,
        }));
    }
    async connect() {
        if (!this.token) {
            this.token = await this.getSignansToken();
            outputLog(`Token: ${this.token}`, HTML_CLASSES.SYSTEM_LOG);
        }
        const protocol = this.isLocal() ? 'ws:' : 'wss:';
        const params = new URLSearchParams();
        params.set('token', `Bearer ${this.token}`);
        const url = `${protocol}//${SIGNANS_CLIENT.SIGNANS_DOMAIN}/api/v1/translate/stt-streaming?${params.toString()}`;
        outputLog(`Connecting to ${url}.`, HTML_CLASSES.SYSTEM_LOG);
        this.connection = new window.WebSocket(url);
        this.connection.onopen = () => {
            outputLog('Connection is opened.', HTML_CLASSES.SYSTEM_LOG);
            this.setLanguage(this.speechLanguage);
        };
        this.connection.onmessage = message => this.processMessage(message.data);
        this.connection.onerror = (event) => {
            console.error('Client detected an error.', HTML_CLASSES.SYSTEM_LOG);
            console.error(event);
            outputLog('Connection has an error. See log for details.', HTML_CLASSES.SYSTEM_LOG);
        };
        this.connection.onclose = () => {
            outputLog('Connection is closed.', HTML_CLASSES.SYSTEM_LOG);
            this.disconnect();
            this.connection = null;
        };
    }
    disconnect() {
        if (!this.isConnectionOpen()) {
            return;
        }
        this.connection.close(SIGNANS_CLIENT.CONNECTION_CLOSE_EVENT.NORMAL_CLOSURE);
    }
    // logic on message received from signans
    processMessage(message) {
        let parsedMessage = null;
        try {
            parsedMessage = JSON.parse(message);
        } catch (error) {
            console.error(`Unable to parse the raw message: ${message}`);
            outputLog('Ignored a message, which cannot be parsed, from server.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        switch (parsedMessage.type) {
        case SIGNANS_CLIENT.RESPONSE_TYPE.LANGUAGE_READY:
            outputLog('Speech language has been set.', HTML_CLASSES.SYSTEM_LOG);
            this.setSamplingRate(AUDIO_SAMPLE_RATE);
            break;
        case SIGNANS_CLIENT.RESPONSE_TYPE.SAMPLING_RATE_READY:
            outputLog('Sampling rate has been set.', HTML_CLASSES.SYSTEM_LOG);
            outputLog('Initializing recorder.', HTML_CLASSES.SYSTEM_LOG);
            this.recorder.initRecorder();
            break;
        case SIGNANS_CLIENT.RESPONSE_TYPE.RECOGNITION_RESULT:
            if (parsedMessage.status === 'recognizing') {
                outputLog(`${parsedMessage.value}`, HTML_CLASSES.RECOGNIZING);
            } else {
                outputLog(`${parsedMessage.value}`, HTML_CLASSES.RECOGNIZED);
            }
            break;
        case SIGNANS_CLIENT.RESPONSE_TYPE.RECOGNITION_ERROR:
            outputLog('Recognition error detected.', HTML_CLASSES.SYSTEM_LOG);
            outputLog(parsedMessage.value);
            outputLog('Stopping recorder.', HTML_CLASSES.SYSTEM_LOG);
            this.recorder.stopRecorder();
            outputLog('Ending session.', HTML_CLASSES.SYSTEM_LOG);
            this.endSession();
            break;
        default:
            outputLog(`Unexpected message type ${parsedMessage.type}.`, HTML_CLASSES.SYSTEM_LOG);
        }
    }
}

// Media recorder on browser wrapper class
class AudioRecorder {
    recorder;
    audioChunks;
    recordLoopTimer;
    signansClient;
    constructor() {
        this.audioContext = new window.AudioContext();
    }
    setSignansClient(signansClient) {
        this.signansClient = signansClient;
    }
    initRecorder() {
        this.recorder = new window.MediaRecorder(this.audioStream);
        const { audioBitsPerSecond } = this.recorder;
        outputLog(`Recorder encodes at ${audioBitsPerSecond} bits/s.`, HTML_CLASSES.SYSTEM_LOG);
        this.recorder.ondataavailable = event => this.audioChunks.push(event.data);
        this.recorder.onerror = event => this.processRecorderError(event);
        this.recorder.start(AUDIO_SLICE_INTERVAL);
        outputLog('Please speak.', HTML_CLASSES.SYSTEM_LOG);
        this.initRecordLoop();
    }
    initRecordLoop() {
        this.audioChunks = [];
        this.recordLoopTimer = setInterval(() => {
            this.recorder.stop();
            let blob = null;
            if (this.audioChunks.length > 0) {
                blob = new Blob(this.audioChunks);
                this.audioChunks = [];
            }
            this.recorder.start(AUDIO_SLICE_INTERVAL);
            if (blob !== null) {
                this.processAudioSliceBlob(blob);
            }
        }, AUDIO_SLICE_INTERVAL);
    }
    stopRecorder() {
        if (this.recordLoopTimer) {
            clearInterval(this.recordLoopTimer);
        }
        if (this.recorder === null) {
            return;
        }
        if (this.recorder.state !== AUDIO_RECORDER_STATE.RECORDING) {
            return;
        }
        this.recorder.stop();
    }
    async processAudioSliceBlob(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        try {
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            const originalSampleRate = audioBuffer.sampleRate;
            const fistChannelIndex = 0;
            const f32Array = audioBuffer.getChannelData(fistChannelIndex);
            const modF32Array = this.downSampling(
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
            if (this.signansClient) {
                this.signansClient.sendAudio(wavBlob);
            }
        } catch (error) {
            console.error('Unable to decode arraybuffer to audiobuffer.');
            console.error(error);
        }
    }
    downSampling(channelData, originalSampleRate, exportSampleRate) {
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
    }
    async initAudioStream() {
        if (!navigator.mediaDevices) {
            outputLog('MediaDevices not supported, no speech can be recorded.', HTML_CLASSES.SYSTEM_LOG);
            return;
        }
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
        } catch (error) {
            console.error('Unable to get media input (audio).');
            console.error(error);
            outputLog('Unable to get audio stream, no speech can be recorded.', HTML_CLASSES.SYSTEM_LOG);
        }
    }
    processRecorderError(event) {
        const { error } = event;
        console.error(`Record error: ${error.name}.`);
        console.error(error);
        outputLog('Error occurred during recording.', HTML_CLASSES.SYSTEM_LOG);
    }
}

let signansClient;
const audioRecorder = new AudioRecorder();

// HTML elements
const accessKeyInput = document.getElementById('access-key');
const secretKeyInput = document.getElementById('secret-key');
const speechLanguageInput = document.getElementById('speech-language');
const startStopButton = document.getElementById('start-stop-button');
const showSystemLogInput = document.getElementById('show-system-log');
const showRecognizingInput = document.getElementById('show-recognizing');

// initialize: set signans key to HTML input value
if (SIGNANS_CLIENT.ACCESS_KEY) {
    accessKeyInput.value = SIGNANS_CLIENT.ACCESS_KEY;
}

// initialize: set signans secret key to HTML input value
if (SIGNANS_CLIENT.SECRET_KEY) {
    secretKeyInput.value = SIGNANS_CLIENT.SECRET_KEY;
}

const HTML_CLASSES = {
    SYSTEM_LOG: 'system-log',
    RECOGNIZING: 'recognizing',
    RECOGNIZED: 'recognized',
};

// recognition result output logic to HTML element
function outputLog(message, _class) {
    const output = document.getElementById('output');
    const tableTr = document.createElement('tr');
    if (_class) {
        tableTr.classList.add(_class);
        if (_class === HTML_CLASSES.RECOGNIZING) {
            tableTr.style.display = getDisplayStyleValue(showRecognizingInput);
        }
        if (_class === HTML_CLASSES.SYSTEM_LOG) {
            tableTr.style.display = getDisplayStyleValue(showSystemLogInput);
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
}

function getDisplayStyleValue(input) {
    return input.checked ? 'table-row' : 'none';
}

// toggle signans recognition connection
startStopButton.onclick = () => {
    if (startStopButton.value === 'Recognition START') {
        const speechLanguage = speechLanguageInput.options[speechLanguageInput.selectedIndex].value;
        signansClient = new SignansClient(accessKeyInput.value, secretKeyInput.value, speechLanguage);
        audioRecorder.setSignansClient(signansClient);
        signansClient.setRecorder(audioRecorder);
        signansClient.connect();
        startStopButton.value = 'Recognition STOP';
    } else {
        audioRecorder.stopRecorder();
        signansClient.disconnect();
        startStopButton.value = 'Recognition START';
    }
};

// toggle recognizing message visibility
showRecognizingInput.onchange = () => {
    Array.from(document.querySelectorAll(`.${HTML_CLASSES.RECOGNIZING}`)).forEach((element) => {
        element.style.display = getDisplayStyleValue(showRecognizingInput);
    });
};

// toggle system log visibility
showSystemLogInput.onchange = () => {
    Array.from(document.querySelectorAll(`.${HTML_CLASSES.SYSTEM_LOG}`)).forEach((element) => {
        element.style.display = getDisplayStyleValue(showSystemLogInput);
    });
};

// get audio stream on browser
audioRecorder.initAudioStream();
