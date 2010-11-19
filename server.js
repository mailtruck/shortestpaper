// https://github.com/billywhizz/node-httpclient

var http = require('http'),
    sys = require('sys'),
    fs = require('fs'),
    url = require('url'),
    queryString = require('querystring'),
    proxy = require('./htmlfiltre'),
    jsdom = require('jsdom'),
    jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js';

http.createServer(function(req, res) {
  proxy.htmlFiltre(req, { foreignHost: 'www.instapaper.com', foreignHostPort: 80 }, function (status, buffer, request, response, loc) {
    var headers = response.headers;
    res.writeHead('200', headers);

    if (headers['content-type'].match(/text\/html/)) {
      jsdom.jQueryify(jsdom.jsdom(buffer).createWindow(), jquery, function(w, $) {
        $('#bookmark_list > .tableViewCell').each(function(i, e) {
          var textHref = $('.textButton', e).attr('href');
          // Do some redis magic
        });
        // OMG replace hacks!!
        res.end(w.document.outerHTML.replace(/&amp;/g, '&'));
      });
    } else {
      res.end(buffer);
    }
  }, function(loc) {
    res.writeHead('302', { location: loc });
    res.end();
  });
}).listen(8080);