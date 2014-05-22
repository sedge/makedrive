// XXXhumph: NOTE that the code below is basically pseudo-code atm.
// We have to figure out how to deal with binary vs. json data,
// file uploads, etc.

module.exports = function( knoxClient ) {

  var version = require( "../package" ).version;
  var S3Provider = require("filer-s3");
  var mime = require("mime");
  var https = require('https'); // this is for "put" it doesn't work with http as I don't have the logic for that
  var S3Options = { bucket: "<bucket_name>", key: "<key>", secret: "<secret>" };
  var util = require("./util");

  function jsonError( res, code, msg, err ) {
    res.json( code, {
      msg: msg,
      err: err
    });
  }

  return {

    index: function( req, res ) {
      res.send( "MakeDrive: https://wiki.mozilla.org/Webmaker/MakeDrive" );
    },

    // just using it to clear stuff right now
    clear: function(req, res) {
      var provider = new S3Provider({name: req.session.user.username, keyPrefix: req.session.user.username });;
      provider.open(S3Options, function(error, firstAccess) {
        if (error) {
            throw error;
          }
        var context = provider.getReadWriteContext();
        context.clear(function(error) {
          if (error) {
            throw error;
          }
          res.end();
        });
      });
    },
    // putting some stuff to test with get() method
    put: function(req, res) {
      var pathToUrl = req.query.url;
      var provider = new S3Provider({name: req.session.user.username, keyPrefix: req.session.user.username });;
      provider.open(S3Options, function(error, firstAccess) {
        if (error) {
          throw error;
        }
        var context = provider.getReadWriteContext();
        https.get(pathToUrl, function(response) {
          var chunks = [];
          response.on('data', function (chunk) {
            chunks = chunks.concat(chunk);
          }).on('end', function () {
            var newBuffer = new Buffer.concat(chunks);
            value = util.toArrayBuffer(newBuffer);
            context.put(pathToUrl, value, function(error) {
              if(error) {
                console.log(error);
              }
              res.end();
            });
          });
        });
      });
    },
    get: function(req, res) {
      var pathToFile = req.query.file;
      var provider = new S3Provider({name: req.session.user.username, keyPrefix: req.session.user.username });;
      provider.open(S3Options, function(error, firstAccess) {
        if (error) {
          throw error;
        }
        var context = provider.getReadWriteContext();
        context.get(pathToFile, function(error, result) {
          if(error) {
            res.writeHead(404, "Not found", {'Content-Type': 'text/html'});
            res.write(error);
          } else {
            var val = util.toBuffer(result);
            res.writeHead(200, "OK", {'Content-Type': mime.lookup(pathToFile)});
            res.write(val);
          }
          return res.end();
        });
      });
    },

    healthcheck: function( req, res ) {
      res.json({
        http: "okay",
        version: version
      });
    }

    // TODO: do we want clear?

  };
};
