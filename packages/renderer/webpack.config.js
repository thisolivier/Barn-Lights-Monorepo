import { dirname, resolve } from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { fileURLToPath } from 'url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
// Build paths used throughout the UI bundling process
const uiSourceDirectory = resolve(currentDirectory, 'src/ui');

export default {
  context: uiSourceDirectory,
  // main.js mounts the React app; layout-service.js handles layout fetching
  // and runtime helpers that were previously in main.mjs.
  entry: './main.js',
  output: {
    filename: 'bundle.js',
    path: resolve(uiSourceDirectory, 'dist'),
    publicPath: '/',
    clean: true
  },
  resolve: {
    extensions: ['.js']
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: resolve(uiSourceDirectory, 'index.html'),
      scriptLoading: 'blocking'
    })
  ]
};
