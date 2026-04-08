const path = require('path');

module.exports = {
  entry: {
    app: './js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: './js/app.js',
    publicPath: '/',
  },
  module: {
    rules: [
      {
        test: /\.(glb|gltf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'model/[name][ext]',
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'img/[name][ext]',
        },
      },
    ],
  },
};
