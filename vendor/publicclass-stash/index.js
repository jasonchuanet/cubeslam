
module.exports = function createStash(){
  return new Stash();
}

module.exports.Stash = Stash;

function Stash(){
  this.values = [];
  this.lookup = {};   // [key] = index
  this.reverse = {};  // [index] = key
  this.length = 0;
}

Stash.prototype = {

  set: function(key,val){
    key = ''+key
    if( key in this.lookup ){
      console.warn('key "%s" already exists in stash. deleting it first.',key)
      this.del(key);
    }
    var index = this.values.length;
    this.lookup[key] = index;
    this.reverse[index] = key;
    this.values.push(val)
    this.length++;
    return this
  },

  has: function(key){
    return (''+key) in this.lookup;
  },

  get: function(key){
    key = ''+key
    if( key in this.lookup ){
      var index = this.lookup[key];
      return this.values[index];
    } else console.error('tried to get "%s" that didn\'t exist',key)
    return undefined;
  },

  del: function(key){
    key = ''+key
    if( key in this.lookup ){
      // move the last values into the
      // position of the deleted value
      // to keep the array dense (and
      // avoid unnecessary allocation)
      var index = this.lookup[key]
        , end = this.length-1;

      // special case if the deleted key is last value (no need to reorder stuff)
      if( index == end ){
        this.values.pop();
        delete this.reverse[index];
        delete this.lookup[key];
        this.length--;

      } else if( index >= 0 && index < end ){
        this.values[index] = this.values.pop();

        // update the lookups
        var rindex = this.values.length;
        var rkey = this.reverse[rindex];
        this.lookup[rkey] = index;
        this.reverse[index] = rkey;
        delete this.reverse[rindex];
        delete this.lookup[key];
        this.length--;
      } else console.warn('tried to delete "%s" with an invalid index %s',key,index)
    } else console.warn('tried to delete "%s" that didn\'t exist',key)
    return this;
  },

  empty: function(){
    this.values.length = 0
    this.length = 0
    for(var i in this.reverse){
      var k = this.reverse[i]
      delete this.lookup[k]
      delete this.reverse[i]
    }
    return this;
  }

}