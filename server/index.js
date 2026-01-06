const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
// Also load from local .env if exists
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());

// Proxy for T8Star API
app.use(
  '/api/t8star',
  createProxyMiddleware({
    target: 'https://ai.t8star.cn',
    changeOrigin: true,
    secure: false,
    pathRewrite: {
      '^/api/t8star': '',
    },
    onProxyReq: (proxyReq, req, res) => {
      // If we wanted to inject keys here, we could.
      // For now, we rely on the frontend sending the keys as before.
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).send('Proxy Error');
    }
  })
);

// Proxy for Polo API
app.use(
  '/api/polo',
  createProxyMiddleware({
    target: 'https://work.poloapi.com',
    changeOrigin: true,
    secure: false,
    pathRewrite: {
      '^/api/polo': '',
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).send('Proxy Error');
    }
  })
);

// Serve static files from the frontend build directory
// Assuming the frontend is built to ../dist
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Handle client-side routing, return all requests to index.html
app.get('*', (req, res) => {
    // Check if file exists, if not send index.html
    if (req.accepts('html')) {
        res.sendFile(path.join(distPath, 'index.html'), (err) => {
             if (err) {
                // If index.html doesn't exist (e.g. not built yet), send a message
                res.status(404).send('Frontend not built. Please run "npm run build" in the root directory.');
             }
        });
    } else {
        res.status(404).send('Not Found');
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
