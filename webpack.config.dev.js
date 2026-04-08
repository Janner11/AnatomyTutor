const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
  ],
  devServer: {
    liveReload: true,
    hot: true,
    open: true,
    static: [
      { directory: require('path').resolve(__dirname, 'css'), publicPath: '/css' },
      { directory: require('path').resolve(__dirname, 'img'), publicPath: '/img' },
      { directory: require('path').resolve(__dirname, 'model'), publicPath: '/model' },
      { directory: require('path').resolve(__dirname, '.'), publicPath: '/' },
    ],
  },
});
