'use strict';

const path = require('path');
const fs = require('fs');

// Resolve rider HTML path: prefer React build, fallback to vanilla
const riderBuildPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
const riderLegacyPath = path.join(__dirname, '..', 'public', 'rider-legacy.html');
const riderHtmlPath = fs.existsSync(riderBuildPath) ? riderBuildPath : riderLegacyPath;

// Resolve driver HTML path: prefer React build, fallback to vanilla
const driverBuildPath = path.join(__dirname, '..', 'client', 'dist', 'driver.html');
const driverLegacyPath = path.join(__dirname, '..', 'public', 'driver-legacy.html');
const driverHtmlPath = fs.existsSync(driverBuildPath) ? driverBuildPath : driverLegacyPath;

// Resolve office HTML path: prefer React build, fallback to vanilla
const officeBuildPath = path.join(__dirname, '..', 'client', 'dist', 'office.html');
const officeLegacyPath = path.join(__dirname, '..', 'public', 'index-legacy.html');
const officeHtmlPath = fs.existsSync(officeBuildPath) ? officeBuildPath : officeLegacyPath;

module.exports = function(app, ctx) {
  const {
    requireAuth,
    requireOffice,
    requireStaff,
    requireRider,
    VALID_ORG_SLUGS,
    DEMO_MODE
  } = ctx;

  // ----- React app static assets (rider + driver) -----
  const reactDistPath = path.join(__dirname, '..', 'client', 'dist');
  app.use('/app', require('express').static(reactDistPath, { maxAge: '1y', immutable: true }));
  // Backward-compat alias for /rider-app
  app.use('/rider-app', require('express').static(reactDistPath, { maxAge: '1y', immutable: true }));

  // ----- Org-scoped routes (must come before generic page routes) -----
  VALID_ORG_SLUGS.forEach(slug => {
    // Main org route — login page (unauthenticated) or dashboard (authenticated)
    app.get('/' + slug, (req, res) => {
      req.session.campus = slug;
      if (req.session.userId) {
        if (req.session.role === 'driver') return res.redirect('/' + slug + '/driver');
        if (req.session.role === 'rider') return res.redirect('/' + slug + '/rider');
        return res.sendFile(officeHtmlPath);
      }
      res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    });

    // Driver view
    app.get('/' + slug + '/driver', requireAuth, (req, res) => {
      req.session.campus = slug;
      res.sendFile(driverHtmlPath);
    });

    // Rider view
    app.get('/' + slug + '/rider', requireAuth, (req, res) => {
      req.session.campus = slug;
      res.sendFile(riderHtmlPath);
    });

    // Campus-scoped login
    app.get('/' + slug + '/login', (req, res) => {
      req.session.campus = slug;
      res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
    });

    // Signup
    app.get('/' + slug + '/signup', (req, res) => {
      req.session.campus = slug;
      res.sendFile(path.join(__dirname, '..', 'public', 'signup.html'));
    });
  });

  // ----- Pages -----
  app.get('/login', (req, res) => {
    // Clear campus from session so bare /login shows neutral branding
    delete req.session.campus;
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
  });

  app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'signup.html'));
  });

  app.get('/', requireAuth, (req, res) => {
    if (req.session.role === 'office') {
      res.sendFile(officeHtmlPath);
    } else if (req.session.role === 'driver') {
      res.redirect('/driver');
    } else {
      res.redirect('/rider');
    }
  });

  app.get('/office', requireOffice, (req, res) => {
    res.sendFile(officeHtmlPath);
  });

  app.get('/driver', requireStaff, (req, res) => {
    res.sendFile(driverHtmlPath);
  });

  app.get('/rider', requireRider, (req, res) => {
    res.sendFile(riderHtmlPath);
  });

  // Demo mode routes (before static middleware)
  if (DEMO_MODE) {
    app.get('/login', (req, res) => res.redirect('/demo.html'));
    app.get('/login.html', (req, res) => res.redirect('/demo.html'));
    app.get('/', (req, res, next) => {
      if (!req.session.userId) return res.redirect('/demo.html');
      next();
    });
  }

  app.get('/demo-config.js', (req, res) => {
    res.type('application/javascript');
    if (!DEMO_MODE) return res.send('');
    res.send(`
    (function() {
      if (window.location.pathname.indexOf('demo') !== -1) return;
      var _pParts = window.location.pathname.split('/').filter(Boolean);
      var _orgSlugs = ['usc', 'stanford', 'ucla', 'uci'];
      if (_pParts.length > 0 && _orgSlugs.indexOf(_pParts[0]) !== -1) return;

      var s = document.createElement('style');
      s.textContent = 'body { padding-top: 32px !important; } .driver-header { top: 32px !important; } .rider-header { top: 32px !important; } .ro-sidebar { top: 32px !important; } .ro-header { top: 32px !important; }';
      document.head.appendChild(s);

      window.addEventListener('DOMContentLoaded', function() {
        var pathname = window.location.pathname;
        var role = 'Office Manager';
        if (pathname.indexOf('/driver') !== -1) role = 'Driver';
        else if (pathname.indexOf('/rider') !== -1) role = 'Rider';

        var pathParts = pathname.split('/').filter(Boolean);
        var knownSlugs = ['usc', 'stanford', 'ucla', 'uci'];
        var orgSlug = (pathParts.length > 0 && knownSlugs.indexOf(pathParts[0]) !== -1) ? pathParts[0] : null;
        var switchUrl = orgSlug ? '/' + orgSlug : '/demo.html';
        var logoutRedirect = orgSlug ? '/' + orgSlug : '/demo.html';

        var b = document.createElement('div');
        b.id = 'demo-banner';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;height:32px;z-index:99999;background:#1E2B3A;color:#94A3B8;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:12px;font-family:system-ui,sans-serif;';
        b.innerHTML = '<span>\\u25C8 DEMO MODE \\u00B7 Viewing as: <span style="color:#E2E8F0;font-weight:600;">' + role + '</span></span>'
          + '<span><a href="' + switchUrl + '" style="color:#94A3B8;text-decoration:none;margin-right:16px;">Switch Role \\u2197</a>'
          + '<a href="https://ride-ops.com" style="color:#64748B;text-decoration:none;">ride-ops.com</a></span>';
        document.body.prepend(b);

        window.logout = function() {
          fetch('/api/auth/logout', { method: 'POST' }).then(function() {
            window.location.href = logoutRedirect;
          });
        };
      });
    })();
  `);
  });

  // Static files
  app.use(require('express').static(path.join(__dirname, '..', 'public')));
};
