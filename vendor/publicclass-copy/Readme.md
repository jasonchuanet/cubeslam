
# copy

[![Build Status](https://travis-ci.org/publicclass/copy.png?branch=master)](https://travis-ci.org/publicclass/copy)

  Recursively copies the properties of an object to another.

  The difference between this and [clone](https://github.com/component/clone) is that this one will copy any changes from one object to another without creating a new object. And thus is useful in memory-sensitive cases.

## Example

    var obj = {
      a: 'b',
      c: [
        new Date(),
        'tobi',
        'jane'
      ]
    }
    var other = {
      a: 'a'
    }
    copy(obj,other)

    // other = {a: 'b', c: [...]}

## API

### copy(obj,to)

  Copies all properties from `obj` recursively into `to`.

## License

  MIT
