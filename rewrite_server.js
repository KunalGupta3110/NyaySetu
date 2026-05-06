const fs = require('fs');

let serverCode = fs.readFileSync('backend/server.js', 'utf8');

// Replace top requires
serverCode = serverCode.replace(
  'const crypto = require("crypto");',
  `const crypto = require("crypto");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const User = require("./models/User");
const Case = require("./models/Case");
const Application = require("./models/Application");

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/nyaysetu")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Connection Error:", err));`
);

// Add rate limit
serverCode = serverCode.replace(
  'app.use(express.static(path.join(__dirname, "..")));',
  `app.use(express.static(path.join(__dirname, "..")));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." }
});
app.use(apiLimiter);`
);

// Remove users.json logic and rewrite /signup and /login
const authStart = serverCode.indexOf('// ================= AUTH ROUTES =================');
const authEnd = serverCode.indexOf('// ================= CHAT ROUTE =================');

const newAuthCode = `// ================= AUTH ROUTES =================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, profile, role } = req.body || {};
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const { salt, hash } = hashPassword(String(password));
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash: hash,
      salt,
      role: role || 'user',
      profile: profile || {}
    });

    res.status(201).json({
      token: createToken(),
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during signup." });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user || !verifyPassword(String(password), user)) {
      return res.status(401).json({ error: "Wrong email or password." });
    }

    res.json({
      token: createToken(),
      user: publicUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during login." });
  }
});

`;

serverCode = serverCode.slice(0, authStart) + newAuthCode + serverCode.slice(authEnd);


// Remove cases/lawyers/applications JSON logic and rewrite lawyer connectivity
const lawyerStart = serverCode.indexOf('// ================= LAWYER CONNECTIVITY =================');
const lawyerEnd = serverCode.indexOf('// ================= SERVER =================');

const newLawyerCode = `// ================= LAWYER CONNECTIVITY =================

app.post("/create-case", async (req, res) => {
  try {
    const { problemType, summary, facts = [], documents = [], userId } = req.body || {};
    
    if (!problemType || !summary) {
      return res.status(400).json({ error: "Missing required case fields." });
    }

    const newCase = await Case.create({
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : undefined,
      problemType,
      summary,
      facts,
      documents,
      status: "open",
      assignedLawyerId: null
    });
    
    res.status(201).json({ id: newCase._id.toString(), ...newCase.toObject() });
  } catch (err) {
    res.status(500).json({ error: "Failed to create case." });
  }
});

app.get("/get-cases/:userId", async (req, res) => {
  try {
    const userCases = await Case.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(userCases);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cases." });
  }
});

app.get("/cases", async (req, res) => {
  try {
    // Return only anonymized data
    const openCases = await Case.find({ status: "open" })
      .select('problemType summary facts location status createdAt')
      .sort({ createdAt: -1 });
      
    res.json(openCases);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch open cases." });
  }
});

app.post("/apply-case", async (req, res) => {
  try {
    const { caseId, lawyerId, role } = req.body || {};
    
    if (role !== "lawyer") {
      return res.status(403).json({ error: "Only lawyers can apply for cases." });
    }
    if (!caseId || !lawyerId) {
      return res.status(400).json({ error: "Missing caseId or lawyerId." });
    }

    const alreadyApplied = await Application.findOne({ caseId, lawyerId });
    if (alreadyApplied) {
      return res.status(400).json({ error: "You have already applied for this case." });
    }

    const newApp = await Application.create({
      caseId,
      lawyerId,
      status: "pending"
    });

    res.status(201).json(newApp);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit application." });
  }
});

app.get("/my-applications/:lawyerId", async (req, res) => {
  try {
    const apps = await Application.find({ lawyerId: req.params.lawyerId })
      .populate({
        path: 'caseId',
        select: 'problemType summary status createdAt' // Anonymized case data
      })
      .sort({ createdAt: -1 });
      
    const enrichedApps = apps.map(app => ({
      _id: app._id,
      id: app._id,
      caseId: app.caseId?._id || app.caseId,
      lawyerId: app.lawyerId,
      status: app.status,
      createdAt: app.createdAt,
      case: app.caseId // Populated object
    }));

    res.json(enrichedApps);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications." });
  }
});

app.get("/case-details/:caseId", async (req, res) => {
  try {
    const { lawyerId } = req.query; // Assume lawyerId is passed in query for now
    
    if (!lawyerId) {
      return res.status(401).json({ error: "Unauthorized access." });
    }

    const lawyer = await User.findById(lawyerId);
    if (!lawyer || lawyer.role !== 'lawyer') {
      return res.status(403).json({ error: "Access denied. Lawyers only." });
    }

    const caseData = await Case.findById(req.params.caseId).populate('userId', 'name email');
    
    if (!caseData) {
      return res.status(404).json({ error: "Case not found." });
    }

    // Security check: only assigned lawyer can see full details
    if (String(caseData.assignedLawyerId) !== String(lawyerId)) {
      return res.status(403).json({ error: "You are not assigned to this case. User identity is hidden until case is assigned." });
    }

    res.json(caseData);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch case details." });
  }
});

app.get("/get-lawyers", async (req, res) => {
  try {
    const lawyers = await User.find({ role: "lawyer" }).limit(6).select('name email profile');
    
    // Map to old structure for frontend compatibility
    const mapped = lawyers.map(l => ({
      id: l._id,
      name: l.name || "Unknown Lawyer",
      specialization: l.profile?.l_spec || "General",
      experience: l.profile?.l_exp ? l.profile.l_exp + " Years" : "Unknown",
      location: l.profile?.l_loc || "Unknown",
      phone: l.profile?.phone || "Unknown"
    }));
    
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lawyers." });
  }
});

app.get("/match-lawyers/:caseId", async (req, res) => {
  try {
    const caseData = await Case.findById(req.params.caseId);
    if (!caseData) return res.status(404).json({ error: "Case not found" });

    // Match logic
    const lawyers = await User.find({ role: "lawyer" }).select('name email profile');
    const mapped = lawyers.map(l => ({
      id: l._id,
      name: l.name || "Unknown Lawyer",
      specialization: l.profile?.l_spec || "General",
      experience: l.profile?.l_exp ? l.profile.l_exp + " Years" : "Unknown",
      location: l.profile?.l_loc || "Unknown",
      phone: l.profile?.phone || "Unknown"
    }));

    let matched = mapped.filter(l => 
      l.specialization.toLowerCase().includes(caseData.problemType.toLowerCase()) ||
      l.specialization.toLowerCase() === "general" || 
      caseData.problemType.toLowerCase() === "general"
    );
    
    if (matched.length === 0) matched = mapped;
    
    res.json({ case: caseData, lawyers: matched.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: "Failed to match lawyers." });
  }
});

`;

serverCode = serverCode.slice(0, lawyerStart) + newLawyerCode + serverCode.slice(lawyerEnd);

// Also remove const USERS_FILE = path.join(__dirname, "users.json"); and its associated functions up to hashPassword
// Wait, we need to carefully replace just the old file dependencies
const fileVarsStart = serverCode.indexOf('const USERS_FILE');
if (fileVarsStart !== -1) {
  const fileVarsEnd = serverCode.indexOf('function publicUser(user)');
  serverCode = serverCode.slice(0, fileVarsStart) + serverCode.slice(fileVarsEnd);
}

fs.writeFileSync('backend/server.js', serverCode);
console.log('Server updated!');
