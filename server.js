var Redis, Url, assert, downloadClient, fs, http, httpProxy, instapaper, jquery, jsdom, mainClient, pageProcessor, processDownloads, processorClient, queryString, request, sha1, shortestpaperScript, sys;
require('joose');
require('joosex-namespace-depended');
require('hash');
fs = require('fs');
assert = require('assert');
queryString = require('querystring');
http = require('http');
sys = require('sys');
Url = require('url');
httpProxy = require('./node-http-proxy');
jsdom = require('jsdom');
Redis = require('redis');
request = require('request');
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js';
sha1 = 'http://crypto-js.googlecode.com/files/2.0.0-crypto-sha1.js';
instapaper = 'www.instapaper.com';
shortestpaperScript = fs.readFileSync('shortestpaper.js', 'utf8');
downloadClient = Redis.createClient();
processDownloads = function() {
  return downloadClient.lpop('download', function(error, reply) {
    var key, url;
    if (typeof reply !== "undefined" && reply !== null) {
      downloadClient.llen('download', function(e, r) {
        return sys.puts("" + (r) + " URLs left");
      });
      url = reply.toString();
      key = Hash.sha1(url).slice(0, 9 + 1);
      return downloadClient.get(key, function(error, reply) {
        var uri;
        if (!(typeof reply !== "undefined" && reply !== null)) {
          sys.puts("Analyzing " + (url));
          uri = ("http://" + (instapaper) + "/text?u=" + (escape(url)));
          return request({
            uri: uri
          }, function(error, resp, body) {
            setTimeout(processDownloads, 5000);
            return !(typeof error !== "undefined" && error !== null) ? jsdom.jQueryify(jsdom.jsdom(body, jsdom.defaultLevel, {
              url: uri
            }).createWindow(), jquery, function(w, $) {
              var _i, _len, _ref, count, word, words;
              if (w.document.outerHTML.match(/Exceeded rate limit/)) {
                sys.puts("Retrying " + (url));
                return downloadClient.rpush('download', url);
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
                return downloadClient.set(key, count, function(e, r) {
                  return sys.puts("Counted and stored " + (url));
                });
              }
            }) : null;
          });
        } else {
          return setTimeout(processDownloads, 500);
        }
      });
    } else {
      return setTimeout(processDownloads, 500);
    }
  });
};
processDownloads();
processorClient = Redis.createClient();
pageProcessor = Redis.createClient();
pageProcessor.on('message', function(channel, message) {
  message = JSON.parse(message);
  return jsdom.jQueryify(jsdom.jsdom(message.buffer, jsdom.defaultLevel, {
    url: message.url
  }).createWindow(), jquery, function(window, $) {
    var document;
    document = window.document;
    return $('#bookmark_list .tableViewCellTitleLink').each(function(i, e) {
      var key, url;
      url = this.href;
      sys.puts(url);
      key = Hash.sha1(url).slice(0, 9 + 1);
      sys.puts("Found URL " + (url));
      return processorClient.get(key, function(error, reply) {
        if (!(typeof reply !== "undefined" && reply !== null)) {
          sys.puts("Queueing " + (url) + " for download");
          return processorClient.rpush('download', url);
        }
      });
    });
  });
});
pageProcessor.subscribe('processing');
mainClient = Redis.createClient();
httpProxy.createServer(function(req, res, proxy) {
  var buffer, gzip, params, query, url;
  url = Url.parse(req.url);
  switch (url.pathname) {
    case '/counts.json':
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      query = queryString.parse(url.query);
      params = query.keys.split(',');
      params.push(function(error, reply) {
        var _ref, counts, h, i;
        counts = reply.toString('utf8').split(',');
        h = {};
        _ref = counts.length;
        for (i = 0; (0 <= _ref ? i <= _ref : i >= _ref); (0 <= _ref ? i += 1 : i -= 1)) {
          h[params[i]] = parseInt(counts[i]);
        }
        return res.end(JSON.stringify(h));
      });
      return mainClient.mget.apply(mainClient, params);
    case '/shortestpaper.js':
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Length': shortestpaperScript.length
      });
      return res.end(shortestpaperScript);
    default:
      gzip = !!url.pathname.match(/\.(js(on)?|js|jpe?g|png|gif|css)$/);
      if (!(gzip)) {
        req.headers['accept-encoding'] = '';
      }
      buffer = '';
      return proxy.proxyRequest(80, instapaper, /text\/html/, function(chunk) {
        chunk = chunk.toString('utf8');
        buffer += chunk;
        return res.write(chunk.replace(/<\/body>\s*<\/html>/, "<script type='text/javascript' src='" + (jquery) + "'></script>\n<script type='text/javascript' src='/shortestpaper.js'></script>\n</body>\n</html>"));
      }, function() {
        assert.equal(gzip, false);
        res.end();
        return mainClient.publish('processing', JSON.stringify({
          buffer: buffer,
          url: ("http://" + (instapaper) + (req.url))
        }));
      });
  }
}).listen(process.ARGV[2] || 8080);