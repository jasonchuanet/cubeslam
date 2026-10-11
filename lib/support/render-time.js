// Visuals were authored at 60 FPS. Express their steps in elapsed time so
// rendering can follow the display without changing animation speed or physics.
var FRAME_TIME = 1000 / 60;

exports.delta = function (ms) {
  return ms == null ? FRAME_TIME : Math.max(0, Math.min(ms, 100));
};

exports.scale = function (ms) {
  return exports.delta(ms) / FRAME_TIME;
};

exports.ease = function (amount, ms) {
  return 1 - Math.pow(1 - amount, exports.scale(ms));
};
