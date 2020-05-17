# weboverlay

Layered Hybrid Web Server: Local, Remote, and Transform

[![Node.js CI](https://github.com/kawanet/weboverlay/workflows/Node.js%20CI/badge.svg?branch=master)](https://github.com/kawanet/weboverlay/actions/)
[![npm version](https://badge.fury.io/js/weboverlay.svg)](https://www.npmjs.com/package/weboverlay)

## SYNOPSIS

```sh
# install
npm install -g weboverlay

# overlay multiple local document root paths
weboverlay ../repo1/htdocs ../repo2/htdocs ../repo3/htdocs

# overlay local files and upstream remote origin server contents with cache
weboverlay htdocs https://example.com --cache

# rewrite remote content with sed-style transform
weboverlay 's#/example.com/#/127.0.0.1:3000/#g' https://example.com --cache=cached --log=dev --json

# replace product names on a corporate website 
weboverlay "s/MacBook/Surface/g" https://www.apple.com --cache=cached --port=3000

# open browser
open http://127.0.0.1:3000/
```

## CLI

```sh
weboverlay [s/regexp/replacement/g] [@type=function] [htdocs...] [https://hostname] [--options...]
```

- `s/regexp/replacement/g` - `sed`-style transforms applied for every text contents
- `@text/html=s=>s.toLowerCase()` - custom transform function for given content type
- `/path/to/not/found=404` - path to always respond 404 Not Found
- `htdocs` - path to local document root directory
- `https://upstream.host` - URL to remote upstream origin server: `http://` or `https://`
- `--basic=user:password` - username and password for basic authentication
- `--cache=cached` - path to directory to cache remote content (default: disabled)
- `--compress=br` - force compression with Brotli
- `--compress=identity` - no compression
- `--config=weboverlay.yml` - path to load configuration in YAML
- `--json` - prettify JSON response (default: disabled)
- `--log=tiny` - morgan access log format: `combined`, `dev`, etc. (default: `tiny`)
- `--logfile=weboverlay.log` - path to write log (default: STDOUT)
- `--port=3000` - port number to listen (default: `3000`)
- `--sed="s/regexp/replacement/g"` - another way to apply `sed`-style transform

## YAML

```yaml
# content source layers: Local, Remote, and Transform
layers:
    - s/regexp/replacement/g
    - @text/html=s=>s.toLowerCase()
    - /path/to/not/found=404
    - htdocs
    - https://upstream.host

# username and password for basic authentication
basic:
    - user:password

# path to directory to cache remote content (default: disabled)
cache: cached

# no compression
compress: identity

# prettify JSON response (default: disabled)
json: true

# morgan access log format: `combined`, `dev`, etc. (default: `tiny`)
log: tiny

# path to write log (default: STDOUT)
logfile: weboverlay.log

# port number to listen (default: `3000`)
port: 3000

# another way to apply `sed`-style transforms
sed: |
    s/regexp/replacement/g
```

## API

See TypeScript declaration
[weboverlay.d.ts](https://github.com/kawanet/weboverlay/blob/master/types/weboverlay.d.ts)
for more detail.

## SEE ALSO

- https://github.com/kawanet/express-compress
- https://github.com/kawanet/express-intercept
- https://github.com/kawanet/express-sed
- https://github.com/kawanet/express-tee
- https://github.com/kawanet/express-upstream
- https://github.com/kawanet/weboverlay

## LICENSE

The MIT License (MIT)

Copyright (c) 2020 Yusuke Kawasaki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
