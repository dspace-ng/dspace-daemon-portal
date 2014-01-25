var _ = require('lodash');
var http = require('http');
var express = require('express');
var cors = require('cors');
var Faye = require('faye');
var levelup = require('levelup');
var memdown = require('memdown');
var port = process.argv[2] || 5000;

var db = levelup('ignored', {
  db: memdown,
  keyEncoding: 'json',
  valueEncoding: 'json'
});

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

server.listen(port);

console.log('daemon started on port: ', port);
