/**
 * Simple Server for responding to client requests for Medical transcription
 * =========================================================================
 */

// ------------- SETTINGS
const projectId = 'flowing-gasket-309204'; // process.env.npm_config_PROJECT_ID;
const location = 'global';
const port = ( process.env.npm_config_PORT || 3000 );

const languageCode = 'bn-IN';
let encoding = 'LINEAR16';

// const singleUtterance = true;
const interimResults = false;
const sampleRateHertz = 16000;

console.log('Main. Google Project ID: ', projectId);

// ----------------------


// load all the libraries for the server
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const express = require('express');
const ss = require('socket.io-stream');

// set some server variables
const app = express();
var server;
// var request, sessionId, sessionClient, sessionPath, request;
var speechClient, requestSTT, mediaTranslationClient, requestMedia; // omitted non-used: var ttsClient, requestTTS;

// STT demo
const speech = require('@google-cloud/speech');

// TTS demo
// const textToSpeech = require('@google-cloud/text-to-speech');

// Media Translation Demo
const mediatranslation = require('@google-cloud/media-translation');

// Text Translation Demo
const {Translate} = require('@google-cloud/translate').v2;
const translate = new Translate();
console.log('Main. Translation client details: ', Translate);

/**
 * Setup Express Server with CORS and SocketIO
 */
function setupServer() {
    // setup Express
    app.use(cors());
    app.get('/', function(req, res) {
      res.sendFile(path.join(__dirname + '/index.html'));
    });
    server = http.createServer(app);
    io = socketIo(server);
    server.listen(port, () => {
        console.log('setupServer. Running server on port %s', port);
    });

    // Listener, once the client connect to the server socket
    io.on('connect', (client) => {
        console.log(`setupServer. Client connected [id=${client.id}]`);
        client.emit('server_setup', `Server connected [id=${client.id}]`);

        // when the client sends 'stream-transcribe' events
        // when using audio streaming
        var rawResults, translatedResults;
        ss(client).on('stream-transcribe', function(stream, data) {
            console.log(`Opening stream-transcribe`);
            // get the name of the stream
            const filename = path.basename(data.name);
            // pipe the filename to the stream
            stream.pipe(fs.createWriteStream(filename));
            // make a detectIntStream call
            transcribeAudioStream(stream, function(results){
                rawResults = results.results[0].alternatives[0].transcript
                console.log('setupServer: Raw Transcription: ', rawResults);
                client.emit('results', rawResults);
            });
            // Send for translation            
            translatedResults = translateText(rawResults)
            translatedResults.then(function(translatedResult) {
              console.log('setupServer: Translated Results: ', translatedResult);
              client.emit('translated', translatedResult);
            })
            .catch (err => {
              console.log('setupServer. Translation error: ', err);
            });
            // Empty rawResults to not resend same text for translation
            // If no transcription received. 
            rawResults = "";
      });
    });
}


/**
 * Setup Cloud STT Integration
 */
function setupSTT(){
   // Creates a client
   speechClient = new speech.SpeechClient();

    // Create the initial request object
    // When streaming, this is the first call you will
    // make, a request without the audio stream
    // which prepares Dialogflow in receiving audio
    // with a certain sampleRateHerz, encoding and languageCode
    // this needs to be in line with the audio settings
    // that are set in the client
    console.log('setupSTT. Sampling Rate: ', sampleRateHertz);
    console.log('setupSTT. Encoding: ', encoding);
    console.log('setupSTT. Language Code: ', languageCode);
    requestSTT = {
      config: {
        sampleRateHertz: sampleRateHertz,
        encoding: encoding, // encoding
        languageCode: languageCode
      },
      interimResults: interimResults,
      //enableSpeakerDiarization: true,
      //diarizationSpeakerCount: 2,
      //model: `phone_call`
    }

}

/*
 * Setup Media Translation
 */
function mediaTranslation(){
  mediaTranslationClient = new mediatranslation.SpeechTranslationServiceClient();

  // Create the initial request object
  requestMedia = {
    audioEncoding: encoding,
    sourceLanguageCode: languageCode, // was 'en-US',
    targetLanguageCode: 'en-US'
  }
  console.log('mediaTranslation. Request details for Translation: ', requestMedia);
}

 /*
  * STT - Transcribe Speech on Audio Stream
  * @param audio stream
  * @param cb Callback function to execute with results
  */
 async function transcribeAudioStream(audio, cb) { 
  const recognizeStream = speechClient.streamingRecognize(requestSTT)
  .on('data', function(data){
    console.log(data);
    cb(data);
  })
  .on('error', (err) => {
    console.log('transcribeAudioStream. Error: ', err);
  })
  .on('end', () => {
    console.log('transcribeAudioStream. Audio stream transcribed');
  });

  audio.pipe(recognizeStream);
  audio.on('transcribeAudioStream. End of audio transcription', function() {
      //fileWriter.end();
  });
};

 /*
  * translateText - Translate text from source language to target language
  * @param text to translate
  */
 async function translateText(text) {
  // Translates the text into the target language. 
  // "text" can be a string for translating a single piece of text, 
  // or an array of strings for translating multiple texts.
  console.log('translateText. Submitted for translation:', text);
  let [translations] = await translate.translate(text, 'en');
  translations = Array.isArray(translations) ? translations : [translations];
  return Promise.resolve(translations)
};

setupSTT();
// mediaTranslation();
setupServer();