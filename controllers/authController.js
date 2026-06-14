const bcrypt = require("bcrypt");
const User = require("../models/User");
const auditLog = require("../utils/auditLogger");

exports.getLogin = (req, res) => {
  res.render("login", { title: "Login", error: null });
};

exports.postLogin = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin || user.role === "admin";
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    await auditLog("login", "User", user._id, user.name, req);
    
    if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
    if (user.role === "editor") return res.redirect("/editor/dashboard");
    if (user.role === "manager") return res.redirect("/dashboard");
    return res.redirect("/");
  }
  
  res.render("login", { title: "Login", error: "Invalid credentials" });
};

exports.getRegister = (req, res) => {
  res.render("register", { title: "Register", error: null });
};

exports.postRegister = async (req, res) => {
  const { name, email, password, confirmPassword, role } = req.body;
  
  if (password !== confirmPassword) {
    return res.render("register", {
      title: "Register",
      error: "Passwords do not match",
    });
  }
  
  if (await User.findOne({ email })) {
    return res.render("register", {
      title: "Register",
      error: "Email already exists",
    });
  }
  
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ 
    name, 
    email, 
    password: hashed, 
    role: role || "public",
    isAdmin: role === "admin"
  });
  await user.save();
  
  req.session.userId = user._id;
  req.session.isAdmin = user.isAdmin;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  
  await auditLog("register", "User", user._id, user.name, req);
  
  if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
  if (user.role === "manager") return res.redirect("/dashboard");
  res.redirect("/");
};

exports.logout = (req, res) => {
  req.session.destroy();
  res.redirect("/");
};
