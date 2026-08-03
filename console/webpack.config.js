const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProd ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      clean: true,
    },
    devtool: isProd ? false : 'source-map',
    resolve: {
      // `.mjs` là BẮT BUỘC: module thuần được test bằng `node --test` phải là ESM thật,
      // mà package.json không có "type":"module" nên `.js` bị Node coi là CJS.
      extensions: ['.js', '.mjs'],
      alias: {
        '@core': path.resolve(__dirname, 'src/core'),
        '@panels': path.resolve(__dirname, 'src/panels'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@terminal': path.resolve(__dirname, 'src/terminal'),
      },
    },
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        {
          // Icon lucide vào bundle dưới dạng STRING SVG → dán thẳng vào HTML string
          // mà panel đang render (không cần <img>, không request thêm).
          test: /\.svg$/i,
          type: 'asset/source',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        filename: 'index.html',
        minify: isProd && { collapseWhitespace: true, removeComments: true },
      }),
      new MiniCssExtractPlugin({
        filename: isProd ? 'css/[name].[contenthash:8].css' : 'css/[name].css',
      }),
    ],
    performance: { hints: false },
    stats: 'minimal',
  };
};
