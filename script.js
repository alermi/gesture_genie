/************************************************************************
* Gesture-Genie
* MUS206, Spring 2020 Final Projcet
* Authors: Ani Lermi, Rebecca Kreitinger, Divyank Rahoria
*    
*   Gesture Genie is a version of Piano Genie where notes are controlled
*   by hand movements and position rather than buttons. The goal is to 
*   create a more natural control for playing the piano
* 
*   This file contains the code for Piano Genie as well as getting the 
*   handpose. Each finger triggers a button event. This gives the user 
*   the option to use the gestures or the buttons. 
************************************************************************/


/*****************************************************************************************
* Begin Piano Genie 
*****************************************************************************************/
/*************************
 * Consts for everyone!
 ************************/
// button mappings.
const MAPPING_8 = {0:0, 1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7};
const MAPPING_4 = {0:0, 1:2, 2:5, 3:7};
const BUTTONS_DEVICE = ['a','s','d','f','j','k','l',';'];
const BUTTONS_MAKEY = ['ArrowUp','ArrowLeft','ArrowDown','ArrowRight','w','a','s','d'];
const BUTTONS_MAKEY_DISPLAY = ['↑','←','↓','→','w','a','s','d'];

let OCTAVES = 7;
let NUM_BUTTONS = 8;
let BUTTON_MAPPING = MAPPING_8;

let keyWhitelist;
let TEMPERATURE = getTemperature();

const heldButtonToVisualData = new Map();

// Which notes the pedal is sustaining.
let sustaining = false
let sustainingNotes = [];

// Mousedown/up events are weird because you can mouse down in one element and mouse up
// in another, so you're going to lose that original element and never mouse it up.
let mouseDownButton = null;

const player = new Player();
const genie = new mm.PianoGenie(CONSTANTS.GENIE_CHECKPOINT);
const painter = new FloatyNotes();
const piano = new Piano();
let isUsingMakey = false;
initEverything();

/*************************
 * Basic UI bits
 ************************/
function initEverything() {
  genie.initialize().then(() => {
    console.log('🧞‍♀️ ready!');
    playBtn.textContent = 'Play';
    playBtn.removeAttribute('disabled');
    playBtn.classList.remove('loading');
  });

  // Start the drawing loop.
  onWindowResize();
  updateButtonText();
  window.requestAnimationFrame(() => painter.drawLoop());

  // Event listeners.
  document.getElementById('numButtons4').addEventListener('change', (event) => event.target.checked && updateNumButtons(4));
  document.getElementById('numButtons8').addEventListener('change', (event) => event.target.checked && updateNumButtons(8));
  
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('orientationchange', onWindowResize);
  window.addEventListener('hashchange', () => TEMPERATURE = getTemperature());
}

function updateNumButtons(num) {
  NUM_BUTTONS = num;
  const buttons = document.querySelectorAll('.controls > button.color');
  BUTTON_MAPPING = (num === 4) ? MAPPING_4 : MAPPING_8;
  
  // Hide the extra buttons.
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].hidden = i >= num;
  }
}

function showMainScreen() {
  document.querySelector('.splash').hidden = true;
  document.querySelector('.loaded').hidden = false;

  document.addEventListener('keydown',onKeyDown);
  
  controls.addEventListener('touchstart', (event) => doTouchStart(event), {passive: true});
  controls.addEventListener('touchend', (event) => doTouchEnd(event), {passive: true});
  
  const hasTouchEvents = ('ontouchstart' in window);
  if (!hasTouchEvents) {
    controls.addEventListener('mousedown', (event) => doTouchStart(event));
    controls.addEventListener('mouseup', (event) => doTouchEnd(event));
  }
  
  controls.addEventListener('mouseover', (event) => doTouchMove(event, true));
  controls.addEventListener('mouseout', (event) => doTouchMove(event, false));
  controls.addEventListener('touchenter', (event) => doTouchMove(event, true));
  controls.addEventListener('touchleave', (event) => doTouchMove(event, false));
  canvas.addEventListener('mouseenter', () => mouseDownButton = null);
  
  // Output.
  radioMidiOutYes.addEventListener('click', () => {
    player.usingMidiOut = true;
    midiOutBox.hidden = false;
  });
  radioAudioYes.addEventListener('click', () => {
    player.usingMidiOut = false;
    midiOutBox.hidden = true;
  });
  // Input.
  radioMidiInYes.addEventListener('click', () => {
    player.usingMidiIn = true;
    midiInBox.hidden = false;
    isUsingMakey = false;
    updateButtonText();
  });
  radioDeviceYes.addEventListener('click', () => {
    player.usingMidiIn = false;
    midiInBox.hidden = true;
    isUsingMakey = false;
    updateButtonText();
  });
  radioMakeyYes.addEventListener('click', () => {
    player.usingMidiIn = false;
    midiInBox.hidden = true;
    isUsingMakey = true;
    updateButtonText();
  });
  
  // Figure out if WebMidi works.
  if (navigator.requestMIDIAccess) {
    midiNotSupported.hidden = true;
    radioMidiInYes.parentElement.removeAttribute('disabled');
    radioMidiOutYes.parentElement.removeAttribute('disabled');
    navigator.requestMIDIAccess()
      .then(
          (midi) => player.midiReady(midi),
          (err) => console.log('Something went wrong', err));
  } else {
    midiNotSupported.hidden = false;
    radioMidiInYes.parentElement.setAttribute('disabled', true);
    radioMidiOutYes.parentElement.setAttribute('disabled', true);
  }

  document.addEventListener('keyup', onKeyUp);

  // Slow to start up, so do a fake prediction to warm up the model.
  const note = genie.nextFromKeyWhitelist(0, keyWhitelist, TEMPERATURE);
  genie.resetState();
}

// Here touch means either touch or mouse.
function doTouchStart(event) {
  event.preventDefault();
  mouseDownButton = event.target; 
  buttonDown(event.target.dataset.id, true);
}
function doTouchEnd(event) {
  event.preventDefault();
  if (mouseDownButton && mouseDownButton !== event.target) {
    buttonUp(mouseDownButton.dataset.id);
  }
  mouseDownButton = null;
  buttonUp(event.target.dataset.id);
}
function doTouchMove(event, down) {
   // If we're already holding a button down, start holding this one too.
  if (!mouseDownButton)
    return;
  
  if (down)
    buttonDown(event.target.dataset.id, true);
  else 
    buttonUp(event.target.dataset.id, true);
}

/*************************
 * Button actions
 ************************/
function buttonDown(button, fromKeyDown) {
  // If we're already holding this button down, nothing new to do.
  console.log("Button Down");
  if (heldButtonToVisualData.has(button)) {
    return;
  }
  
  const el = document.getElementById(`btn${button}`);
  if (!el)
    return;
  el.setAttribute('active', true);
  
  const note = genie.nextFromKeyWhitelist(BUTTON_MAPPING[button], keyWhitelist, TEMPERATURE);
  const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + note;

  // Hear it.
  player.playNoteDown(pitch, button);
  
  // See it.
  const rect = piano.highlightNote(note, button);
  
  if (!rect) {
    debugger;
  }
  // Float it.
  const noteToPaint = painter.addNote(button, rect.getAttribute('x'), rect.getAttribute('width'));
  heldButtonToVisualData.set(button, {rect:rect, note:note, noteToPaint:noteToPaint});
}

function buttonUp(button) {
  console.log("Button Up");
  const el = document.getElementById(`btn${button}`);
  if (!el)
    return;
  el.removeAttribute('active');
  
  const thing = heldButtonToVisualData.get(button);
  if (thing) {
    // Don't see it.
    piano.clearNote(thing.rect);
    
    // Stop holding it down.
    painter.stopNote(thing.noteToPaint);
    
    // Maybe stop hearing it.
    const pitch = CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note;
    if (!sustaining) {
      player.playNoteUp(pitch, button);
    } else {
      sustainingNotes.push(CONSTANTS.LOWEST_PIANO_KEY_MIDI_NOTE + thing.note);
    }
  }
  heldButtonToVisualData.delete(button);
}

/*************************
 * Events
 ************************/
function onKeyDown(event) {
  // Keydown fires continuously and we don't want that.
  if (event.repeat) {
    return;
  }
  if (event.key === ' ') {  // sustain pedal
    sustaining = true;
  } else if (event.key === '0' || event.key === 'r') {
    console.log('🧞‍♀️ resetting!');
    genie.resetState();
  } else {
    const button = getButtonFromKeyCode(event.key);
    if (button != null) {
      buttonDown(button, true);
    }
  }
}

function onKeyUp(event) {
  if (event.key === ' ') {  // sustain pedal
    sustaining = false;
    
    // Release everything.
    sustainingNotes.forEach((note) => player.playNoteUp(note, -1));
    sustainingNotes = [];
  } else {
    const button = getButtonFromKeyCode(event.key);
    if (button != null) {
      buttonUp(button);
    }
  }
}

function onWindowResize() {
  OCTAVES = window.innerWidth > 700 ? 7 : 3;
  const bonusNotes = OCTAVES > 6 ? 4 : 0;  // starts on an A, ends on a C.
  const totalNotes = CONSTANTS.NOTES_PER_OCTAVE * OCTAVES + bonusNotes; 
  const totalWhiteNotes = CONSTANTS.WHITE_NOTES_PER_OCTAVE * OCTAVES + (bonusNotes - 1); 
  keyWhitelist = Array(totalNotes).fill().map((x,i) => {
    if (OCTAVES > 6) return i;
    // Starting 3 semitones up on small screens (on a C), and a whole octave up.
    return i + 3 + CONSTANTS.NOTES_PER_OCTAVE;
  });
  
  piano.resize(totalWhiteNotes);
  painter.resize(piano.config.whiteNoteHeight);
  piano.draw();
}

/*************************
 * Utils and helpers
 ************************/
function getButtonFromKeyCode(key) {
  // 1 - 8
  if (key >= '1' && key <= String(NUM_BUTTONS)) {
    return parseInt(key) - 1;
  } 
  
  const index = isUsingMakey ? BUTTONS_MAKEY.indexOf(key) : BUTTONS_DEVICE.indexOf(key);
  return index !== -1 ? index : null;
}

function getTemperature() {
  const hash = parseFloat(parseHashParameters()['temperature']) || 0.25;
  const newTemp = Math.min(1, hash);
  console.log('🧞‍♀️ temperature = ', newTemp);
  return newTemp;
}

function parseHashParameters() {
  const hash = window.location.hash.substring(1);
  const params = {}
  hash.split('&').map(hk => {
    let temp = hk.split('=');
    params[temp[0]] = temp[1]
  });
  return params;
}

function updateButtonText() {
  const btns = document.querySelectorAll('.controls button.color');
  for (let i = 0; i < btns.length; i++) {
    btns[i].innerHTML = isUsingMakey ? 
        `<span>${BUTTONS_MAKEY_DISPLAY[i]}</span>` : 
        `<span>${i + 1}</span><br><span>${BUTTONS_DEVICE[i]}</span>`;
  }
}



/*****************************************************************************************
* Begin Handpose
*****************************************************************************************/
let indexDown = false;
let middleDown = false;
let ringDown = false;
let pinkyDown = false;

let fingerPositions = [false, false, false, false];

tf.wasm.setWasmPath(
    `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${
        tf.wasm.version_wasm}/dist/tfjs-backend-wasm.wasm`);


let videoWidth, videoHeight,
    scatterGLHasInitialized = false, scatterGL, fingerLookupIndices = {
      thumb: [0, 1, 2, 3, 4],
      indexFinger: [0, 5, 6, 7, 8],
      middleFinger: [0, 9, 10, 11, 12],
      ringFinger: [0, 13, 14, 15, 16],
      pinky: [0, 17, 18, 19, 20]
    };  // for rendering each finger as a polyline

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 500;

const state = {
  backend: 'webgl'
};

function drawPoint(ctx, y, x, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

function calculateFingerTrigger(jointCoordinates, endCoordinates){
  if (endCoordinates[1] < jointCoordinates[1]){
    return false;
  }
  else return true;
}
function isThumbOpen(keypoints){
  // console.log("Coordinate 1: " + keypoints[2][0]);
  // console.log("Coordinate 2: " + keypoints[4][0]);
  if(keypoints[2][0] > keypoints[4][0]){
    if(isRightHand(keypoints)){
      return false
    }
    else return true;
  }
  else{
    if(isRightHand(keypoints)){
      return true
    }
    else return false;
  }
}

function handleFingerPosition(keypoints, jointCoordinates, endCoordinates, note){
  if(!isRightHand(keypoints)){
    note = 3 - note
  }
  if(calculateFingerTrigger(jointCoordinates, endCoordinates)){
    // console.log("Index Finger Trigger!");
    fingerPositions[note]
    if(!fingerPositions[note]){
      buttonDown(note, true);
      if(isThumbOpen(keypoints)){
        buttonDown(note + 4, true);
      }
      fingerPositions[note] = true;
    }
  }
  else{
    if(fingerPositions[note]){
      buttonUp(note,true)
      buttonUp(note + 4, true);
      fingerPositions[note] = false;
    }
  }
}

function isRightHand(keypoints){
  if(keypoints[19][0] < keypoints[2][0]){
    return true;
  }
  else {
    return false;
  }
}

function drawKeypoints(ctx, keypoints) {
  const keypointsArray = keypoints;
  
  // output keypoints to console
  for (let i = 0; i < keypoints.length; i++) {
    const [x, y, z] = keypoints[i];
    // console.log(`Keypoint ${i}: [${x}, ${y}, ${z}]`);
  }
  
  handleFingerPosition(keypoints, keypoints[6], keypoints[8], 0)
  handleFingerPosition(keypoints, keypoints[10], keypoints[12], 1)
  handleFingerPosition(keypoints, keypoints[14], keypoints[16], 2)
  handleFingerPosition(keypoints, keypoints[18], keypoints[20], 3)
  if(isThumbOpen(keypoints)){
    console.log("Thumb Open");
  }
  else console.log("Thumb Closed");

  for (let i = 0; i < keypointsArray.length; i++) {
    const y = keypointsArray[i][0];
    const x = keypointsArray[i][1];
    drawPoint(ctx, x - 2, y - 2, 3);
  }

  const fingers = Object.keys(fingerLookupIndices);
  for (let i = 0; i < fingers.length; i++) {
    const finger = fingers[i];
    const points = fingerLookupIndices[finger].map(idx => keypoints[idx]);
    drawPath(ctx, points, false);
  }
}

function drawPath(ctx, points, closePath) {
  const region = new Path2D();
  region.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    region.lineTo(point[0], point[1]);
  }

  if (closePath) {
    region.closePath();
  }
  ctx.stroke(region);
}

let model;

async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const video = document.getElementById('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    'audio': false,
    'video': {
      facingMode: 'user',

      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();
  return video;
}

const main =
    async () => {
  await tf.setBackend(state.backend);
  model = await handpose.load();
  let video;

  try {
    video = await loadVideo();
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = e.message;
    info.style.display = 'block';
    throw e;
  }

  landmarksRealTime(video);
}

const landmarksRealTime = async (video) => {

  // Stats shows fps window
  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  videoWidth = video.videoWidth;
  videoHeight = video.videoHeight;

  const canvas = document.getElementById('output');

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  const ctx = canvas.getContext('2d');

  video.width = videoWidth;
  video.height = videoHeight;

  ctx.clearRect(0, 0, videoWidth, videoHeight);
  ctx.strokeStyle = 'red';
  ctx.fillStyle = 'red';

  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  // These anchor points allow the hand pointcloud to resize according to its
  // position in the input.
  const ANCHOR_POINTS = [
    [0, 0, 0], [0, -VIDEO_HEIGHT, 0], [-VIDEO_WIDTH, 0, 0],
    [-VIDEO_WIDTH, -VIDEO_HEIGHT, 0]
  ];

  async function frameLandmarks() {
    stats.begin();
    ctx.drawImage(
        video, 0, 0, videoWidth, videoHeight, 0, 0, canvas.width,
        canvas.height);
    const predictions = await model.estimateHands(video);
    if (predictions.length > 0) {
      const result = predictions[0].landmarks;
      drawKeypoints(ctx, result, predictions[0].annotations);

    }
    stats.end();
    requestAnimationFrame(frameLandmarks);
  };

  frameLandmarks();

};

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

main();

