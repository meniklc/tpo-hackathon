const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.isAdmin) {
    return res.status(403).send("Admin access required");
  }
  next();
};

const requireEditor = (req, res, next) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  next();
};

const attachSession = (req, res, next) => {
  res.locals.session = req.session;
  next();
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireEditor,
  attachSession
};
