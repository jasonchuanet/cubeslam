# base64-arraybuffer

[![Build Status](https://travis-ci.org/publicclass/base64-arraybuffer.png?branch=master)](https://travis-ci.org/publicclass/base64-arraybuffer)

Encode/decode base64 data into ArrayBuffers.

This is a [component.js](https://github.com/component) port of Niklas von Hertzen's [original version on npm](https://github.com/niklasvh/base64-arraybuffer).

## Installation

    $ component install publicclass/base64-arraybuffer


## API

### base64.encode(buffer)

Encodes ArrayBuffer into a base64 string.

### base64.decode(string)

Decodes base64 string to ArrayBuffer.

## Example

    var base64 = require('base64-arraybuffer');

    var buf = new Uint8Array(4);
    buf[0] = 1;
    buf[1] = 2;
    buf[2] = 3;
    buf[3] = 4;
    base64.encode(buf)
    //= 'AQIDBA=='

    base64.decode('AQIDBA==')
    //= ArrayBuffer(4)


## License

  MIT
