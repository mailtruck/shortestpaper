var app, express, fs, http, instapaper, jquery, jsdom, proxy, queryString, redis, request, sys, url;
require('joose');
require('joosex-namespace-depended');
require('hash');
http = require('http');
sys = require('sys');
fs = require('fs');
url = require('url');
queryString = require('querystring');
proxy = require('./htmlfiltre');
jsdom = require('jsdom');
express = require('express');
redis = require('redis').createClient();
request = require('request');
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js';
instapaper = 'www.instapaper.com';
http.createServer(function(req, res) {
  sys.puts('proxy');
  return proxy.htmlFiltre(req, {
    foreignHost: instapaper,
    foreignHostPort: 80
  }, function(status, buffer, request, response, loc) {
    var headers;
    headers = response.headers;
    res.writeHead('200', headers);
    if (headers['content-type'].match(/text\/html/)) {
      sys.puts('jqueryify');
      return jsdom.jQueryify(jsdom.jsdom(buffer).createWindow(), jquery, function(w, $) {
        $('#bookmark_list > .tableViewCell').each(function(i, e) {
          var key, textHref;
          textHref = $('.textButton', e).attr('href');
          url = ("http://www.instapaper.com" + (textHref));
          key = Hash.md5(url);
          sys.puts('hget');
          return redis.hget(key, 'size', function(ehget, reply) {
            if (!(typeof reply !== "undefined" && reply !== null)) {
              sys.puts('request');
              return request({
                uri: url
              }, function(erequest, response, body) {
                sys.puts('jqueryify');
                return jsdom.jQueryify(jsdom.jsdom(body).createWindow(), jquery, function(tw, tj) {
                  var count;
                  count = 0;
                  tj.each(tj('#story').text().split(/\s+/), function(index, word) {
                    if (word.length > 2) {
                      return count++;
                    }
                  });
                  sys.puts('hmset');
                  return redis.hmset(key, 'size', count, 'url', url, function(ehmset, r) {
                    return (typeof ehmset !== "undefined" && ehmset !== null) ? sys.puts("ERROR: Storing info about " + (url) + " failed! " + (ehmset)) : sys.puts("Stored " + (url) + " with size " + (count));
                  });
                });
              });
            }
          });
        });
        return res.end(w.document.outerHTML.replace(/&amp;/g, '&'));
      });
    } else {
      return res.end(buffer);
    }
  }, function(loc) {
    res.writeHead('302', {
      location: loc
    });
    return res.end();
  });
}).listen(8080);
app = express.createServer();
app.get('/', function(req, res) {
  return res.send('Hello, World!');
});
app.listen(8081);