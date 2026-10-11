
/**
 * Return the median of the numbers in `arr`.
 *
 * @param {Array} arr
 * @return {Number}
 * @api public
 */

module.exports = function(arr){
  var n = arr.length;
  if( n % 2 == 0 ){
    return arr[n/2];
  } else {
    var l = Math.floor(n/2)
    return (arr[l] + arr[l+1]) / 2;
  }
}