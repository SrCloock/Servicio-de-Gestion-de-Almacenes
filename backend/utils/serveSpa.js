const express = require('express');
const fs = require('fs');
const path = require('path');

module.exports = function serveSpa(app, { distPath }) {
  if (!fs.existsSync(distPath)) {
    console.warn(`[SPA] Build no encontrada en ${distPath}. Se omite express.static hasta generar frontend/dist.`);
    return;
  }

  app.use(express.static(distPath));
  app.use((req, res, next) => {
    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    const isStaticAsset = path.extname(req.path) !== '';
    const isApiRequest = !!req.headers.usuario || !!req.headers.codigoempresa;

    if (req.method !== 'GET' || !acceptsHtml || isStaticAsset || isApiRequest) {
      return next();
    }

    return res.sendFile(path.join(distPath, 'index.html'));
  });
};
