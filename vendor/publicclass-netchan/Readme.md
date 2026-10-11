
# netchan

[![Build Status](https://travis-ci.org/publicclass/netchan.png?branch=master)](https://travis-ci.org/publicclass/netchan)

  A NetChan implementation wrapping an unreliable DataChannel.

  It encodes binary messages (either a `TypedArray` or an `ArrayBuffer`) and adds a sequence to it to make sure they will be delivered.

## Installation

    $ component install publicclass/netchan

## API

### new NetChannel(channel)

  Create a NetChannel instance. Pass in the `DataChannel` instance that will send the encoded messages.

### NetChannel#onmessage(msg)

  A callback which will be called with any new decoded message received from the `DataChannel`.

### NetChannel#send(msg)

  Adds a `msg` to the buffer which is encoded and then sent over the `DataChannel`.

## Example

    var pc = new PeerConnection(null)
    var channel = pc.createDataChannel('netchan',{reliable: false})
    var netchan = new NetChannel(channel);

    var buf = new ArrayBuffer(4)
      , dat = new DataView(buf);
    dat.setUint8(0,1)
    dat.setUint8(1,2)
    dat.setUint8(2,3)
    dat.setUint8(3,4)

    netchan.onmessage = function(msg){
      var dat = new DataView(msg);
      dat.getUInt8(0) // 1
      dat.getUInt8(1) // 2
      dat.getUInt8(2) // 3
      dat.getUInt8(3) // 4
    }

    // only binary supported by NetChannel
    netchan.send(buf);


## Testing

  Because Node 0.8 lacks ArrayBuffer#slice it must be ran with Node 0.9.4+ but it will fail on 0.9.7 because of [a regression](https://github.com/joyent/node/issues/4626).

  To unit test simply run:

    $ make

  To run a simple DataChannel test in your browser open `dc.html`. It uses a base64 wrapper to bypass the current lack of binary support in DataChannel so you'll be required to build a dev version first.

    $ component install --dev
    $ component build --dev
    $ open dc.html

## License

  MIT
