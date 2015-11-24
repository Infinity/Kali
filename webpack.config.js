var webpack = require('webpack');

module.exports = {
  entry: [
    './src/Kali.ts'
  ],
  output: {
    filename: 'kali.js',
    path: 'build/'
  },
  resolve: {
    extensions: ['', '.ts']
  },
  module: {
    loaders: [
      { test: /\.ts$/, loader: 'ts-loader', exclude: /node_modules/ }
    ]
  }
};