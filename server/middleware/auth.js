function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.session || !req.session.isOwner) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.session || !req.session.isSuperadmin) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

module.exports = { requireAuth, requireOwner, requireSuperadmin };
