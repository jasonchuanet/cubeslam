// Same-origin signaling with standard WebRTC. No hosted signaling or ICE defaults.
var Emitter = require("emitter");
exports.available =
  typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices;
exports.connect = function (opts) {
  return new Remote(opts);
};
function Remote(opts) {
  Emitter(this);
  this.channels = {};
  this.localStreams = [];
  this.remoteStreams = [];
  this.pendingCandidates = [];
  this.signal = { send: this.send.bind(this) };
  this.start(opts).catch(this.fail.bind(this));
}
Remote.prototype.fail = function (err) {
  this.emit("error", err);
};
Remote.prototype.start = async function (opts) {
  var response = await fetch("/api/config");
  if (!response.ok) throw new Error("Could not load WebRTC configuration");
  var config = await response.json();
  this.config = config;
  this.makeConnection();
  this.socket = new WebSocket(
    (location.protocol === "https:" ? "wss://" : "ws://") +
      location.host +
      "/signal?room=" +
      encodeURIComponent(opts.room),
  );
  this.socket.onopen = () => this.emit("open");
  this.socket.onerror = () =>
    this.fail(new Error("Signaling connection failed"));
  this.socket.onclose = () => this.disconnected();
  // Serialize signaling so candidates cannot overtake setRemoteDescription.
  var chain = Promise.resolve();
  this.socket.onmessage = (event) => {
    chain = chain
      .then(() => this.message(JSON.parse(event.data)))
      .catch(this.fail.bind(this));
  };
};
Remote.prototype.makeConnection = function () {
  var pc = (this.connection = new RTCPeerConnection(this.config));
  pc.getLocalStreams = () => this.localStreams;
  pc.getRemoteStreams = () => this.remoteStreams;
  pc.onicecandidate = (e) => {
    if (e.candidate) this.send({ type: "candidate", candidate: e.candidate });
  };
  pc.ontrack = (e) => {
    var stream = e.streams[0];
    if (stream && !this.remoteStreams.includes(stream)) {
      this.remoteStreams.push(stream);
      this.emit("addstream", { stream: stream });
    }
  };
  pc.ondatachannel = (e) => this.channel(e.channel);
  pc.onnegotiationneeded = () => {
    if (this.paired) this.negotiate().catch(this.fail.bind(this));
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed")
      this.fail(
        new Error(
          "Peer connection failed; configure a reachable TURN server for this network",
        ),
      );
  };
  this.localStreams.forEach((stream) =>
    stream.getTracks().forEach((track) => pc.addTrack(track, stream)),
  );
};
Remote.prototype.channel = function (channel) {
  this.channels[channel.label] = channel;
  channel.binaryType = "arraybuffer";
  channel.onopen = () => this.emit("channel " + channel.label + " open", {});
};
Remote.prototype.send = function (message) {
  if (this.socket && this.socket.readyState === WebSocket.OPEN)
    this.socket.send(JSON.stringify(message));
};
Remote.prototype.negotiate = async function () {
  if (
    !this.paired ||
    this.makingOffer ||
    this.connection.signalingState !== "stable"
  )
    return;
  try {
    this.makingOffer = true;
    await this.connection.setLocalDescription();
    this.send(this.connection.localDescription);
  } finally {
    this.makingOffer = false;
  }
};
Remote.prototype.message = async function (message) {
  var pc = this.connection;
  if (message.type === "connected") {
    this.initiator = message.initiator;
    this.paired = true;
    if (this.initiator)
      this.channel(
        pc.createDataChannel("game", { ordered: false, maxRetransmits: 0 }),
      );
    this.emit("connected", message);
    if (this.initiator) await this.negotiate();
  } else if (message.type === "offer" || message.type === "answer") {
    var collision =
      message.type === "offer" &&
      (this.makingOffer || pc.signalingState !== "stable");
    this.ignoreOffer = this.initiator && collision;
    if (this.ignoreOffer) return;
    await pc.setRemoteDescription(message);
    while (this.pendingCandidates.length)
      await pc.addIceCandidate(this.pendingCandidates.shift());
    if (message.type === "offer") {
      await pc.setLocalDescription();
      this.send(pc.localDescription);
    }
  } else if (message.type === "candidate") {
    if (this.ignoreOffer) return;
    if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
    else this.pendingCandidates.push(message.candidate);
  } else if (message.type === "disconnected") {
    this.disconnected();
  } else this.emit(message.type, message);
};
Remote.prototype.addStream = function (stream) {
  this.localStreams.push(stream);
  stream
    .getTracks()
    .forEach((track) => this.connection.addTrack(track, stream));
};
Remote.prototype.disconnected = function () {
  if (!this.paired) return;
  this.paired = false;
  this.connection.close();
  this.channels = {};
  this.remoteStreams = [];
  this.pendingCandidates = [];
  this.emit("removestream", {});
  this.makeConnection();
  this.emit("disconnected", {});
};
