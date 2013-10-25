var nconf = require('nconf');
var _ = require('lodash');
var http = require('http');
var express = require('express');
var cors = require('cors');
var Faye = require('faye');
var levelup = require('level');

/*
 * get config from file
 */
nconf.file({ file: 'config.json' });

var db = levelup(nconf.get('db').location, { keyEncoding: 'json', valueEncoding: 'json' });

/*
 * data
 */
var parties = {};

var loadParty = function(path){
  db.get(path, { asBuffer: false }, function(err, data){
    if(err) console.log(err);
    if(data){
      parties[path] = data;
    }
  }.bind(this));
};

var updateParty = function(path, message){
  var party = parties[path];
  var index = _.findIndex(party, function(profile){ return profile.uuid === message.uuid; });
  if(index >= 0){
    party[index] = message;
  } else {
    party.push(message);
  }
  db.put(path, party, function(err){ console.log(err); });
};

var saveListing = function(){
  db.put('parties', _.keys(parties), function(err){console.log(err); });
};

// initially load listing
db.get('parties', {asBuffer: false }, function(err, data){
  if(err) console.log(err);
  if(data){
    data.forEach(function(path){
      loadParty(path);
    });
  }
});

/*
 * Faye
 */

var notMeta = function(message){
  return !message.channel.match(/^\/meta\/.*/);
};

var storeMessages = {
  incoming: function(message, callback){
    if(notMeta(message)){

      if(nconf.get('debug')) console.log(message);

      var path = message.channel;
      if(!parties[path]){
        parties[path] = [];
        saveListing();
      }
      updateParty(path, message.data);
    }
    callback(message);
  }
};

var bayeux = new Faye.NodeAdapter({mount: '/bayeux'});
bayeux.addExtension(storeMessages);

/*
 * Express
 */

var app = express();
app.use(cors());

app.get('*', function(req, res) {
  var party = parties[req.params[0]] ? parties[req.params[0]] :  [];
  res.json(party);
});

/*
 * Express + Faye
 */
var server = http.createServer(app);
bayeux.attach(server);

var port = nconf.get('bayeux').port;
server.listen(port);

console.log('port: ', port);
console.log('db: ', db.location);
