// The `require` entry, in a CommonJS file.
import render = require('@wick-charts/render');

void render.renderChart({ theme: 'dracula', series: [{ type: 'gauge', value: 42 }] });
