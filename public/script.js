const socket = io('/')
const videoGrid = document.getElementById('video-grid')
const encryptedVideoGrid = document.getElementById('encrypted-video-grid')

const myPeer = new Peer(undefined, {})
const myVideo = document.createElement('video')
myVideo.muted = true
const peers = {} // dictionary of calls for all connected peers userId
let plainLocalStream;
let cypheredLocalStream

const startButton = document.querySelector('button#start');
const callButton = document.querySelector('button#call');
const hangupButton = document.querySelector('button#hangup');
const cryptoKey = document.querySelector('#crypto-key');
const cryptoOffsetBox = document.querySelector('#crypto-offset');
cryptoKey.addEventListener('change', setCryptoKey);
cryptoOffsetBox.addEventListener('change', setCryptoKey);

const supportsInsertableStreams =
      !!RTCRtpSender.prototype.createEncodedStreams;

let supportsTransferableStreams = false;
try {
  const stream = new ReadableStream();
  window.postMessage(stream, '*', [stream]);
  supportsTransferableStreams = true;
} catch (e) {
  console.error('Transferable streams are not supported.');
}

if (!(supportsInsertableStreams && supportsTransferableStreams)) {
  banner.innerText = 'Your browser does not support Insertable Streams. ' +
  'This sample will not work.';
  if (adapter.browserDetails.browser === 'chrome') {
    banner.innerText += ' Try with Enable experimental Web Platform features enabled from chrome://flags.';
  }
  startButton.disabled = true;
  cryptoKey.disabled = true;
  cryptoOffsetBox.disabled = true;
}

startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

const worker = new Worker('worker.js', {name: 'E2EE worker'});




console.log('Requesting local stream');
const options = {audio: true, video: true};
navigator.mediaDevices
      .getUserMedia(options)
      .then(gotStream)
      .catch(function(e) {
        alert('getUserMedia() failed');
        console.log('getUserMedia() error: ', e);
      });

socket.on('user-disconnected', userId => {
  if (peers[userId]) 
  {
      peers[userId].close()
      console.log('User: ' + userId + ' disconnected' )
  }
})

myPeer.on('open', id => {
  socket.emit('join-room', ROOM_ID, id)
})

function connectToNewUser(userId, stream) {
  console.log('Connecting to new user')
  const call = myPeer.call(userId, stream)
  const video = document.createElement('video')
  call.on('stream', userVideoStream => {
    addVideoStream(video, userVideoStream)
  })
  call.on('close', () => {
    video.remove()
  })

  peers[userId] = call
}

function addVideoStream(video, stream) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    video.play()
    video.controls = 'controls'
  })
  videoGrid.append(video)
  console.log('Appended new decrypted video')
}

function addEncryptedVideoStream(video, stream) {
  video.srcObject = stream
  video.addEventListener('loadedmetadata', () => {
    video.play()
    video.muted = 'muted'
    video.controls = 'controls'
  })
  encryptedVideoGrid.append(video)
  console.log('Appended new encrypted video')

}


function setCryptoKey(event) {
  console.log('Setting crypto key to ' + cryptoKey.value);
  const currentCryptoKey = cryptoKey.value;
  const useCryptoOffset = !cryptoOffsetBox.checked;
  if (currentCryptoKey) {
    banner.innerText = 'Encryption is ON';
  } else {
    banner.innerText = 'Encryption is OFF';
  }
  worker.postMessage({
    operation: 'setCryptoKey',
    currentCryptoKey,
    useCryptoOffset,
  });
}

function start() {
  console.log('Requesting local stream');
  const options = {audio: true, video: true};
  navigator.mediaDevices
      .getUserMedia(options)
      .then(gotStream)
      .catch(function(e) {
        alert('getUserMedia() failed');
        console.log('getUserMedia() error: ', e);
      });
}

function gotStream(stream) {
  console.log('Received local stream');
  addVideoStream(myVideo, stream)
  plainLocalStream = stream;
  callButton.disabled = false;
  hangupButton.disabled = false;
  const myEncryptedVideo = document.createElement('video');
  startToMiddle = new VideoPipe(plainLocalStream, true,false, e => {
    // Doesn't setup the receiver transform.
    addEncryptedVideoStream(myEncryptedVideo, e.streams[0]);
  });
  myPeer.on('call', call => {
    peers[call.peer] = call;
    call.answer(myEncryptedVideo.srcObject);
    const receivedVideo = document.createElement('video');
    const decypheredVideo = document.createElement('video');

    call.on('stream', stream => {
      console.log('Received remote stream');
      addEncryptedVideoStream(receivedVideo, stream);
      addVideoStream(decypheredVideo, stream);
      //startToEnd = new VideoPipe(remoteUserVideoStream, true, true, e => {
        //setupReceiverTransform(e.receiver);
        //addVideoStream(decypheredVideo,cypheredLocalStream)
      //});
      //startToEnd.pc1.getSenders().forEach(setupSenderTransform);
      //startToEnd.negotiate();
      console.log('Decryption video pipe created');
      
    })
    call.on("close", () => {
        receivedVideo.remove();
        decypheredVideo.remove();
        console.log('Remote stream closed');
    })
  })

  socket.on('user-connected', userId => {
    connectToNewUser(userId,myEncryptedVideo.srcObject);
  })
  startToMiddle.pc1.getSenders().forEach(setupSenderTransform);
  startToMiddle.negotiate();
  console.log('Encryption video pipe created');
}

function hangup() {
  console.log('Ending call');
  //startToMiddle.close();
  //startToEnd.close();
  hangupButton.disabled = true;
  callButton.disabled = false;
  socket.emit('hangup', ROOM_ID, myPeer.id);
  myVideo.remove();
}

function setupSenderTransform(sender) {
  const senderStreams = sender.createEncodedStreams();
  // Instead of creating the transform stream here, we do a postMessage to the worker. The first
  // argument is an object defined by us, the sceond a list of variables that will be transferred to
  // the worker. See
  //   https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
  // If you want to do the operations on the main thread instead, comment out the code below.
  /*
  const transformStream = new TransformStream({
    transform: encodeFunction,
  });
  senderStreams.readableStream
      .pipeThrough(transformStream)
      .pipeTo(senderStreams.writableStream);
  */
  const readableStream = senderStreams.readable || senderStreams.readableStream;
  const writableStream = senderStreams.writable || senderStreams.writableStream;
  worker.postMessage({
    operation: 'encode',
    readableStream,
    writableStream,
  }, [readableStream, writableStream]);
}

function setupReceiverTransform(receiver) {
  const receiverStreams = receiver.createEncodedStreams();
  const readableStream = receiverStreams.readable || receiverStreams.readableStream;
  const writableStream = receiverStreams.writable || receiverStreams.writableStream;
  worker.postMessage({
    operation: 'decode',
    readableStream,
    writableStream,
  }, [readableStream, writableStream]);
}
