# Folder structure

- `src` - source code for your kaplay project
- `www` - distribution folder, contains your index.html, built js bundle and static assets


## Development

```sh
$ yarn run dev
```

will start a dev server at http://localhost:8000

## Distribution

```sh
$ yarn run build
```

will build your js files into `www/main.js`

```sh
$ yarn run bundle
```

will build your game and package into a .zip file, you can upload to your server or itch.io / newground etc.