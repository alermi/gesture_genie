/**
 * Handpose
 */


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
