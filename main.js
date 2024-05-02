import './style.css'

import { initializeApp } from "firebase/app";

import { getFirestore, collection,doc,setDoc, onSnapshot, addDoc, getDoc } from 'firebase/firestore';

// import firebase from 'firebase/app';
// import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAfHERdS3OnRbRoaooMhOHe7tdAL_LtgE4",
  authDomain: "vkycwebrtc.firebaseapp.com",
  projectId: "vkycwebrtc",
  storageBucket: "vkycwebrtc.appspot.com",
  messagingSenderId: "444806174817",
  appId: "1:444806174817:web:0ad8a225d0ddf33847b220",
  measurementId: "G-77EM4JDLYH"
};


// Initialize Firebase

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// const firestore = firebase.firestore();
// const analytics = getAnalytics(app);

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
//   const callDoc = await getDocs(collection(db,'calls')); // .doc();
//   callDoc.forEach((doc) => {
//     // doc.data() is the data of each document
//     console.log(doc.id, " => ", doc.data());
// });
const callsCollection = collection(db, 'calls');
  const callDoc = doc(callsCollection);
  const offerCandidates = collection(callDoc, 'offerCandidates');
  // const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = collection(callDoc, 'answerCandidates')// callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && addDoc(offerCandidates, event.candidate.toJSON());// offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  await setDoc(callDoc, offer);
  // Listen for remote answer
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  // const callDoc = collection('calls').doc(callId);
  // const callDoc = await getDocs(collection(db,'calls')); // .doc();
  const callsCollection = collection(db, 'calls');
  const callDoc = doc(callsCollection, callId);

  const answerCandidates = collection(callDoc, 'answerCandidates'); //callDoc.collection('answerCandidates');
  const offerCandidates = collection(callDoc, 'offerCandidates'); //callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await getDoc(callDoc)).data();//(await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
