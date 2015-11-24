var webpack = require('webpack');

module.exports = {
  entry: [
    './examples/Test.ts',
  ],
  output: {
    filename: 'test.js',
    path: 'build/examples/'
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