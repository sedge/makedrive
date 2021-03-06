/**
 * MakeDrive is a single/shared Filer filesystem instance with
 * manual- and auto-sync'ing features. A client first gets the
 * filesystem instance like so:
 *
 * var fs = MakeDrive.fs();
 *
 * Multiple calls to MakeDrive.fs() will return the same instance.
 * Various bits of Filer are available on MakeDrive, including:
 *
 * - MakeDrive.Buffer
 * - MakeDrive.Path
 * - MakeDrive.Errors
 *
 * The filesystem instance returned by MakeDrive.fs() also includes
 * a new property `sync`.  The fs.sync property is an EventEmitter
 * which emits the following events:
 *
 * - 'error': an error occured while connecting/syncing. The error
 * object is passed as the first arg to the event.
 *
 * - 'connected': a connection was established with the sync server
 *
 * - 'disconnected': the connection to the sync server was lost, either
 * due to the client or server.
 *
 * - 'syncing': a sync with the server has begun. A subsequent 'completed'
 * or 'error' event should follow at some point, indicating whether
 * or not the sync was successful.
 *
 * - 'completed': a sync has completed and was successful.
 *
 *
 * The `sync` property also exposes a number of methods, including:
 *
 * - connect(url): try to connet to the specified sync server URL.
 * An 'error' or 'connected' event will follow, depending on success.
 *
 * - disconnect(): disconnect from the sync server.
 *
 * - request(path): request a sync with the server for the specified
 * path. Such requests may or may not be processed right away.
 *
 *
 * Finally, the `sync` propery also exposes a `state`, which is the
 * current sync state and can be one of:
 *
 * sync.SYNC_DISCONNECTED = 0 (also the initial state)
 * sync.SYNC_CONNECTING = 1
 * sync.SYNC_CONNECTED = 2
 * sync.SYNC_SYNCING = 3
 * sync.SYNC_ERROR = 4
 */

var MakeDriveSync = require('./sync');
var Filer = require('filer');
var EventEmitter = require('events').EventEmitter;

var MakeDrive = {};
module.exports = MakeDrive;

// We manage a single fs instance internally. NOTE: that other
// tabs/windows may also be using this same instance (i.e., fs
// is shared at the provider level).
var _fs;

function createFS() {
  _fs = new Filer.FileSystem({
    name: 'makedrive',
    provider: new Filer.FileSystem.providers.Fallback('makedrive')
  });

  var sync = _fs.sync = new EventEmitter();

  // Auto-sync handles
  var watcher;
  var syncInterval;
  var needsSync = false;

  // State of the sync connection
  sync.SYNC_DISCONNECTED = 0;
  sync.SYNC_CONNECTING = 1;
  sync.SYNC_CONNECTED = 2;
  sync.SYNC_SYNCING = 3;
  sync.SYNC_ERROR = 4;

  // Intitially we are not connected
  sync.state = sync.SYNC_DISCONNECTED;

  // Request that a sync begin for the specified path (optional).
  sync.request = function(path) {
    // If we're not connected (or are already syncing), ignore this request
    if(sync.state !== sync.SYNC_CONNECTED) {
      // TODO: should we throw/warn as well?
      //       https://github.com/mozilla/makedrive/issues/20
      return;
    }

    // Make sure the path exists, otherwise use root dir
    _fs.exists(path, function(exists) {
      path = exists ? path : '/';

      // Try to sync path
      sync.state = sync.SYNC_SYNCING;
      sync.emit('syncing');

      MakeDriveSync.sync(path, function(err) {
        // If nothing else has touched the state since we started,
        // downgrade connection state back to just `connected`
        if(sync.state === sync.SYNC_SYNCING) {
          sync.state = sync.SYNC_CONNECTED;
        }

        if(err) {
          sync.emit('error', err);
        } else {
          needsSync = false;
          // TODO: can we send the paths/files that were sync'ed too?
          //       https://github.com/mozilla/makedrive/issues/20
          sync.emit('completed');
        }
      });
    });
  };

  // Try to connect to the server.
  sync.connect = function(url, token) {
    // Bail if we're already connected
    if(sync.state !== sync.SYNC_DISCONNECTED &&
       sync.state !== sync.ERROR) {
      // TODO: should we throw/warn as well?
      //       https://github.com/mozilla/makedrive/issues/20
      return;
    }

    // Upgrade connection state to `connecting`
    sync.state = sync.SYNC_CONNECTING;

    // Try to connect to provided server URL
    MakeDriveSync.init(url, token, sync, _fs, function(err) {
      if(err) {
        sync.state = sync.SYNC_ERROR;
        sync.emit('error', err);
        return;
      }

      // Upgrade connection state to 'connected'
      sync.state = sync.SYNC_CONNECTED;
      sync.emit('connected');

      // Start auto-sync'ing fs based on changes every 1 min.
      // TODO: provide more options to control what/when we auto-sync
      //       https://github.com/mozilla/makedrive/issues/20
      watcher = _fs.watch('/', {recursive: true}, function(event, filename) {
        // Mark the fs as dirty, and we'll sync on next interval
        needsSync = true;

        // Also try to start a sync now, which might fail if we're already syncing.
        sync.request('/');
      });

      syncInterval = setInterval(function() {
        if(needsSync) {
          sync.request('/');
          needsSync = false;
        }
      }, 60 * 1000);
    });
  };

  // Disconnect from the server
  sync.disconnect = function() {
    // Bail if we're not already connected
    if(sync.state === sync.SYNC_DISCONNECTED ||
       sync.state === sync.ERROR) {
      // TODO: should we throw/warn as well?
      //       https://github.com/mozilla/makedrive/issues/20
      return;
    }

    // Stop watching for fs changes, stop auto-sync'ing
    if(watcher) {
      watcher.close();
      watcher = null;
    }
    if(syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }

    sync.state = sync.SYNC_DISCONNECTED;
    sync.emit('disconnected');
  };
}

// Manage single instance of a Filer filesystem with auto-sync'ing
MakeDrive.fs = function() {
  if(!_fs) {
    createFS();
  }

  return _fs;
};

// Expose bits of Filer that clients will need on MakeDrive
MakeDrive.Buffer = Filer.Buffer;
MakeDrive.Path = Filer.Path;
MakeDrive.Errors = Filer.Errors;
