
/**
 * Module dependencies.
 */
var median = require('median')
  , sd = require('standard-deviation');


/**
 * Calculates the latency from an `arr` of
 * times (each the result of `now - started`).
 *
 * Based on: http://www.gamedev.net/page/resources/_/technical/multiplayer-and-network-programming/clock-synchronization-of-client-programs-r2493
 *
 * @param {Array} arr
 * @return {Number}
 * @api public
 */
module.exports = function(arr){
  var std = sd(arr);
  var m = median(arr);
  var sum = 0;
  var n = 0;
  for (var i = 0; i < arr.length; ++i) {
    if( Math.abs(m - arr[i]) <= std ){
      sum += arr[i];
      n++;
    }
  }
  return sum / n;
}