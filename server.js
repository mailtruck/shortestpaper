var app, express, http, httpProxy, instapaper, jquery, jsdom, process, queryString, redis, request, sys;
require('joose');
require('joosex-namespace-depended');
require('hash');
queryString = require('querystring');
http = require('http');
sys = require('sys');
httpProxy = require('./node-http-proxy');
jsdom = require('jsdom');
express = require('express');
redis = require('redis').createClient();
request = require('request');
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js';
instapaper = 'www.instapaper.com';
process = function() {
  return redis.lpop('download', function(error, reply) {
    var key, url;
    if (typeof reply !== "undefined" && reply !== null) {
      redis.llen('download', function(e, r) {
        return sys.puts("" + (r) + " URLs left");
      });
      url = reply.toString();
      key = Hash.sha1(url).slice(0, 9 + 1);
      return redis.get(key, function(error, reply) {
        if (!(typeof reply !== "undefined" && reply !== null)) {
          sys.puts("Analyzing " + (url));
          return request({
            uri: url
          }, function(error, resp, body) {
            setTimeout(process, 10000);
            return !(typeof error !== "undefined" && error !== null) ? jsdom.jQueryify(jsdom.jsdom(body).createWindow(), jquery, function(w, $) {
              var _i, _len, _ref, count, word, words;
              if (w.document.outerHTML.match(/Exceeded rate limit/)) {
                sys.puts("Retrying " + (url));
                return redis.rpush('download', url);
              } else {
                count = 0;
                words = $('#story').text().split(/\s+/);
                _ref = words;
                for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                  word = _ref[_i];
                  if (word.length > 2) {
                    count += 1;
                  }
                }
                return redis.set(key, count, function(e, r) {
                  return sys.puts("Counted and stored " + (url));
                });
              }
            }) : null;
          });
        } else {
          return setTimeout(process, 1000);
        }
      });
    } else {
      return setTimeout(process, 1000);
    }
  });
};
process();
httpProxy.createServer(function(req, res, proxy) {
  var buffer;
  req.headers['accept-encoding'] = '';
  buffer = '';
  return proxy.proxyRequest(80, instapaper, /text\/html/, function(chunk) {
    return buffer += chunk;
  }, function() {
    return jsdom.jQueryify(jsdom.jsdom(buffer).createWindow(), jquery, function(w, $) {
      var document, script;
      document = w.document;
      script = document.createElement('script');
      script.src = jquery;
      script.type = 'text/javascript';
      document.body.appendChild(script);
      script = document.createElement('script');
      script.src = '/sorting.js';
      script.type = 'text/javascript';
      document.body.appendChild(script);
      $('#bookmark_list > .tableViewCell').each(function(i, e) {
        var key, url;
        url = ("http://" + (instapaper) + ($('.textButton', e).attr('href')));
        key = Hash.sha1(url).slice(0, 9 + 1);
        $(e).attr('key', key);
        sys.puts("Found URL " + (url));
        return redis.get(key, function(error, reply) {
          if (!(typeof reply !== "undefined" && reply !== null)) {
            sys.puts("Queueing " + (url) + " for download");
            return redis.rpush('download', url);
          }
        });
      });
      return res.end(w.document.outerHTML.replace(/&amp;/g, '&'));
    });
  });
}).listen(8080);
app = express.createServer();
app.use(express.staticProvider(__dirname + '/public'));
app.get('/counts.json', function(req, res) {
  var params, query;
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8'
  });
  query = queryString.parse(req.url.split('?')[1]);
  params = query.keys.split(',');
  params.push(function(error, reply) {
    var _ref, counts, h, i;
    h = {};
    counts = reply.toString('utf8').split(',');
    _ref = counts.length;
    for (i = 0; (0 <= _ref ? i <= _ref : i >= _ref); (0 <= _ref ? i += 1 : i -= 1)) {
      h[params[i]] = parseInt(counts[i]);
    }
    return res.end("" + (query.callback) + "(" + (JSON.stringify(h)) + ");");
  });
  return redis.mget.apply(redis, params);
});
app.listen(8081);