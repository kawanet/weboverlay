# weboverlay

Layered Hybrid Web Server: Local, Remote, and Transform

## SYNOPSIS

```sh
npm init
npm --save weboverlay
PATH=node_modules/.bin:$PATH

# overlay multiple local document roots
weboverlay ../repo1/htdocs ../repo2/htdocs ../repo3/htdocs

# overlay local files and upstream remote server contents with cache
weboverlay htdocs https://example.com --cache

# rewrite remote content with sed-style transform
weboverlay 's#/example.com/#/127.0.0.1:3000/#g' https://example.com --cache=cached --log=dev --json

# replace product names on a corporate website 
weboverlay "s/MacBook/Surface/g" https://www.apple.com --cache=cached --port=3000

open http://127.0.0.1:3000/
```

## SYNTAX

```sh
weboverlay [s/regexp/replacement/g] [^type=function] [htdocs...] [https://hostname] [--cache=cached] [--log=tiny] [--port=3000] [--auth=user:password]
```

- `s/regexp/replacement/g` - sed-style transform applied for every text contents.
- `@text/html=s=>s.toLowerCase()` - custom transform function for given content type.
- `htdocs` - path to local document root directory.
- `https://upstream.host` - URL to remote upstream server: `http://` or `https://`
- `--cache=cached` - path to directory to cache remote content (default: disabled)
- `--compress=br` - force compression with Brotli (default: auto)
- `--compress=identity` - no compression
- `--log=tiny` - morgan logging format: `combined`, `dev`, etc. (default: `tiny`)
- `--port=3000` - port number to listen. (default: `3000`)
- `--json` - prettify JSON (default: disabled)
- `--basic=user:password` - Basic authentication

## SEE ALSO

- https://www.npmjs.com/package/express-sed
- https://www.npmjs.com/package/express-tee
- https://www.npmjs.com/package/express-upstream
- https://www.npmjs.com/package/express-intercept

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
