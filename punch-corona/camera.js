/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
//import * as posenet from '@tensorflow-models/posenet';
//import dat from 'dat.gui';
//import Stats from 'stats.js';

// <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core"></script>
// <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter"></script>



//import {drawBoundingBox, drawKeypoints, drawSkeleton, isMobile, toggleLoadingUI, tryResNetButtonName, tryResNetButtonText, updateTryResNetButtonDatGuiCss} from './demo_util';

// 960 x 600
//const videoWidth = 120;//600;
//const videoHeight = 75;
const videoWidth = 300;
const videoHeight = 250;

//const stats = new Stats();

/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const video = document.getElementById('video');
  video.width = videoWidth;
  video.height = videoHeight;

  const mobile = isMobile();
  const stream = await navigator.mediaDevices.getUserMedia({
    'audio': false,
    'video': {
      facingMode: 'user',
      width: mobile ? undefined : videoWidth,
      height: mobile ? undefined : videoHeight,
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

const defaultQuantBytes = 2;

//const defaultMobileNetMultiplier = isMobile() ? 0.50 : 0.75;
const defaultMobileNetMultiplier = 0.50;
const defaultMobileNetStride = 16;
const defaultMobileNetInputResolution = 200;

const defaultResNetMultiplier = 1.0;
const defaultResNetStride = 32;
const defaultResNetInputResolution = 250;

const guiState = {
  algorithm: 'single-pose',
  //algorithm: 'multi-pose',
  input: {
    architecture: 'MobileNetV1',
    outputStride: defaultMobileNetStride,
    inputResolution: defaultMobileNetInputResolution,
    multiplier: defaultMobileNetMultiplier,
    quantBytes: defaultQuantBytes

    // architecture: 'ResNet50',
    // outputStride: defaultResNetStride,
    // inputResolution: defaultResNetInputResolution,
    // multiplier: defaultResNetMultiplier,
    // quantBytes: defaultQuantBytes
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.0,
  },

  multiPoseDetection: {
    maxPoseDetections: 5,
    minPoseConfidence: 0.10,
    minPartConfidence: 0.0,//0.01,
    nmsRadius: 30.0,
  },

  output: {
    showVideo: true,
    showSkeleton: true,
    showPoints: true,
    showBoundingBox: false,
  },
  net: null,
};

/**
 * Sets up dat.gui controller on the top-right of the window
 */
function setupGui(cameras, net) {
  guiState.net = net;
  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }
}

class PunchDetector {

  constructor(min_x, min_y, max_x, max_y) {
    this.min_x = min_x;
    this.min_y = min_y;
    this.max_x = max_x;
    this.max_y = max_y;
    this.inside = false;
  }

  detect_punch(score, x, y) {
    if (score < 0.5) {
      return;
    }

    is_punch = false;
    if (x >= this.min_x && x < this.max_x &&
        y >= this.min_y && y < this.max_y) {

        if (!this.inside) {
          is_punch = true;
        }
        this.inside = true;
    } else {
      this.inside = false;
    }
    return is_punch;
  }

  // draw(ctx) {
  //   drawPoint(ctx, this.min_y * videoHeight, this.min_x * videoWidth, 3, 'green');
  //   drawPoint(ctx, this.max_y * videoHeight, this.min_x * videoWidth, 3, 'green');
  //   drawPoint(ctx, this.max_y * videoHeight - 3, this.max_x * videoWidth, 3, 'green');
  // }
}

//const punch_detector = new PunchDetector(1 - 0.4, 0, 1.0, 0.50);
/**
 * Feeds an image to posenet to estimate poses - this is where the magic
 * happens. This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video, net) {
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');

  // since images are being fed from a webcam, we want to feed in the
  // original image and then just flip the keypoints' x coordinates. If instead
  // we flip the image, then correcting left-right keypoint pairs requires a
  // permutation on all the keypoints.
  const flipPoseHorizontal = true;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  async function poseDetectionFrame() {


    // Begin monitoring code for frames per second
    //stats.begin();

    let poses = [];
    let minPoseConfidence;
    let minPartConfidence;
    switch (guiState.algorithm) {
      case 'single-pose':
      case 'multi-pose':
        const pose = await guiState.net.estimatePoses(video, {
          flipHorizontal: flipPoseHorizontal,
          //decodingMethod: 'single-person'

          decodingMethod: 'multi-person',
          maxDetections: guiState.multiPoseDetection.maxPoseDetections,
          scoreThreshold: guiState.multiPoseDetection.minPartConfidence,
          nmsRadius: guiState.multiPoseDetection.nmsRadius
        });
        poses = poses.concat(pose);
        if (poses.length <= 0) {
          poseDetectionFrame();
          return;
        }
        leftWrist = pose[0].keypoints[9];
        rightWrist = pose[0].keypoints[10];

        //is_punch = punch_detector.detect_punch(rightWrist.score, rightWrist.position.x, rightWrist.position.y);

        try{
          var msg = (leftWrist.position.x / videoWidth) + ":" + (leftWrist.position.y / videoHeight) + ":" + (rightWrist.position.x / videoWidth) + ":" + (rightWrist.position.y / videoHeight);
          unityInstance.SendMessage("HandManager", "OnHandMove", msg);
          //unityInstance.SendMessage("Hand", "OnRightHandMove", (rightWrist.position.x / videoWidth) + ":" + (rightWrist.position.y / videoHeight));
        } catch(err) {

        }
        //if (is_punch) {
          //unityInstance.SendMessage("Cube", "OnBrowserMessage", 1);
          //console.log("is_punch: " + is_punch);
        //}
        //console.log(rightWrist.score + " " + rightWrist.position.x + " " + rightWrist.position.y);

        minPoseConfidence = +guiState.singlePoseDetection.minPoseConfidence;
        minPartConfidence = +guiState.singlePoseDetection.minPartConfidence;
        break;
    }

    ctx.clearRect(0, 0, videoWidth, videoHeight);

    if (guiState.output.showVideo) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-videoWidth, 0);
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      ctx.restore();
    }

    //punch_detector.draw(ctx);
    // For each pose (i.e. person) detected in an image, loop through the poses
    // and draw the resulting skeleton and keypoints if over certain confidence
    // scores
    poses.forEach(({score, keypoints}) => {
      if (score >= minPoseConfidence) {
        if (guiState.output.showPoints) {
          drawKeypoints(keypoints, minPartConfidence, ctx);
        }
        if (guiState.output.showSkeleton) {
          drawSkeleton(keypoints, minPartConfidence, ctx);
        }
        if (guiState.output.showBoundingBox) {
          drawBoundingBox(keypoints, ctx);
        }
      }
    });

    // End monitoring code for frames per second
    //stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}

/**
 * Kicks off the demo by loading the posenet model, finding and loading
 * available camera devices, and setting off the detectPoseInRealTime function.
 */
async function bindPage() {
  toggleLoadingUI(true);
  const net = await posenet.load({
    architecture: guiState.input.architecture,
    outputStride: guiState.input.outputStride,
    inputResolution: guiState.input.inputResolution,
    multiplier: guiState.input.multiplier,
    quantBytes: guiState.input.quantBytes
  });
  toggleLoadingUI(false);

  let video;

  try {
    video = await loadVideo();
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = 'this browser does not support video capture,' +
        'or this device does not have a camera';
    info.style.display = 'block';
    throw e;
  }

  setupGui([], net);
  detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
