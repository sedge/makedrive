module.exports = {

  getUserID: function( req ) {
    if ( !req.session ) {
      return null;
    }
    if ( !req.session.user ) {
      return null;
    }
    return req.session.user.id;
  },

  error: function( code, msg ) {
    var err = new Error( msg );
    err.status = code;
    return err;
  },

  toArrayBuffer: function(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; len = buffer.length; i < len; ++i) {
        view[i] = buffer[i];
    }
    return view;
  },

  toBuffer: function(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; len = buffer.length; i < len; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
  }

};
