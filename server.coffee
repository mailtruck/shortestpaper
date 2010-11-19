# https://github.com/billywhizz/node-httpclient

require('joose')
require('joosex-namespace-depended')
require('hash')
http = require('http')
sys = require('sys')
fs = require('fs')
url = require('url')
queryString = require('querystring')
proxy = require('./htmlfiltre')
jsdom = require('jsdom')
express = require('express')
redis = require('redis').createClient()
request = require('request')
jquery = 'https://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js'
instapaper = 'www.instapaper.com'

http.createServer((req, res) ->
  sys.puts('proxy')
  proxy.htmlFiltre(req, { foreignHost: instapaper, foreignHostPort: 80 }, ((status, buffer, request, response, loc) ->
    headers = response.headers
    res.writeHead('200', headers)

    if headers['content-type'].match(/text\/html/)
      sys.puts('jqueryify')
      jsdom.jQueryify jsdom.jsdom(buffer).createWindow(), jquery, (w, $) ->
        $('#bookmark_list > .tableViewCell').each (i, e) ->
          textHref = $('.textButton', e).attr('href')
          url = "http://www.instapaper.com#{textHref}"
          key = Hash.md5(url)
          sys.puts('hget')
          redis.hget key, 'size', (ehget, reply) ->
            unless reply?
              sys.puts('request')
              request { uri: url }, (erequest, response, body) ->
                sys.puts('jqueryify')
                jsdom.jQueryify jsdom.jsdom(body).createWindow(), jquery, (tw, tj) ->
                  # Count the number of words in the #story element.
                  count = 0
                  tj.each tj('#story').text().split(/\s+/), (index, word) ->
                    # Only include words > 2 characters
                    count++ if word.length > 2
                  sys.puts('hmset')
                  redis.hmset key, 'size', count, 'url', url, (ehmset, r) ->
                    if ehmset?
                      sys.puts("ERROR: Storing info about #{url} failed! #{ehmset}")
                    else
                      sys.puts("Stored #{url} with size #{count}")

        # OMG replace hacks!!
        res.end(w.document.outerHTML.replace(/&amp;/g, '&'))
    else
      res.end(buffer)
  ), ((loc) ->
    res.writeHead('302', { location: loc })
    res.end()
  ))
).listen(8080)

app = express.createServer()
app.get '/', (req, res) ->
  res.send('Hello, World!')

app.listen(8081)